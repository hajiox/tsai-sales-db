-- Preserve recipe-based monthly cost snapshots during channel reimports.
DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.replace_web_sales_channel_summary(text,date,jsonb)'::regprocedure) INTO definition;
  IF position('unit_price = EXCLUDED.unit_price' in definition) > 0 THEN
    definition := replace(definition, 'unit_price = EXCLUDED.unit_price',
      'unit_price = COALESCE(web_sales_summary.unit_price, EXCLUDED.unit_price)');
    definition := replace(definition, 'unit_profit_rate = EXCLUDED.unit_profit_rate',
      'unit_profit_rate = COALESCE(web_sales_summary.unit_profit_rate, EXCLUDED.unit_profit_rate)');
    EXECUTE definition;
  ELSIF position('COALESCE(web_sales_summary.unit_price, EXCLUDED.unit_price)' in definition) = 0 THEN
    RAISE EXCEPTION 'Unknown summary replacement definition';
  END IF;

  SELECT pg_get_functiondef('public.set_web_sales_unit_cost_ex_ec()'::regprocedure) INTO definition;
  IF position('-- preserve unchanged snapshot' in definition) = 0 THEN
    definition := replace(definition, E'BEGIN\n', E'BEGIN\n  -- preserve unchanged snapshot\n  IF TG_OP = ''UPDATE'' THEN\n    IF NEW.product_id = OLD.product_id\n      AND NEW.unit_price IS NOT DISTINCT FROM OLD.unit_price\n      AND NEW.unit_profit_rate IS NOT DISTINCT FROM OLD.unit_profit_rate\n      AND OLD.unit_cost_ex_ec IS NOT NULL THEN\n      NEW.unit_cost_ex_ec := OLD.unit_cost_ex_ec;\n      RETURN NEW;\n    END IF;\n  END IF;\n');
    IF position('-- preserve unchanged snapshot' in definition) = 0 THEN
      RAISE EXCEPTION 'Unknown cost trigger definition';
    END IF;
    EXECUTE definition;
  END IF;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.recipe_sales_price_checks(p_product_id uuid)
RETURNS TABLE(channel text, report_month date, period_start date, period_end date,
  external_product_key text, source_name text, product_name text,
  reference_price numeric, average_price numeric, quantity numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  WITH latest AS (
    SELECT DISTINCT ON (channel) id, channel, report_month, period_start, period_end
    FROM public.web_sales_sync_runs
    WHERE status = 'success'
    ORDER BY channel, report_month DESC, created_at DESC
  )
  SELECT r.channel, r.report_month, r.period_start, r.period_end,
    i.external_product_key, max(i.external_product_name), p.name,
    coalesce(s.unit_price, p.price)::numeric,
    round(sum(i.amount)::numeric / nullif(sum(i.quantity), 0), 2), sum(i.quantity)::numeric
  FROM latest r
  JOIN public.web_sales_sync_items i ON i.run_id = r.id
  JOIN public.web_sales_external_mappings m ON m.channel = r.channel AND m.external_product_key = i.external_product_key
  JOIN public.products p ON p.id = m.product_id
  LEFT JOIN public.web_sales_summary s ON s.product_id = p.id AND s.report_month = r.report_month
  WHERE p.id = p_product_id AND i.quantity > 0
  GROUP BY r.channel, r.report_month, r.period_start, r.period_end,
    i.external_product_key, p.name, s.unit_price, p.price;
$function$;
REVOKE ALL ON FUNCTION public.recipe_sales_price_checks(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recipe_sales_price_checks(uuid) TO service_role;

-- Verified Yahoo two-pack was mapped to the recipe's single item.
-- Fail closed if the audited August state changed; do not rewrite other months.
DO $repair$
DECLARE old_id uuid := '14adb6e1-5b6c-406c-a9b1-04e52c7bff69';
  new_id uuid := 'e84d1db2-4c0c-46cf-924e-8faa8fa2b0b2'; mapped_id uuid;
BEGIN
  SELECT product_id INTO mapped_id FROM public.web_sales_external_mappings
    WHERE channel = 'yahoo' AND external_product_key = '4571318634806' FOR UPDATE;
  IF mapped_id = new_id THEN RETURN; END IF;
  IF mapped_id IS DISTINCT FROM old_id THEN RAISE EXCEPTION 'Unexpected two-pack mapping'; END IF;
  PERFORM 1 FROM public.products WHERE id = new_id AND name LIKE '%2個セット%';
  IF NOT FOUND THEN RAISE EXCEPTION 'Two-pack target not verified'; END IF;
  PERFORM 1 FROM public.web_sales_summary WHERE product_id = old_id AND report_month = '2026-08-01' AND yahoo_count = 31 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Audited single-item quantity changed'; END IF;
  PERFORM 1 FROM public.web_sales_summary WHERE product_id = new_id AND report_month = '2026-08-01' AND yahoo_count = 0 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Audited two-pack quantity changed'; END IF;
  UPDATE public.web_sales_summary SET yahoo_count = 0 WHERE product_id = old_id AND report_month = '2026-08-01';
  UPDATE public.web_sales_summary SET yahoo_count = 31 WHERE product_id = new_id AND report_month = '2026-08-01';
  UPDATE public.web_sales_external_mappings SET product_id = new_id, updated_at = now()
    WHERE channel = 'yahoo' AND external_product_key = '4571318634806';
  UPDATE public.yahoo_product_mapping SET product_id = new_id::text
    WHERE product_id = old_id::text AND yahoo_title LIKE '%2個セット%';
END;
$repair$;
