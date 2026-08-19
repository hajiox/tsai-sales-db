-- 税込優先入力は税抜価格を小数4桁で保存するため、税込履歴は整数化前の税抜価格から算出する。
CREATE OR REPLACE FUNCTION public.record_recipe_ec_price_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.selling_price IS DISTINCT FROM NEW.selling_price
    AND COALESCE(OLD.selling_price, 0) > 0
    AND COALESCE(NEW.selling_price, 0) > 0 THEN
    INSERT INTO public.recipe_ec_price_revisions (
      recipe_id,
      previous_price_ex_tax,
      new_price_ex_tax,
      previous_price_incl_tax,
      new_price_incl_tax,
      recipe_snapshot
    ) VALUES (
      NEW.id,
      OLD.selling_price,
      NEW.selling_price,
      floor(OLD.selling_price * 1.08)::integer,
      floor(NEW.selling_price * 1.08)::integer,
      jsonb_build_object(
        'recipeId', NEW.id::text,
        'recipeName', left(btrim(COALESCE(NEW.name, '')), 200),
        'ecProductName', CASE WHEN NULLIF(btrim(COALESCE(NEW.ec_product_name, '')), '') IS NULL THEN NULL ELSE left(btrim(NEW.ec_product_name), 200) END,
        'linkedProductId', CASE WHEN NEW.linked_product_id IS NULL THEN NULL ELSE left(NEW.linked_product_id::text, 100) END,
        'janCode', CASE WHEN NULLIF(btrim(COALESCE(NEW.jan_code, '')), '') IS NULL THEN NULL ELSE left(btrim(NEW.jan_code), 32) END,
        'seriesCode', CASE WHEN NEW.series_code IS NULL THEN NULL ELSE left(btrim(NEW.series_code::text), 100) END,
        'productCode', CASE WHEN NEW.product_code IS NULL THEN NULL ELSE left(btrim(NEW.product_code::text), 100) END,
        'fillingQuantity', CASE WHEN NEW.filling_quantity IS NULL THEN NULL ELSE left(btrim(NEW.filling_quantity::text), 50) END,
        'fillingQuantityUnit', CASE WHEN NULLIF(btrim(COALESCE(NEW.filling_quantity_unit, '')), '') IS NULL THEN NULL ELSE left(btrim(NEW.filling_quantity_unit), 30) END,
        'storageMethod', CASE WHEN NULLIF(btrim(COALESCE(NEW.storage_method, '')), '') IS NULL THEN NULL ELSE left(btrim(NEW.storage_method), 100) END,
        'newPriceExTax', floor(NEW.selling_price)::integer,
        'newPriceInclTax', floor(NEW.selling_price * 1.08)::integer
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
