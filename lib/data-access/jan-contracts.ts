import { DataAccessError, isUuid } from "./contracts";
export type JanAction = "list" | "issue" | "assign" | "update" | "export";
const invalid = (): never => { throw new DataAccessError("INVALID_INPUT", "JANコードの操作と値を確認してください"); };
const keys: Record<JanAction, string[]> = {
 list: ["query", "category", "unassigned", "limit", "offset"],
 issue: ["values", "recipeId", "expectedVersion", "idempotencyKey"],
 assign: ["janId", "recipeId", "expectedVersion", "idempotencyKey"],
 update: ["janId", "values", "expectedVersion", "idempotencyKey"],
 export: ["janId", "format"],
};
function object(value: unknown): Record<string, unknown> {
 if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
 return value as Record<string, unknown>;
}
export function validateJanValues(value: unknown, create: boolean): Record<string, unknown> {
 const values = object(value);
 if (!Object.keys(values).length || Object.keys(values).some(key => !["product_name", "category", "price_excl_tax", "ingredients", "memo"].includes(key))) invalid();
 if (create && (!Object.hasOwn(values, "product_name") || !Object.hasOwn(values, "category"))) invalid();
 for (const [key, entry] of Object.entries(values)) {
  if (key === "category" && !["食品", "物品"].includes(String(entry))) invalid();
  if (key === "product_name" && (typeof entry !== "string" || !entry.trim() || entry.length > 2000 || entry.includes("\0"))) invalid();
  if (["ingredients", "memo"].includes(key) && entry !== null && (typeof entry !== "string" || entry.length > 8000 || entry.includes("\0"))) invalid();
  if (key === "price_excl_tax" && entry !== null && (typeof entry !== "number" || !Number.isFinite(entry) || entry < 0 || entry > 1e9)) invalid();
 }
 return values;
}
export function validateJanInput(value: unknown): { action: JanAction; payload: Record<string, unknown> } {
 const input = object(value);
 if (typeof input.action !== "string" || !Object.hasOwn(keys, input.action)) invalid();
 const action = input.action as JanAction;
 if (Object.keys(input).some(key => key !== "action" && !keys[action].includes(key))) invalid();
 if (action === "list") {
  if (Object.hasOwn(input, "query") && (typeof input.query !== "string" || input.query.length > 200 || input.query.includes("\0"))) invalid();
  if (Object.hasOwn(input, "category") && !["食品", "物品"].includes(String(input.category))) invalid();
  if (Object.hasOwn(input, "unassigned") && typeof input.unassigned !== "boolean") invalid();
  for (const [key, min, max] of [["limit", 1, 100], ["offset", 0, 10000]] as const) if (Object.hasOwn(input, key) && (typeof input[key] !== "number" || !Number.isInteger(input[key]) || input[key] < min || input[key] > max)) invalid();
 } else {
  if (action !== "issue" && !isUuid(input.janId)) invalid();
  if (action === "export") {
   if (Object.hasOwn(input, "format") && !["svg", "eps", "png"].includes(String(input.format))) invalid();
  } else {
   if (typeof input.idempotencyKey !== "string" || !/^[A-Za-z0-9_.:-]{8,128}$/.test(input.idempotencyKey)) invalid();
   const bindsRecipe = action === "assign" || action === "issue" && Object.hasOwn(input, "recipeId");
   if (bindsRecipe && !isUuid(input.recipeId)) invalid();
   if (bindsRecipe || action === "update") {
    if (typeof input.expectedVersion !== "string" || !/^[a-f0-9]{32}$/.test(input.expectedVersion)) invalid();
   } else if (Object.hasOwn(input, "expectedVersion")) invalid();
   if (action === "issue" || action === "update") validateJanValues(input.values, action === "issue");
  }
 }
 return { action, payload: Object.fromEntries(Object.entries(input).filter(([key]) => key !== "action")) };
}
