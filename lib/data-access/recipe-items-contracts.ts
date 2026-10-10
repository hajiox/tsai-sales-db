import { DataAccessError, isUuid } from "./contracts";

export type RecipeItemsAction = "read" | "prepare" | "apply";
const itemKinds = ["ingredient", "material", "expense", "intermediate", "product"];
const sourceFields = ["ingredient_id", "material_id", "expense_id", "intermediate_recipe_id"];
const numberFields = ["unit_quantity", "unit_price", "usage_amount", "unit_weight"];
const itemFields = ["id", "item_name", "item_type", ...sourceFields, ...numberFields, "tax_included"];
const invalid = (): never => { throw new DataAccessError("INVALID_INPUT", "レシピと配合行の指定を確認してください"); };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid();
}
export function validateRecipeItemsInput(value: unknown): { action: RecipeItemsAction; payload: Record<string, unknown> } {
  const input = object(value);
  if (!["read", "prepare", "apply"].includes(String(input.action))) invalid();
  const action = input.action as RecipeItemsAction;
  if (action === "apply") {
    keys(input, ["action", "id"]);
    if (!isUuid(input.id)) invalid();
  } else {
    keys(input, action === "read" ? ["action", "recipeId"] : ["action", "recipeId", "expectedVersion", "items", "idempotencyKey"]);
    if (!isUuid(input.recipeId)) invalid();
    if (action === "prepare") {
      if (typeof input.expectedVersion !== "string" || !/^[a-f0-9]{32}$/.test(input.expectedVersion)) invalid();
      if (typeof input.idempotencyKey !== "string" || !/^[A-Za-z0-9_.:-]{8,128}$/.test(input.idempotencyKey)) invalid();
      const items = input.items;
      if (!Array.isArray(items) || items.length > 100) return invalid();
      const ids = new Set<string>();
      for (const value of items) {
        const item = object(value);
        keys(item, itemFields);
        if (Object.hasOwn(item, "id")) {
          if (!isUuid(item.id) || ids.has(String(item.id).toLowerCase())) invalid();
          ids.add(String(item.id).toLowerCase());
        } else if (!Object.hasOwn(item, "usage_amount") || !Object.hasOwn(item, "item_type") || (!sourceFields.some(key => item[key] != null) && (typeof item.item_name !== "string" || !item.item_name.trim()))) invalid();
        if (Object.hasOwn(item, "item_type") && !itemKinds.includes(String(item.item_type))) invalid();
        if (Object.hasOwn(item, "item_name") && (typeof item.item_name !== "string" || item.item_name.length > 2000 || item.item_name.includes("\u0000"))) invalid();
        for (const key of sourceFields) if (Object.hasOwn(item, key) && item[key] !== null && !isUuid(item[key])) invalid();
        const sources = sourceFields.filter(key => item[key] != null);
        const sourceForKind = item.item_type === "ingredient" ? "ingredient_id" : item.item_type === "material" ? "material_id" : item.item_type === "expense" ? "expense_id" : "intermediate_recipe_id";
        if (sources.length > 1 || (item.item_type !== undefined && sources.some(key => key !== sourceForKind))) invalid();
        for (const key of numberFields) if (Object.hasOwn(item, key) && item[key] !== null && (typeof item[key] !== "number" || !Number.isFinite(item[key]) || Math.abs(item[key]) > 1e9)) invalid();
        if (Object.hasOwn(item, "tax_included") && item.tax_included !== null && typeof item.tax_included !== "boolean") invalid();
      }
    }
  }
  return { action, payload: Object.fromEntries(Object.entries(input).filter(([key]) => key !== "action")) };
}
