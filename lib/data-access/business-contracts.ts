import { DataAccessError, isUuid } from "./contracts";

export type BusinessAction = "catalog" | "read" | "prepare" | "apply";
const identifier = /^[a-z][a-z0-9_]{0,62}$/;
const invalid = () => { throw new DataAccessError("INVALID_INPUT", "業務データの操作または値を確認してください"); };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid();
}
function record(value: unknown, scalarOnly = false): Record<string, unknown> {
  const result = object(value);
  if (Object.keys(result).length > 100 || Object.entries(result).some(([key, item]) => !identifier.test(key) || (scalarOnly && item !== null && !["string", "number", "boolean"].includes(typeof item)))) invalid();
  return result;
}
function jsonValue(value: unknown, depth = 0): void {
  if (depth > 12) invalid();
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") { if (!Number.isFinite(value)) invalid(); return; }
  if (typeof value === "string") { if (value.includes("\u0000")) invalid(); return; }
  if (Array.isArray(value)) { for (const item of value) jsonValue(item, depth + 1); return; }
  for (const [key, item] of Object.entries(object(value))) { if (["__proto__", "constructor", "prototype"].includes(key)) invalid(); jsonValue(item, depth + 1); }
}
export function validateBusinessInput(value: unknown): { action: BusinessAction; payload: Record<string, unknown> } {
  const input = object(value);
  if (!["catalog", "read", "prepare", "apply"].includes(String(input.action))) invalid();
  const action = input.action as BusinessAction;
  const payload = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "action"));
  if (action === "apply") {
    keys(input, ["action", "id"]);
    if (!isUuid(input.id)) invalid();
  } else if (action === "catalog") {
    keys(input, ["action", "table"]);
    if (input.table !== undefined && (typeof input.table !== "string" || !identifier.test(input.table))) invalid();
  } else {
    if (typeof input.table !== "string" || !identifier.test(input.table)) invalid();
    if (action === "read") {
      keys(input, ["action", "table", "filters", "columns", "limit", "offset"]);
      if (input.filters !== undefined) record(input.filters, true);
      if (input.columns !== undefined && (!Array.isArray(input.columns) || !input.columns.length || input.columns.length > 100 || input.columns.some(column => typeof column !== "string" || !identifier.test(column)))) invalid();
      for (const [field, min, max] of [["limit", 1, 100], ["offset", 0, 10000]] as const) {
        if (input[field] !== undefined && (typeof input[field] !== "number" || !Number.isInteger(input[field]) || input[field] < min || input[field] > max)) invalid();
      }
    } else {
      keys(input, ["action", "table", "operation", "key", "expectedVersion", "values", "idempotencyKey"]);
      if (!["create", "update", "delete"].includes(String(input.operation))) invalid();
      if (typeof input.idempotencyKey !== "string" || !/^[A-Za-z0-9_.:-]{8,128}$/.test(input.idempotencyKey)) invalid();
      if (input.operation === "create") {
        if (input.key !== undefined || input.expectedVersion !== undefined) invalid();
      } else {
        if (!Object.keys(record(input.key, true)).length || typeof input.expectedVersion !== "string" || !/^[a-f0-9]{32}$/.test(input.expectedVersion)) invalid();
      }
      if (input.operation === "delete") {
        if (input.values !== undefined) invalid();
      } else if (!Object.keys(record(input.values)).length) invalid();
    }
  }
  jsonValue(payload);
  return { action, payload };
}
