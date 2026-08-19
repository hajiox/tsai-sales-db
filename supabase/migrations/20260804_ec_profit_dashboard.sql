-- Monthly EC settlement deductions used by the WEB sales profit dashboard.
-- Sales, product cost and advertising cost remain in their existing tables so
-- each amount is deducted exactly once.

ALTER TABLE public.web_sales_summary
  ADD COLUMN IF NOT EXISTS unit_cost_ex_ec numeric(16, 4);

CREATE OR REPLACE FUNCTION public.set_web_sales_unit_cost_ex_ec()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_all_in_cost numeric;
  v_has_embedded_amazon_fee boolean;
BEGIN
  v_all_in_cost := GREATEST(
    0,
    COALESCE(NEW.unit_price, 0) * (1 - COALESCE(NEW.unit_profit_rate, 0) / 100.0)
  );
  SELECT COALESCE(bool_or(r.amazon_fee_enabled), false)
    INTO v_has_embedded_amazon_fee
  FROM public.recipes r
  WHERE r.linked_product_id = NEW.product_id;

  NEW.unit_cost_ex_ec := GREATEST(
    0,
    v_all_in_cost - CASE
      WHEN v_has_embedded_amazon_fee THEN COALESCE(NEW.unit_price, 0) * 0.10
      ELSE 0
    END
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_web_sales_unit_cost_ex_ec ON public.web_sales_summary;
CREATE TRIGGER trg_web_sales_unit_cost_ex_ec
BEFORE INSERT OR UPDATE OF product_id, unit_price, unit_profit_rate
ON public.web_sales_summary
FOR EACH ROW
EXECUTE FUNCTION public.set_web_sales_unit_cost_ex_ec();

UPDATE public.web_sales_summary ws
SET unit_cost_ex_ec = GREATEST(
  0,
  COALESCE(ws.unit_price, p.price, 0)
    * (1 - COALESCE(ws.unit_profit_rate, p.profit_rate, 0) / 100.0)
    - CASE WHEN COALESCE(r.amazon_fee_enabled, false)
      THEN COALESCE(ws.unit_price, p.price, 0) * 0.10
      ELSE 0
    END
)
FROM public.products p
LEFT JOIN LATERAL (
  SELECT bool_or(recipe.amazon_fee_enabled) AS amazon_fee_enabled
  FROM public.recipes recipe
  WHERE recipe.linked_product_id = p.id
) r ON true
WHERE ws.product_id = p.id
  AND ws.unit_cost_ex_ec IS NULL;

COMMENT ON COLUMN public.web_sales_summary.unit_cost_ex_ec IS
  'Monthly frozen product cost excluding embedded Amazon/EC fees.';

CREATE TABLE IF NOT EXISTS public.ec_profit_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN (
    'amazon', 'rakuten', 'yahoo', 'mercari', 'base', 'qoo10', 'tiktok'
  )),
  report_month date NOT NULL CHECK (report_month = date_trunc('month', report_month)::date),
  period_start date NOT NULL,
  period_end date NOT NULL CHECK (period_end >= period_start),
  report_basis text NOT NULL DEFAULT 'transaction'
    CHECK (report_basis IN ('order', 'transaction', 'settlement', 'mixed')),
  coverage_level text NOT NULL DEFAULT 'complete'
    CHECK (coverage_level IN ('complete', 'partial', 'needs_review')),
  gross_sales numeric(16, 2) NOT NULL DEFAULT 0 CHECK (gross_sales >= 0),
  refunds numeric(16, 2) NOT NULL DEFAULT 0 CHECK (refunds >= 0),
  platform_fees numeric(16, 2) NOT NULL DEFAULT 0 CHECK (platform_fees >= 0),
  payment_fees numeric(16, 2) NOT NULL DEFAULT 0 CHECK (payment_fees >= 0),
  seller_discounts numeric(16, 2) NOT NULL DEFAULT 0 CHECK (seller_discounts >= 0),
  seller_coupons numeric(16, 2) NOT NULL DEFAULT 0 CHECK (seller_coupons >= 0),
  seller_points numeric(16, 2) NOT NULL DEFAULT 0 CHECK (seller_points >= 0),
  shipping_costs numeric(16, 2) NOT NULL DEFAULT 0 CHECK (shipping_costs >= 0),
  other_costs numeric(16, 2) NOT NULL DEFAULT 0 CHECK (other_costs >= 0),
  other_credits numeric(16, 2) NOT NULL DEFAULT 0 CHECK (other_credits >= 0),
  net_payout numeric(16, 2),
  source_job_id uuid REFERENCES public.web_sales_codex_jobs(id) ON DELETE SET NULL,
  source_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel, report_month)
);

CREATE INDEX IF NOT EXISTS idx_ec_profit_monthly_report_month
  ON public.ec_profit_monthly(report_month, channel);

ALTER TABLE public.ec_profit_monthly ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ec_profit_monthly IS
  'EC statement deductions. Advertising costs are excluded and stored in advertising_costs.';
COMMENT ON COLUMN public.ec_profit_monthly.seller_coupons IS
  'Seller-funded coupons only. Marketplace-funded coupons must not be stored as a deduction.';
COMMENT ON COLUMN public.ec_profit_monthly.shipping_costs IS
  'Carrier, fulfilment or shipping charges billed to the seller. Customer shipping revenue is part of gross sales.';

ALTER TABLE public.web_sales_codex_jobs
  DROP CONSTRAINT IF EXISTS web_sales_codex_jobs_task_key_check;
ALTER TABLE public.web_sales_codex_jobs
  ADD CONSTRAINT web_sales_codex_jobs_task_key_check
  CHECK (task_key IN ('connection_test', 'web_sales_import', 'ad_cost_import', 'ec_profit_import'));

ALTER TABLE public.web_sales_codex_jobs
  DROP CONSTRAINT IF EXISTS web_sales_codex_jobs_period_check;
ALTER TABLE public.web_sales_codex_jobs
  ADD CONSTRAINT web_sales_codex_jobs_period_check CHECK (
    (task_key = 'connection_test' AND period_start IS NULL AND period_end IS NULL AND report_month IS NULL)
    OR
    (task_key IN ('web_sales_import', 'ad_cost_import', 'ec_profit_import')
      AND channel IS NOT NULL
      AND period_start IS NOT NULL
      AND period_end IS NOT NULL
      AND period_end >= period_start
      AND report_month = date_trunc('month', report_month)::date)
  );
