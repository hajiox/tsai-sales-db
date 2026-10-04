-- Accounting ABC data belongs to 食のブランド館分析. Legacy retail-store
-- receipts are preserved as evidence and are never treated as food receipts.
CREATE TABLE IF NOT EXISTS public.food_store_mail_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_month date NOT NULL UNIQUE CHECK (extract(day FROM report_month) = 1),
  destination text NOT NULL DEFAULT 'food-store-analysis' CHECK (destination = 'food-store-analysis'),
  destination_table text NOT NULL DEFAULT 'food_store_sales' CHECK (destination_table = 'food_store_sales'),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  sales_rows jsonb NOT NULL CHECK (jsonb_typeof(sales_rows) = 'array'),
  source_rows jsonb NOT NULL CHECK (jsonb_typeof(source_rows) = 'array'),
  source_row_count integer NOT NULL CHECK (source_row_count > 0),
  row_count integer NOT NULL CHECK (row_count > 0),
  total_sales bigint NOT NULL,
  total_quantity bigint NOT NULL,
  total_gross_profit bigint NOT NULL,
  total_cost_amount bigint NOT NULL,
  unmatched_product_count integer NOT NULL DEFAULT 0,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.food_store_mail_import_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.food_store_mail_imports(id),
  account text NOT NULL CHECK (account = 'ts@ai.aizu-tv.com'),
  sender text NOT NULL CHECK (sender = 'keiri@michinoeki-aizu.com'),
  source_message_id text NOT NULL,
  attachment_name text NOT NULL,
  attachment_sha256 text NOT NULL CHECK (attachment_sha256 ~ '^[a-f0-9]{64}$'),
  received_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account, source_message_id, attachment_name)
);
ALTER TABLE public.food_store_mail_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_store_mail_import_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.food_store_mail_imports, public.food_store_mail_import_sources FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.food_store_mail_imports, public.food_store_mail_import_sources TO service_role;

