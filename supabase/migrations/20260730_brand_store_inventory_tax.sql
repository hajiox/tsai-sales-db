BEGIN;

ALTER TABLE public.product_master
  ADD COLUMN IF NOT EXISTS tax_rate smallint;

ALTER TABLE public.product_master
  DROP CONSTRAINT IF EXISTS product_master_tax_rate_check,
  ADD CONSTRAINT product_master_tax_rate_check
    CHECK (tax_rate IS NULL OR tax_rate IN (8, 10));

ALTER TABLE public.brand_store_inventory_items
  ADD COLUMN IF NOT EXISTS tax_rate smallint;

ALTER TABLE public.brand_store_inventory_items
  DROP CONSTRAINT IF EXISTS brand_store_inventory_items_tax_rate_check,
  ADD CONSTRAINT brand_store_inventory_items_tax_rate_check
    CHECK (tax_rate IS NULL OR tax_rate IN (8, 10));

WITH latest_sales AS (
  SELECT DISTINCT ON (product_id)
    product_id,
    category
  FROM public.brand_store_sales
  WHERE product_id IS NOT NULL
  ORDER BY product_id, report_month DESC, created_at DESC
)
UPDATE public.brand_store_inventory_items AS item
SET tax_rate = CASE
  WHEN item.is_manual THEN 8
  WHEN item.product_name LIKE ANY (ARRAY[
    '%せっけん%', '%石けん%', '%石鹸%', '%ワッペン%', '%ストラップ%',
    '%キーホルダー%', '%ポストカード%', '%エコバッグ%', '%マルシェバッグ%',
    '%箸%', '%スプーン%', '%フォーク%', '%皿%', '%椀%', '%グラス%', '%花札%',
    '%メモ帳%', '%ノート%', '%金封%', '%折り紙%', '%精油%', '%製油%',
    '%スプレー%', '%ディフューザー%'
  ]) THEN 10
  WHEN latest.category IN (
    'TS自社商品',
    'Daily prime quality シリーズ',
    '既存業者【その他】',
    '2 久保田商会',
    '3 ハニー松本',
    '14 おくや',
    '16 五十嵐製麺',
    '34 会津山塩企業組合',
    '43 会津畜産',
    '78 檜枝岐養蜂場',
    '96 株式会社江川米菓店',
    '110 奈良屋',
    '187 Tregion株式会社',
    '191 小高工房',
    '192 福島りょうぜん漬け本舗',
    '194 有限会社５.SHES',
    '198 会津ブランド馬肉さくらの会',
    '199 清水薬草有限会社',
    '202 松葉屋商店'
  ) THEN 8
  ELSE 10
END
FROM latest_sales AS latest
WHERE item.source_product_id = latest.product_id
  AND item.tax_rate IS NULL;

UPDATE public.brand_store_inventory_items
SET tax_rate = CASE
  WHEN product_name LIKE ANY (ARRAY[
    '%せっけん%', '%石けん%', '%石鹸%', '%ワッペン%', '%ストラップ%',
    '%キーホルダー%', '%ポストカード%', '%エコバッグ%', '%マルシェバッグ%',
    '%箸%', '%スプーン%', '%フォーク%', '%皿%', '%椀%', '%グラス%', '%花札%',
    '%メモ帳%', '%ノート%', '%金封%', '%折り紙%', '%精油%', '%製油%',
    '%スプレー%', '%ディフューザー%'
  ]) THEN 10
  WHEN is_manual
    OR product_name LIKE ANY (ARRAY[
      '%ラーメン%', '%カレー%', '%チャーシュー%', '%ソース%', '%ドレッシング%',
      '%みそ%', '%味噌%', '%しょうゆ%', '%醤油%', '%塩%', '%そば%', '%麺%',
      '%豆%', '%蜂蜜%', '%はちみつ%', '%コーヒー%', '%ドリップ%', '%茶%',
      '%人蔘%', '%人参%', '%漬%', '%ふりかけ%', '%煮干%', '%ジャーキー%',
      '%ソーセージ%', '%せんべい%', '%米%', '%麩%', '%一味%', '%辛油%',
      '%柚子胡椒%', '%マスタード%', '%ピーナ%'
    ]) THEN 8
  ELSE 10
END
WHERE tax_rate IS NULL;

ALTER TABLE public.brand_store_inventory_items
  ALTER COLUMN tax_rate SET DEFAULT 10,
  ALTER COLUMN tax_rate SET NOT NULL;

WITH latest_inventory_tax AS (
  SELECT DISTINCT ON (item.source_product_id)
    item.source_product_id,
    item.tax_rate
  FROM public.brand_store_inventory_items AS item
  JOIN public.brand_store_inventory_counts AS inventory
    ON inventory.id = item.inventory_id
  WHERE item.source_product_id IS NOT NULL
  ORDER BY item.source_product_id, inventory.fiscal_year DESC, item.updated_at DESC
)
UPDATE public.product_master AS product
SET tax_rate = source.tax_rate
FROM latest_inventory_tax AS source
WHERE product.product_id = source.source_product_id
  AND product.tax_rate IS NULL;

CREATE TABLE IF NOT EXISTS public.brand_store_inventory_wholesale_tax_backup (
  item_id uuid PRIMARY KEY,
  inventory_id uuid NOT NULL,
  wholesale_price_before numeric(12, 2) NOT NULL,
  assigned_tax_rate smallint NOT NULL,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE public.brand_store_inventory_wholesale_tax_backup
  FROM anon, authenticated;

INSERT INTO public.brand_store_inventory_wholesale_tax_backup (
  item_id,
  inventory_id,
  wholesale_price_before,
  assigned_tax_rate
)
SELECT
  id,
  inventory_id,
  wholesale_price,
  tax_rate
FROM public.brand_store_inventory_items
WHERE wholesale_price IS NOT NULL
ON CONFLICT (item_id) DO NOTHING;

UPDATE public.brand_store_inventory_items AS item
SET wholesale_price = ROUND(
  backup.wholesale_price_before / (1 + backup.assigned_tax_rate / 100.0),
  2
)
FROM public.brand_store_inventory_wholesale_tax_backup AS backup
WHERE item.id = backup.item_id
  AND item.wholesale_price IN (
    backup.wholesale_price_before,
    CEIL(backup.wholesale_price_before / (1 + backup.assigned_tax_rate / 100.0))
  );

CREATE INDEX IF NOT EXISTS idx_brand_store_inventory_items_tax_sort
  ON public.brand_store_inventory_items (inventory_id, tax_rate, sort_order, product_name);

COMMIT;
