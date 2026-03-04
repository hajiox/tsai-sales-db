-- 単価スナップショット方式への移行
-- web_sales_summary に unit_price, unit_profit_rate カラムを追加
-- 各月の売上データに「その時点の販売単価」を保存することで、
-- 価格変更後も過去データは過去単価で凍結される

ALTER TABLE web_sales_summary ADD COLUMN IF NOT EXISTS unit_price NUMERIC;
ALTER TABLE web_sales_summary ADD COLUMN IF NOT EXISTS unit_profit_rate NUMERIC;

-- 既存データに過去の単価をバックフィル
UPDATE web_sales_summary wss
SET unit_price = COALESCE(
  (SELECT pph.price
   FROM product_price_history pph
   WHERE pph.product_id = wss.product_id
     AND pph.valid_from <= wss.report_month
   ORDER BY pph.valid_from DESC LIMIT 1),
  (SELECT p.price FROM products p WHERE p.id = wss.product_id)
),
unit_profit_rate = (SELECT p.profit_rate FROM products p WHERE p.id = wss.product_id)
WHERE wss.unit_price IS NULL;
