-- A successful mail receipt and its complete monthly dataset commit together.
CREATE TABLE IF NOT EXISTS public.brand_store_mail_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_month date NOT NULL UNIQUE CHECK (extract(day FROM report_month) = 1),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  sales_rows jsonb NOT NULL CHECK (jsonb_typeof(sales_rows) = 'array'),
  source_rows jsonb NOT NULL CHECK (jsonb_typeof(source_rows) = 'array'),
  source_row_count integer NOT NULL CHECK (source_row_count > 0),
  row_count integer NOT NULL CHECK (row_count > 0),
  total_sales bigint NOT NULL,
  total_quantity bigint NOT NULL,
  total_gross_profit bigint NOT NULL,
  total_cost_amount bigint,
  unmatched_product_count integer NOT NULL DEFAULT 0,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.brand_store_mail_import_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.brand_store_mail_imports(id),
  account text NOT NULL CHECK (account = 'ts@ai.aizu-tv.com'),
  sender text NOT NULL CHECK (sender = 'keiri@michinoeki-aizu.com'),
  source_message_id text NOT NULL,
  attachment_name text NOT NULL,
  attachment_sha256 text NOT NULL CHECK (attachment_sha256 ~ '^[a-f0-9]{64}$'),
  received_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account, source_message_id, attachment_name)
);
ALTER TABLE public.brand_store_mail_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_store_mail_import_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.brand_store_mail_imports, public.brand_store_mail_import_sources FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.brand_store_mail_imports, public.brand_store_mail_import_sources TO service_role;

