WITH normalized AS (
  SELECT
    id,
    replace(
      replace(
        replace(
          replace(
            replace(
              translate(shelf_life, '０１２３４５６７８９', '0123456789'),
              'ヶ月',
              'カ月'
            ),
            'か月',
            'カ月'
          ),
          'ヵ月',
          'カ月'
        ),
        'ケ月',
        'カ月'
      ),
      'より',
      'から'
    ) AS value
  FROM public.recipes
  WHERE category = '自社'
    AND shelf_life IS NOT NULL
)
UPDATE public.recipes AS recipes
SET shelf_life = CASE
  WHEN normalized.value LIKE '%60日%' OR normalized.value ~ '2[[:space:]]*カ月' THEN '製造から2カ月'
  WHEN normalized.value ~ '18[[:space:]]*カ月' THEN '製造から18カ月'
  WHEN normalized.value ~ '24[[:space:]]*カ月' OR normalized.value ~ '2[[:space:]]*年' THEN '製造から24カ月'
  WHEN normalized.value ~ '12[[:space:]]*カ月' OR normalized.value ~ '1[[:space:]]*年' THEN '製造から12カ月'
  ELSE recipes.shelf_life
END
FROM normalized
WHERE recipes.id = normalized.id;
