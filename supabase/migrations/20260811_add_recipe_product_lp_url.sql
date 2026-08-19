ALTER TABLE public.recipes
ADD COLUMN IF NOT EXISTS product_lp_url text;

COMMENT ON COLUMN public.recipes.product_lp_url IS
'ネット専用レシピに対応する商品ランディングページURL';

-- /links と各LPの商品ラインナップを照合できた既存商品のみ初期登録する。
-- すでに手動登録されたURLは上書きしない。
WITH resolved_product_lps AS (
  SELECT
    id,
    CASE
      WHEN series_code = 1 AND product_code = 2 THEN 'https://wakeari.aizu-syokubura.com/'
      WHEN series_code = 1 AND product_code = 4 THEN 'https://cutchashu.aizu-syokubura.com/'
      WHEN series_code = 2 AND product_code = 1 THEN 'https://chasieu.aizu-syokubura.com/'
      WHEN series_code = 2 AND product_code = 2 THEN 'https://retortbara.aizu-syokubura.com/'
      WHEN series_code = 2 AND product_code = 3 THEN 'https://kiriotoshi.aizubrandhall-lp.com/'
      WHEN series_code = 3 THEN 'https://kitakata.aizubrandhall-lp2.com/'
      WHEN series_code = 4 THEN 'https://01.aizubrandhall-lp2.com/yamajio'
      WHEN series_code = 5 THEN 'https://buta.aizubrandhall-lp2.com/'
      WHEN series_code = 6 THEN 'https://ie-k.aizubrandhall-lp2.com/'
      WHEN series_code = 7 THEN 'https://tsukemen.aizubrandhall-lp2.com/'
      WHEN series_code = 9 AND product_code IN (3, 4, 5, 9, 10, 11) THEN 'https://kitakatamen.aizu-syokubura.com/'
      WHEN series_code = 9 AND product_code IN (6, 7) THEN 'https://www.aizubrandhall-lp2.com/futomenyakisoba'
      WHEN series_code = 10 THEN 'https://karasugike.aizubrandhall-lp2.com/'
      WHEN series_code = 11 THEN 'https://01.aizubrandhall-lp2.com/sauceKatsudon'
      WHEN series_code = 14 AND product_code IN (1, 3) THEN 'https://umamiso.aizu-syokubura.com/'
      WHEN series_code = 15 AND product_code = 9 THEN 'https://www.aizubrandhall-lp2.com/takikomimeshi'
      WHEN series_code = 17 THEN 'https://www.aizubrandhall-lp2.com/basashi'
      WHEN series_code = 18 AND product_code = 6 THEN 'https://mishirazu.aizu-syokubura.com/'
      WHEN series_code = 18 AND product_code = 7 THEN 'https://chasieu.aizu-syokubura.com/'
      WHEN series_code = 19 THEN 'https://hayamakougenton.aizubrandhall-lp2.com/'
      WHEN series_code = 20 THEN 'https://karamiso.aizubrandhall-lp2.com/'
      WHEN series_code = 21 AND product_code IN (1, 2) THEN 'https://seabura.aizubrandhall-lp2.com/'
      WHEN series_code = 23 THEN 'https://kitakataseabura.aizu-syokubura.com/'
      WHEN series_code = 24 AND product_code = 1 THEN 'https://akumacurry.aizu-syokubura.com/'
      WHEN series_code = 24 AND product_code = 2 THEN 'https://akumameshi.aizu-syokubura.com/'
      WHEN series_code = 27 THEN 'https://ayuniboshi.aizu-syokubura.com/'
      ELSE NULL
    END AS lp_url
  FROM public.recipes
  WHERE category = 'ネット専用'
)
UPDATE public.recipes AS recipe
SET product_lp_url = resolved.lp_url
FROM resolved_product_lps AS resolved
WHERE recipe.id = resolved.id
  AND resolved.lp_url IS NOT NULL
  AND NULLIF(BTRIM(recipe.product_lp_url), '') IS NULL;