CREATE OR REPLACE FUNCTION public.import_brand_store_mail(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_month date;
  v_rows jsonb := p_input->'salesRows';
  v_existing_rows jsonb;
  v_saved public.brand_store_mail_imports%ROWTYPE;
  v_source public.brand_store_mail_import_sources%ROWTYPE;
  v_count integer;
  v_sales bigint;
  v_quantity bigint;
  v_gross bigint;
  v_imported boolean := false;
BEGIN
  IF p_input->>'account' IS DISTINCT FROM 'ts@ai.aizu-tv.com'
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
  SELECT count(*), sum((r->>'total_sales')::bigint), sum((r->>'quantity_sold')::bigint), sum((r->>'gross_profit')::bigint)
    INTO v_count,v_sales,v_quantity,v_gross FROM jsonb_array_elements(v_rows) r;
  IF v_count <> (SELECT count(DISTINCT r->>'product_name') FROM jsonb_array_elements(v_rows) r)
     OR v_sales IS DISTINCT FROM (p_input->>'totalSales')::bigint
     OR v_quantity IS DISTINCT FROM (p_input->>'totalQuantity')::bigint
     OR v_gross IS DISTINCT FROM (p_input->>'totalGrossProfit')::bigint
     OR v_sales <= 0 OR v_quantity <= 0
     OR (SELECT sum((r->>'totalSales')::bigint) FROM jsonb_array_elements(p_input->'sourceRows') r) IS DISTINCT FROM v_sales
     OR (SELECT sum((r->>'quantitySold')::bigint) FROM jsonb_array_elements(p_input->'sourceRows') r) IS DISTINCT FROM v_quantity
     OR (SELECT sum((r->>'grossProfit')::bigint) FROM jsonb_array_elements(p_input->'sourceRows') r) IS DISTINCT FROM v_gross
     OR (SELECT sum((r->>'costAmount')::bigint) FROM jsonb_array_elements(p_input->'sourceRows') r) IS DISTINCT FROM (p_input->>'totalCostAmount')::bigint
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_rows) r WHERE coalesce(r->>'product_name','')='' OR (r->>'total_sales')::bigint < 0 OR (r->>'quantity_sold')::bigint < 0) THEN
    RAISE EXCEPTION 'ABC_REVIEW:amount_mismatch';
  END IF;
  -- This table lock also serializes the legacy manual DELETE/INSERT statements
  -- while checking and saving a receipt. Later edits invalidate safe retries.
  LOCK TABLE public.brand_store_sales IN SHARE ROW EXCLUSIVE MODE;
  PERFORM pg_advisory_xact_lock(hashtextextended('brand-store-mail:' || v_month::text,0));
  SELECT * INTO v_source FROM public.brand_store_mail_import_sources
    WHERE account=p_input->>'account' AND source_message_id=p_input->>'sourceMessageId' AND attachment_name=p_input->>'attachmentName';
  IF FOUND AND v_source.attachment_sha256 IS DISTINCT FROM p_input->>'attachmentSha256' THEN
    RAISE EXCEPTION 'ABC_REVIEW:source_hash_conflict';
  END IF;
  SELECT * INTO v_saved FROM public.brand_store_mail_imports WHERE report_month=v_month;
  IF FOUND THEN
    IF v_saved.content_sha256 IS DISTINCT FROM p_input->>'contentSha256' THEN
      RAISE EXCEPTION 'ABC_REVIEW:month_content_conflict';
    END IF;
    IF v_source.id IS NOT NULL AND v_source.import_id <> v_saved.id THEN
      RAISE EXCEPTION 'ABC_REVIEW:source_hash_conflict';
    END IF;
    v_rows := v_saved.sales_rows;
  ELSE
    IF v_source.id IS NOT NULL THEN RAISE EXCEPTION 'ABC_REVIEW:source_hash_conflict'; END IF;
    IF EXISTS (SELECT 1 FROM public.brand_store_sales WHERE report_month=v_month) THEN
      RAISE EXCEPTION 'ABC_REVIEW:existing_month_data';
    END IF;
    INSERT INTO public.brand_store_sales (
      product_name,category,tax_type,total_sales,sales_ratio,gross_profit,gross_profit_ratio,
      quantity_sold,quantity_ratio,returned_quantity,return_ratio,product_id,product_code,barcode,report_month
    ) SELECT r.product_name,r.category,r.tax_type,r.total_sales,r.sales_ratio,r.gross_profit,r.gross_profit_ratio,
             r.quantity_sold,r.quantity_ratio,r.returned_quantity,r.return_ratio,r.product_id,r.product_code,r.barcode,v_month
      FROM jsonb_to_recordset(v_rows) AS r(
        product_name text,category text,tax_type text,total_sales integer,sales_ratio numeric,gross_profit integer,gross_profit_ratio numeric,
        quantity_sold integer,quantity_ratio numeric,returned_quantity integer,return_ratio numeric,product_id integer,product_code text,barcode text
      );
    INSERT INTO public.brand_store_mail_imports (
      report_month,content_sha256,sales_rows,source_rows,source_row_count,row_count,total_sales,total_quantity,total_gross_profit,total_cost_amount,unmatched_product_count
    ) VALUES (
      v_month,p_input->>'contentSha256',v_rows,p_input->'sourceRows',(p_input->>'sourceRowCount')::integer,v_count,v_sales,v_quantity,v_gross,
      (p_input->>'totalCostAmount')::bigint,coalesce((p_input->>'unmatchedProductCount')::integer,0)
    ) RETURNING * INTO v_saved;
    v_imported := true;
  END IF;
  -- Compare every stored column of every row, including product identity and
  -- category. Equal counts and totals alone are insufficient for a receipt.
  SELECT coalesce(jsonb_agg(to_jsonb(s)-'id'-'report_month'-'created_at' ORDER BY s.product_name),'[]'::jsonb)
    INTO v_existing_rows FROM public.brand_store_sales s WHERE report_month=v_month;
  IF v_existing_rows IS DISTINCT FROM (SELECT jsonb_agg(r ORDER BY r->>'product_name') FROM jsonb_array_elements(v_rows) r) THEN
    RAISE EXCEPTION 'ABC_REVIEW:stored_dataset_changed';
  END IF;
  INSERT INTO public.brand_store_mail_import_sources (
    import_id,account,sender,source_message_id,attachment_name,attachment_sha256,received_at
  ) VALUES (
    v_saved.id,p_input->>'account',p_input->>'sender',p_input->>'sourceMessageId',p_input->>'attachmentName',p_input->>'attachmentSha256',(p_input->>'receivedAt')::timestamptz
  ) ON CONFLICT (account,source_message_id,attachment_name) DO NOTHING;
  RETURN jsonb_build_object(
    'success',true,'status',CASE WHEN v_imported THEN 'imported' ELSE 'already_imported' END,
    'importId',v_saved.id,'reportMonth',to_char(v_saved.report_month,'YYYY-MM'),
    'rowCount',v_saved.row_count,'sourceRowCount',v_saved.source_row_count,
    'totalSales',v_saved.total_sales,'totalQuantity',v_saved.total_quantity,'totalGrossProfit',v_saved.total_gross_profit,
    'totalCostAmount',v_saved.total_cost_amount,'unmatchedProductCount',v_saved.unmatched_product_count,
    'sourceMessageId',p_input->>'sourceMessageId','attachmentSha256',p_input->>'attachmentSha256',
    'contentSha256',v_saved.content_sha256
  );
END;
$$;
REVOKE ALL ON FUNCTION public.import_brand_store_mail(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_brand_store_mail(jsonb) TO service_role;