CREATE OR REPLACE FUNCTION public.import_food_store_mail(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_month date;
  v_rows jsonb := p_input->'salesRows';
  v_existing_rows jsonb;
  v_saved public.food_store_mail_imports%ROWTYPE;
  v_source public.food_store_mail_import_sources%ROWTYPE;
  v_count integer;
  v_sales bigint;
  v_quantity bigint;
  v_gross bigint;
  v_cost bigint;
  v_unmatched integer;
  v_imported boolean := false;
BEGIN
  IF p_input->>'destination' IS DISTINCT FROM 'food-store-analysis'
     OR p_input->>'destinationTable' IS DISTINCT FROM 'food_store_sales'
     OR p_input->>'account' IS DISTINCT FROM 'ts@ai.aizu-tv.com'
     OR p_input->>'sender' IS DISTINCT FROM 'keiri@michinoeki-aizu.com'
     OR coalesce(p_input->>'reportMonth','') !~ '^\d{4}-(0[1-9]|1[0-2])$'
     OR coalesce(p_input->>'contentSha256','') !~ '^[a-f0-9]{64}$'
     OR coalesce(p_input->>'attachmentSha256','') !~ '^[a-f0-9]{64}$'
     OR coalesce(p_input->>'sourceMessageId','') !~ '^[A-Za-z0-9_-]{1,200}$'
     OR coalesce(p_input->>'attachmentName','') = ''
     OR jsonb_typeof(v_rows) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_input->'sourceRows') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'ABC_REVIEW:invalid_request';
  END IF;
  v_month := (p_input->>'reportMonth' || '-01')::date;
  IF jsonb_array_length(v_rows) NOT BETWEEN 1 AND 10000
     OR jsonb_array_length(p_input->'sourceRows') NOT BETWEEN 1 AND 10000
     OR jsonb_array_length(p_input->'sourceRows') <> (p_input->>'sourceRowCount')::integer THEN
    RAISE EXCEPTION 'ABC_REVIEW:invalid_rows';
  END IF;
  SELECT count(*),sum((r->>'total_sales')::bigint),sum((r->>'quantity_sold')::bigint),
    sum((r->>'gross_profit')::bigint),sum((r->>'cost_amount')::bigint)
    INTO v_count,v_sales,v_quantity,v_gross,v_cost FROM jsonb_array_elements(v_rows) r;
  IF v_count <> (SELECT count(DISTINCT (r->>'jan_code')::bigint) FROM jsonb_array_elements(v_rows) r)
     OR v_sales IS DISTINCT FROM (p_input->>'totalSales')::bigint
     OR v_quantity IS DISTINCT FROM (p_input->>'totalQuantity')::bigint
     OR v_gross IS DISTINCT FROM (p_input->>'totalGrossProfit')::bigint
     OR v_cost IS DISTINCT FROM (p_input->>'totalCostAmount')::bigint
     OR v_sales <= 0 OR v_quantity <= 0 OR v_sales-v_cost <> v_gross
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_rows) r
       WHERE coalesce(r->>'product_name','')='' OR coalesce(r->>'jan_code','') !~ '^\d{8,14}$'
         OR (r->>'total_sales')::bigint < 0 OR (r->>'quantity_sold')::bigint < 0
         OR (r->>'total_sales')::bigint-(r->>'cost_amount')::bigint IS DISTINCT FROM (r->>'gross_profit')::bigint)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_input->'sourceRows') r
       WHERE coalesce(r->>'product_name','')='' OR coalesce(r->>'jan_code','') !~ '^\d{8,14}$'
         OR (r->>'total_sales')::bigint < 0 OR (r->>'quantity_sold')::bigint < 0
         OR (r->>'total_sales')::bigint-(r->>'cost_amount')::bigint IS DISTINCT FROM (r->>'gross_profit')::bigint) THEN
    RAISE EXCEPTION 'ABC_REVIEW:amount_mismatch';
  END IF;
  -- JAN-grouped amounts must reconcile, including discount and cost; monthly
  -- totals alone could conceal money or quantities moved to another product.
  IF EXISTS (
    WITH source AS (
      SELECT (r->>'jan_code')::bigint AS jan_code,
        sum((r->>'total_sales')::bigint) AS sales,sum((r->>'quantity_sold')::bigint) AS quantity,
        sum((r->>'gross_profit')::bigint) AS gross,sum((r->>'cost_amount')::bigint) AS cost,
        sum((r->>'discount_amount')::bigint) AS discount,
        min(r->>'product_name') AS name,max(r->>'product_name') AS max_name
      FROM jsonb_array_elements(p_input->'sourceRows') r GROUP BY (r->>'jan_code')::bigint
    ), sales AS (
      SELECT (r->>'jan_code')::bigint AS jan_code,r FROM jsonb_array_elements(v_rows) r
    ) SELECT 1 FROM source FULL JOIN sales USING(jan_code)
      WHERE source.name IS DISTINCT FROM sales.r->>'product_name' OR source.name IS DISTINCT FROM source.max_name
        OR source.sales IS DISTINCT FROM (sales.r->>'total_sales')::bigint
        OR source.quantity IS DISTINCT FROM (sales.r->>'quantity_sold')::bigint
        OR source.gross IS DISTINCT FROM (sales.r->>'gross_profit')::bigint
        OR source.cost IS DISTINCT FROM (sales.r->>'cost_amount')::bigint
        OR source.discount IS DISTINCT FROM (sales.r->>'discount_amount')::bigint
  ) THEN RAISE EXCEPTION 'ABC_REVIEW:amount_mismatch'; END IF;
  LOCK TABLE public.food_store_sales IN SHARE ROW EXCLUSIVE MODE;
  PERFORM pg_advisory_xact_lock(hashtextextended('food-store-mail:' || v_month::text,0));
  SELECT * INTO v_source FROM public.food_store_mail_import_sources
    WHERE account=p_input->>'account' AND source_message_id=p_input->>'sourceMessageId' AND attachment_name=p_input->>'attachmentName';
  IF FOUND AND v_source.attachment_sha256 IS DISTINCT FROM p_input->>'attachmentSha256' THEN
    RAISE EXCEPTION 'ABC_REVIEW:source_hash_conflict';
  END IF;
  SELECT * INTO v_saved FROM public.food_store_mail_imports WHERE report_month=v_month;
  IF FOUND THEN
    IF v_saved.content_sha256 IS DISTINCT FROM p_input->>'contentSha256' THEN RAISE EXCEPTION 'ABC_REVIEW:month_content_conflict'; END IF;
    IF v_source.id IS NOT NULL AND v_source.import_id <> v_saved.id THEN RAISE EXCEPTION 'ABC_REVIEW:source_hash_conflict'; END IF;
    v_rows := v_saved.sales_rows;
  ELSE
    IF v_source.id IS NOT NULL THEN RAISE EXCEPTION 'ABC_REVIEW:source_hash_conflict'; END IF;
    IF EXISTS (SELECT 1 FROM public.food_store_sales WHERE report_month=v_month) THEN RAISE EXCEPTION 'ABC_REVIEW:existing_month_data'; END IF;
    -- Resolve categories against the food JAN master only. Never translate JAN
    -- into retail-store product IDs or overwrite an existing category/rate.
    LOCK TABLE public.food_product_master IN SHARE ROW EXCLUSIVE MODE;
    SELECT count(*) INTO v_unmatched FROM jsonb_array_elements(v_rows) r
      WHERE NOT EXISTS (SELECT 1 FROM public.food_product_master m WHERE m.jan_code=(r->>'jan_code')::bigint);
    SELECT jsonb_agg(to_jsonb(mapped) ORDER BY mapped.jan_code) INTO v_rows FROM (
      SELECT r.jan_code,r.product_name,r.supplier_code,r.supplier_name,r.department_code,r.department_name,
        r.rank,r.unit_price,r.quantity_sold,r.total_sales,r.discount_amount,r.cost_amount,r.gross_profit,
        r.gross_profit_rate,r.composition_ratio,r.cumulative_ratio,r.rank_category,m.category_id
      FROM jsonb_to_recordset(v_rows) AS r(
        jan_code bigint,product_name text,supplier_code integer,supplier_name text,department_code integer,department_name text,
        rank integer,unit_price integer,quantity_sold integer,total_sales integer,discount_amount integer,cost_amount integer,
        gross_profit integer,gross_profit_rate numeric,composition_ratio numeric,cumulative_ratio numeric,rank_category text
      ) LEFT JOIN public.food_product_master m ON m.jan_code=r.jan_code
    ) mapped;
    INSERT INTO public.food_product_master(jan_code,product_name)
      SELECT (r->>'jan_code')::bigint,r->>'product_name' FROM jsonb_array_elements(v_rows) r
      ON CONFLICT (jan_code) DO NOTHING;
    INSERT INTO public.food_store_sales(
      report_month,jan_code,product_name,supplier_code,supplier_name,department_code,department_name,rank,unit_price,
      quantity_sold,total_sales,discount_amount,cost_amount,gross_profit,gross_profit_rate,composition_ratio,cumulative_ratio,rank_category,category_id
    ) SELECT v_month,r.jan_code,r.product_name,r.supplier_code,r.supplier_name,r.department_code,r.department_name,r.rank,r.unit_price,
      r.quantity_sold,r.total_sales,r.discount_amount,r.cost_amount,r.gross_profit,r.gross_profit_rate,r.composition_ratio,r.cumulative_ratio,r.rank_category,r.category_id
      FROM jsonb_to_recordset(v_rows) AS r(
        jan_code bigint,product_name text,supplier_code integer,supplier_name text,department_code integer,department_name text,
        rank integer,unit_price integer,quantity_sold integer,total_sales integer,discount_amount integer,cost_amount integer,
        gross_profit integer,gross_profit_rate numeric,composition_ratio numeric,cumulative_ratio numeric,rank_category text,category_id uuid
      );
    INSERT INTO public.food_store_mail_imports(
      report_month,content_sha256,sales_rows,source_rows,source_row_count,row_count,total_sales,total_quantity,total_gross_profit,total_cost_amount,unmatched_product_count
    ) VALUES(v_month,p_input->>'contentSha256',v_rows,p_input->'sourceRows',(p_input->>'sourceRowCount')::integer,v_count,v_sales,v_quantity,v_gross,v_cost,v_unmatched)
      RETURNING * INTO v_saved;
    v_imported := true;
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(s)-'id'-'report_month'-'created_at' ORDER BY s.jan_code),'[]'::jsonb)
    INTO v_existing_rows FROM public.food_store_sales s WHERE report_month=v_month;
  IF v_existing_rows IS DISTINCT FROM (SELECT jsonb_agg(r ORDER BY (r->>'jan_code')::bigint) FROM jsonb_array_elements(v_rows) r) THEN
    RAISE EXCEPTION 'ABC_REVIEW:stored_dataset_changed';
  END IF;
  INSERT INTO public.food_store_mail_import_sources(import_id,account,sender,source_message_id,attachment_name,attachment_sha256,received_at)
    VALUES(v_saved.id,p_input->>'account',p_input->>'sender',p_input->>'sourceMessageId',p_input->>'attachmentName',p_input->>'attachmentSha256',(p_input->>'receivedAt')::timestamptz)
    ON CONFLICT (account,source_message_id,attachment_name) DO NOTHING;
  RETURN jsonb_build_object(
    'success',true,'status',CASE WHEN v_imported THEN 'imported' ELSE 'already_imported' END,
    'destination',v_saved.destination,'destinationTable',v_saved.destination_table,
    'importId',v_saved.id,'reportMonth',to_char(v_saved.report_month,'YYYY-MM'),
    'rowCount',v_saved.row_count,'sourceRowCount',v_saved.source_row_count,
    'totalSales',v_saved.total_sales,'totalQuantity',v_saved.total_quantity,'totalGrossProfit',v_saved.total_gross_profit,
    'totalCostAmount',v_saved.total_cost_amount,'unmatchedProductCount',v_saved.unmatched_product_count,
    'sourceMessageId',p_input->>'sourceMessageId','attachmentSha256',p_input->>'attachmentSha256','contentSha256',v_saved.content_sha256
  );
END;
$$;
REVOKE ALL ON FUNCTION public.import_food_store_mail(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_food_store_mail(jsonb) TO service_role;
