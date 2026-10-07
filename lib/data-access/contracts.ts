export const DATA_ACCESS_RESOURCES = ["recipes", "ingredients", "materials", "expenses", "reviews", "sales"] as const;
export type DataAccessResource = typeof DATA_ACCESS_RESOURCES[number];
export const DATA_ACCESS_SCOPES = DATA_ACCESS_RESOURCES.flatMap((resource) =>
  ["reviews", "sales"].includes(resource) ? [`${resource}:read`] : [`${resource}:read`, `${resource}:write`],
);

export const NORMAL_WRITE_FIELDS = {
  recipes: ["manufacturing_notes", "web_description", "product_points"],
  ingredients: ["manufacturer", "product_description"],
  materials: ["supplier", "notes"],
  expenses: ["notes"],
} as const;

const TEXT_FIELDS = {
  recipes: ["name", "category", "manufacturing_notes", "web_description", "product_points", "storage_method", "shelf_life", "filling_quantity", "filling_quantity_unit", "label_quantity", "net_content_unit", "sterilization_method", "sterilization_temperature", "sterilization_time", "ingredient_label"],
  ingredients: ["name", "raw_materials", "allergens", "origin", "manufacturer", "product_description", "nutrition_per"],
  materials: ["name", "unit_quantity", "supplier", "notes"],
  expenses: ["name", "notes"],
} as const;
const CREATE_NUMBER_FIELDS = {
  recipes: ["selling_price", "total_weight", "yield_rate", "lot_size", "case_quantity"],
  ingredients: ["unit_quantity", "price", "calories", "protein", "fat", "carbohydrate", "sodium", "salt"],
  materials: ["price"],
  expenses: ["unit_price", "unit_quantity"],
} as const;
const CREATE_BOOLEAN_FIELDS = { recipes: ["is_intermediate"], ingredients: ["tax_included"], materials: ["tax_included"], expenses: ["tax_included"] } as const;
export type WritableResource = keyof typeof TEXT_FIELDS;
export type ReadInput = { resource: DataAccessResource; query?: string; id?: string; limit: number; cursor?: string; from?: string; to?: string };
export type ChangeInput = { resource: WritableResource; operation: "create" | "update"; id?: string; expectedVersion?: string; values: Record<string, unknown>; idempotencyKey: string };
export class DataAccessError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DataAccessError("INVALID_INPUT", "オブジェクト形式で指定してください");
  return value as Record<string, unknown>;
}
function keys(input: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new DataAccessError("INVALID_INPUT", "未対応の項目が含まれています");
}
function optionalUuid(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (!isUuid(value)) throw new DataAccessError("INVALID_INPUT", `${label}はUUIDで指定してください`);
  return value.toLowerCase();
}
function date(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new DataAccessError("INVALID_INPUT", "日付はYYYY-MM-DDで指定してください");
  return value;
}
export function validateReadInput(value: unknown): ReadInput {
  const input = object(value);
  keys(input, ["resource", "query", "id", "limit", "cursor", "from", "to"]);
  if (!DATA_ACCESS_RESOURCES.includes(input.resource as DataAccessResource)) throw new DataAccessError("INVALID_INPUT", "未対応のデータ種類です");
  const resource = input.resource as DataAccessResource;
  const limit = input.limit === undefined ? 25 : input.limit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new DataAccessError("INVALID_INPUT", "取得件数は1〜100です");
  if (input.query !== undefined && (typeof input.query !== "string" || input.query.length > 200)) throw new DataAccessError("INVALID_INPUT", "検索語は200文字以内です");
  const from = date(input.from), to = date(input.to);
  if ((from || to) && !["reviews", "sales"].includes(resource)) throw new DataAccessError("INVALID_INPUT", "このデータ種類は期間検索に対応していません");
  if (from && to && from > to) throw new DataAccessError("INVALID_INPUT", "開始日と終了日を確認してください");
  if (resource === "sales" && input.query !== undefined) throw new DataAccessError("INVALID_INPUT", "売上検索はIDまたは期間で指定してください");
  return { resource, limit, ...(input.query !== undefined ? { query: input.query as string } : {}), ...(input.id !== undefined ? { id: optionalUuid(input.id, "id") } : {}), ...(input.cursor !== undefined ? { cursor: optionalUuid(input.cursor, "cursor") } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) };
}
export function validateChangeInput(value: unknown): ChangeInput {
  const input = object(value);
  keys(input, ["resource", "operation", "id", "expectedVersion", "values", "idempotencyKey"]);
  if (!Object.hasOwn(TEXT_FIELDS, String(input.resource))) throw new DataAccessError("INVALID_INPUT", "このデータ種類は更新できません");
  const resource = input.resource as WritableResource;
  if (input.operation !== "create" && input.operation !== "update") throw new DataAccessError("INVALID_INPUT", "操作はcreateまたはupdateです");
  const operation = input.operation;
  const id = optionalUuid(input.id, "id");
  if (operation === "update" && !id) throw new DataAccessError("INVALID_INPUT", "更新対象のidが必要です");
  if (operation === "create" && (id || input.expectedVersion !== undefined)) throw new DataAccessError("INVALID_INPUT", "新規登録のidはサーバーが発行します");
  if (operation === "update" && (typeof input.expectedVersion !== "string" || !/^[a-f0-9]{32}$/.test(input.expectedVersion))) throw new DataAccessError("INVALID_INPUT", "閲覧時のexpectedVersionが必要です");
  if (typeof input.idempotencyKey !== "string" || !/^[A-Za-z0-9_.:-]{8,128}$/.test(input.idempotencyKey)) throw new DataAccessError("INVALID_INPUT", "idempotencyKeyは8〜128文字の英数字等で指定してください");
  const values = object(input.values);
  if (!Object.keys(values).length) throw new DataAccessError("INVALID_INPUT", "変更する項目が必要です");
  const textFields: readonly string[] = TEXT_FIELDS[resource];
  const numericFields: readonly string[] = operation === "create" ? CREATE_NUMBER_FIELDS[resource] : [];
  const booleanFields: readonly string[] = operation === "create" ? CREATE_BOOLEAN_FIELDS[resource] : [];
  // Existing cost/price propagation is deliberately unavailable through this gateway.
  const allowed = [...textFields.filter((field) => operation === "create" || field !== "category"), ...numericFields, ...booleanFields];
  if (resource === "materials" && operation === "update") allowed.splice(allowed.indexOf("unit_quantity"), 1);
  keys(values, allowed);
  for (const [field, fieldValue] of Object.entries(values)) {
    if (textFields.includes(field)) {
      if (fieldValue !== null && (typeof fieldValue !== "string" || fieldValue.length > (field === "name" ? 300 : 10000) || fieldValue.includes("\u0000"))) throw new DataAccessError("INVALID_INPUT", `${field}の値を確認してください`);
      if ((field === "name" || field === "category") && (typeof fieldValue !== "string" || !fieldValue.trim())) throw new DataAccessError("INVALID_INPUT", `${field}は空にできません`);
    } else if (numericFields.includes(field)) {
      if (fieldValue !== null && (typeof fieldValue !== "number" || !Number.isFinite(fieldValue) || fieldValue < 0 || fieldValue > 1e9 || (["unit_quantity", "yield_rate"].includes(field) && fieldValue === 0) || (["lot_size", "case_quantity"].includes(field) && !Number.isInteger(fieldValue)))) throw new DataAccessError("INVALID_INPUT", `${field}の数値を確認してください`);
    } else if (typeof fieldValue !== "boolean") throw new DataAccessError("INVALID_INPUT", `${field}は真偽値です`);
  }
  if (operation === "create" && (typeof values.name !== "string" || !values.name.trim() || (resource === "recipes" && (typeof values.category !== "string" || !values.category.trim())))) throw new DataAccessError("INVALID_INPUT", "新規登録には名称（レシピはカテゴリも）が必要です");
  if (operation === "create" && resource !== "recipes" && ["unit_quantity", resource === "expenses" ? "unit_price" : "price", "tax_included"].some((field) => !Object.hasOwn(values, field))) throw new DataAccessError("INVALID_INPUT", "新規マスターは入数・価格・税込区分を明示してください（未設定の入数・価格はnull）");
  return { resource, operation, ...(id ? { id } : {}), ...(operation === "update" ? { expectedVersion: input.expectedVersion as string } : {}), values, idempotencyKey: input.idempotencyKey };
}
