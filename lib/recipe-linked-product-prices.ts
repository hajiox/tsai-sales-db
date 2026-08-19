import { taxIncludedFromExcluded, wholesalePriceFromTaxExcludedRetail } from "@/lib/money";

type SyncResult = {
  webProductSynced: boolean;
  wholesaleProductSynced: boolean;
  oemProductSynced: boolean;
};

function profitRate(price: number, totalCost: unknown): number | null {
  const cost = Number(totalCost);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || cost <= 0) {
    return null;
  }
  return Math.round(((price - cost) / price) * 1000) / 10;
}

async function updateProductPrice(
  supabase: any,
  table: string,
  productId: string,
  price: number,
  includeProfitRate: boolean,
  totalCost: unknown,
) {
  const updateData: Record<string, number | null> = { price };
  if (includeProfitRate) {
    updateData.profit_rate = profitRate(price, totalCost);
  }

  const { error } = await supabase
    .from(table)
    .update(updateData)
    .eq("id", productId);
  if (error) throw error;
}

export async function syncRecipeLinkedProductPrices(
  supabase: any,
  recipeId: string,
): Promise<SyncResult> {
  const result: SyncResult = {
    webProductSynced: false,
    wholesaleProductSynced: false,
    oemProductSynced: false,
  };

  const { data: recipe, error } = await supabase
    .from("recipes")
    .select("selling_price, total_cost, linked_product_id, linked_wholesale_product_id, linked_oem_product_id")
    .eq("id", recipeId)
    .maybeSingle();
  if (error) throw error;
  if (!recipe?.selling_price) return result;

  const sellingPrice = Number(recipe.selling_price);
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) return result;

  if (recipe.linked_product_id) {
    const webPrice = taxIncludedFromExcluded(sellingPrice);
    await updateProductPrice(supabase, "products", recipe.linked_product_id, webPrice, true, recipe.total_cost);
    result.webProductSynced = true;
  }

  if (recipe.linked_wholesale_product_id) {
    const wholesalePrice = wholesalePriceFromTaxExcludedRetail(sellingPrice, 0.7);
    await updateProductPrice(
      supabase,
      "wholesale_products",
      recipe.linked_wholesale_product_id,
      wholesalePrice,
      true,
      recipe.total_cost,
    );
    result.wholesaleProductSynced = true;
  }

  if (recipe.linked_oem_product_id) {
    const oemPrice = taxIncludedFromExcluded(sellingPrice);
    await updateProductPrice(supabase, "wholesale_products", recipe.linked_oem_product_id, oemPrice, true, recipe.total_cost);

    const { error: oemProductError } = await supabase
      .from("oem_products")
      .update({ price: oemPrice })
      .eq("id", recipe.linked_oem_product_id);
    if (oemProductError) throw oemProductError;

    result.oemProductSynced = true;
  }

  return result;
}
