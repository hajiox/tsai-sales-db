import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRecipeAdminRequest } from "@/lib/recipe-request-auth";
import { createDataAccessAdminClient } from "@/lib/data-access/server";
import { POST as saveRecipe } from "@/app/api/recipe/save/route";

const inputSchema = z.object({ recipeId: z.string().uuid(), versionId: z.string().uuid() }).strict();
const fieldsToRestore = [
  "name", "filling_quantity", "filling_quantity_unit", "label_quantity", "net_content_unit", "storage_method",
  "sterilization_method", "sterilization_temperature", "sterilization_time", "manufacturing_notes", "selling_price",
  "amazon_fee_enabled", "yield_rate", "jan_code", "lot_size", "case_quantity", "case_size", "shelf_life",
  "total_weight",
] as const;

// Reuse the screen's save/recalculate workflow. The caller selects an existing
// version ID; snapshot content is loaded on the server and cannot be substituted.
export async function POST(request: Request) {
  const authError = await requireRecipeAdminRequest(request);
  if (authError) return authError;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "レシピと保存版を確認してください" }, { status: 400 });
  const { recipeId, versionId } = parsed.data;
  try {
    const { data: version, error } = await createDataAccessAdminClient().from("recipe_versions")
      .select("snapshot_recipe,snapshot_items").eq("id", versionId).eq("recipe_id", recipeId).maybeSingle();
    if (error) throw error;
    if (!version) return NextResponse.json({ error: "対象レシピの保存版が見つかりません" }, { status: 404 });
    const snapshot = version.snapshot_recipe;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || !Array.isArray(version.snapshot_items)) {
      return NextResponse.json({ error: "保存版の形式を確認してください" }, { status: 409 });
    }
    const recipeUpdates = Object.fromEntries(fieldsToRestore.filter(field => field in snapshot).map(field => [field, snapshot[field]]));
    const newItems = version.snapshot_items.map((item: Record<string, unknown>) => ({
      item_name: item.item_name, item_type: item.item_type, unit_quantity: item.unit_quantity, unit_price: item.unit_price,
      unit_weight: item.unit_weight, usage_amount: item.usage_amount, cost: item.cost, tax_included: item.tax_included ?? true,
      ingredient_id: item.ingredient_id || null, material_id: item.material_id || null, expense_id: item.expense_id || null,
      intermediate_recipe_id: item.intermediate_recipe_id || null,
    }));
    // This is a direct function call, with the original operation address so the
    // trusted request context remains bound to this exact restore operation.
    return saveRecipe(new Request(request.url, {
      method: "POST", headers: { "Content-Type": "application/json", "Origin": new URL(request.url).origin },
      body: JSON.stringify({ recipeId, replaceAllItems: true, deletedItemIds: [], newItems, existingItems: [], recipeUpdates }),
    }));
  } catch {
    return NextResponse.json({ error: "保存版を復元できませんでした" }, { status: 500 });
  }
}
