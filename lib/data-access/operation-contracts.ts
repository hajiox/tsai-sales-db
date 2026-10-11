import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { DataAccessError, isUuid } from "./contracts";

// Stay below the production host's payload ceiling, including base64 and JSON overhead.
export const MAX_OPERATION_INPUT_BYTES = 4 * 1024 * 1024;
export const MAX_OPERATION_OUTPUT_BYTES = 4 * 1024 * 1024;
export const MAX_BUSINESS_FILE_BYTES = 3 * 1024 * 1024;
export type JsonSchema = {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  properties?: Record<string, JsonSchema>; required?: string[]; additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema; enum?: unknown[]; const?: unknown; anyOf?: JsonSchema[];
  minLength?: number; maxLength?: number; pattern?: string; format?: string;
  minimum?: number; maximum?: number; minItems?: number; maxItems?: number; minProperties?: number; maxProperties?: number;
  description?: string; title?: string; default?: unknown;
};
const invalid = (message = "業務操作の入力を確認してください") => { throw new DataAccessError("INVALID_INPUT", message); };
const schemaKeywords = new Set(["type", "properties", "required", "additionalProperties", "items", "enum", "const", "anyOf", "minLength", "maxLength", "pattern", "format", "minimum", "maximum", "minItems", "maxItems", "minProperties", "maxProperties", "description", "title", "default"]);
const keyPattern = /^[A-Za-z0-9_.:-]{8,120}$/;
const operationPattern = /^[a-z][a-z0-9_.-]{0,99}$/;

function assertSchemaDefinition(schema: JsonSchema, depth = 0): void {
  if (depth > 20 || !schema || typeof schema !== "object" || Array.isArray(schema) || Object.keys(schema).some(key => !schemaKeywords.has(key))) invalid("操作の入力定義が不正です");
  if (schema.type !== undefined && !["object", "array", "string", "number", "integer", "boolean", "null"].includes(schema.type)) invalid("未対応の入力型です");
  if (schema.format && !["uuid", "date", "date-time"].includes(schema.format)) invalid("未対応の入力形式です");
  if (schema.pattern) { try { new RegExp(schema.pattern); } catch { invalid("入力の正規表現が不正です"); } }
  for (const key of ["minLength", "maxLength", "minItems", "maxItems", "minProperties", "maxProperties", "minimum", "maximum"] as const) {
    if (schema[key] !== undefined && (typeof schema[key] !== "number" || !Number.isFinite(schema[key]))) invalid("入力の範囲定義が不正です");
  }
  if (schema.anyOf) { if (!Array.isArray(schema.anyOf) || !schema.anyOf.length || schema.anyOf.length > 20) invalid(); schema.anyOf.forEach(branch => assertSchemaDefinition(branch, depth + 1)); }
  if (schema.properties) for (const branch of Object.values(schema.properties)) assertSchemaDefinition(branch, depth + 1);
  if (schema.items) assertSchemaDefinition(schema.items, depth + 1);
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") assertSchemaDefinition(schema.additionalProperties, depth + 1);
}

export function validateOperationJson(value: unknown, depth = 0): void {
  if (depth > 20) invalid("入力の入れ子が深すぎます");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") { if (!Number.isFinite(value)) invalid(); return; }
  if (typeof value === "string") { if (value.includes("\u0000")) invalid(); return; }
  if (Array.isArray(value)) { if (value.length > 100_000) invalid(); value.forEach(item => validateOperationJson(item, depth + 1)); return; }
  if (!value || typeof value !== "object") invalid();
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 1000) invalid();
  for (const [key, item] of entries) {
    if (["__proto__", "constructor", "prototype"].includes(key) || key.includes("\u0000")) invalid();
    validateOperationJson(item, depth + 1);
  }
}

/** The same explicit schema is published in the catalog and enforced before invoking a handler. */
export function validateOperationSchema(schema: JsonSchema, value: unknown, depth = 0): void {
  if (depth === 0) assertSchemaDefinition(schema);
  if (depth > 20 || !schema || typeof schema !== "object" || Object.keys(schema).some(key => !schemaKeywords.has(key))) invalid("操作の入力定義が不正です");
  if (schema.enum && !schema.enum.some(candidate => JSON.stringify(candidate) === JSON.stringify(value))) invalid();
  if (Object.hasOwn(schema, "const") && JSON.stringify(schema.const) !== JSON.stringify(value)) invalid();
  if (schema.anyOf) {
    if (!schema.anyOf.length || schema.anyOf.length > 20 || !schema.anyOf.some(branch => {
      try { validateOperationSchema(branch, value, depth + 1); return true; } catch { return false; }
    })) invalid();
  }
  if (!schema.type) { if (!schema.anyOf && !schema.enum && !Object.hasOwn(schema, "const")) invalid("操作の型定義がありません"); return; }
  if (schema.type === "null") { if (value !== null) invalid(); return; }
  if (schema.type === "boolean") { if (typeof value !== "boolean") invalid(); return; }
  if (schema.type === "number" || schema.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value))) invalid();
    if (schema.minimum !== undefined && (value as number) < schema.minimum || schema.maximum !== undefined && (value as number) > schema.maximum) invalid();
    return;
  }
  if (schema.type === "string") {
    if (typeof value !== "string") invalid();
    const text = value as string;
    if (schema.minLength !== undefined && text.length < schema.minLength || schema.maxLength !== undefined && text.length > schema.maxLength || schema.pattern && !new RegExp(schema.pattern).test(text)) invalid();
    if (schema.format === "uuid" && !isUuid(text)) invalid();
    if (schema.format === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(`${text}T00:00:00Z`)) || new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) !== text)) invalid();
    if (schema.format === "date-time" && (!/^\d{4}-\d{2}-\d{2}T/.test(text) || !Number.isFinite(Date.parse(text)) || new Date(`${text.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== text.slice(0, 10))) invalid();
    if (schema.format && !["uuid", "date", "date-time"].includes(schema.format)) invalid("未対応の入力形式です");
    return;
  }
  if (schema.type === "array") {
    if (!Array.isArray(value) || schema.minItems !== undefined && value.length < schema.minItems || value.length > (schema.maxItems ?? 100_000) || !schema.items) invalid();
    (value as unknown[]).forEach(item => validateOperationSchema(schema.items!, item, depth + 1)); return;
  }
  if (schema.type !== "object" || !value || typeof value !== "object" || Array.isArray(value)) invalid();
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object);
  if (schema.minProperties !== undefined && keys.length < schema.minProperties || keys.length > (schema.maxProperties ?? 1000)) invalid();
  if (schema.required?.some(key => !Object.hasOwn(object, key))) invalid();
  for (const key of keys) {
    if (schema.properties && Object.hasOwn(schema.properties, key)) validateOperationSchema(schema.properties[key], object[key], depth + 1);
    else if (schema.additionalProperties && typeof schema.additionalProperties === "object") validateOperationSchema(schema.additionalProperties, object[key], depth + 1);
    else if (schema.additionalProperties !== true) invalid();
  }
}

export const businessFileSchema: JsonSchema = {
  type: "object", additionalProperties: false, required: ["field", "filename", "mimeType", "base64"],
  properties: {
    field: { type: "string", minLength: 1, maxLength: 100, pattern: "^[A-Za-z][A-Za-z0-9_-]*$" },
    filename: { type: "string", minLength: 1, maxLength: 200 },
    mimeType: { type: "string", minLength: 1, maxLength: 150, pattern: "^[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+$" },
    base64: { type: "string", minLength: 4, maxLength: 4 * 1024 * 1024 },
    sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
  },
};
export function decodeBusinessFile(value: unknown) {
  validateOperationSchema(businessFileSchema, value);
  const file = value as { field: string; filename: string; mimeType: string; base64: string; sha256?: string };
  if (/[\\/\r\n\u0000]/.test(file.filename) || file.filename === "." || file.filename === ".." || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64)) invalid("ファイル名またはbase64を確認してください");
  const bytes = Buffer.from(file.base64, "base64");
  if (bytes.length > MAX_BUSINESS_FILE_BYTES) throw new DataAccessError("REQUEST_TOO_LARGE", "ファイルは3MiB以下、base64を含む送信全体は4MiB以下にしてください", 413);
  if (!bytes.length || bytes.toString("base64") !== file.base64) invalid("ファイルの大きさまたは形式を確認してください");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (file.sha256 && file.sha256 !== sha256) invalid("ファイルのSHA256が一致しません");
  return { filename: file.filename, mimeType: file.mimeType, bytes, sha256 };
}

export type OperationEnvelope = { action: "catalog" } | { action: "run"; operation: string; input: Record<string, unknown>; idempotencyKey?: string } | { action: "status"; operationId?: string; idempotencyKey?: string };
export function validateOperationEnvelope(value: unknown): OperationEnvelope {
  validateOperationJson(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (input.action === "catalog") { if (keys.some(key => key !== "action")) invalid(); return { action: "catalog" }; }
  if (input.action === "status") {
    if (keys.some(key => !["action", "operationId", "idempotencyKey"].includes(key)) || (input.operationId !== undefined) === (input.idempotencyKey !== undefined)) invalid();
    if (input.operationId !== undefined && !isUuid(input.operationId) || input.idempotencyKey !== undefined && (typeof input.idempotencyKey !== "string" || !keyPattern.test(input.idempotencyKey))) invalid();
    return input as OperationEnvelope;
  }
  if (input.action !== "run" || keys.some(key => !["action", "operation", "input", "idempotencyKey"].includes(key)) || typeof input.operation !== "string" || !operationPattern.test(input.operation)) invalid();
  if (input.idempotencyKey !== undefined && (typeof input.idempotencyKey !== "string" || !keyPattern.test(input.idempotencyKey))) invalid();
  const operationInput = input.input ?? {};
  if (!operationInput || typeof operationInput !== "object" || Array.isArray(operationInput)) invalid();
  return { action: "run", operation: input.operation as string, input: operationInput as Record<string, unknown>, ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey as string } : {}) };
}

export type OperationExecutionContext = { request: NextRequest; connectionId: string; actor: string; idempotencyKey?: string };
export type BusinessOperation = {
  name: string; description: string; mutation: boolean; inputSchema: JsonSchema;
  prepare: (input: Record<string, unknown>, origin: string) => { request: NextRequest; execute: (context: OperationExecutionContext) => Promise<Response> };
};
type RouteOperationOptions = {
  name: string; description: string; mutation: boolean; method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; pathname: string; schema: JsonSchema;
  load?: () => Promise<unknown>;
  execute?: (input: Record<string, unknown>, context: OperationExecutionContext) => Promise<Response>;
  buildRequest?: (input: Record<string, unknown>, origin: string) => Request | { request: Request; params?: Record<string, string> };
};

function pathForOperation(pathname: string, input: Record<string, unknown>) {
  if (!pathname.startsWith("/api/") || /[?#]|\.\./.test(pathname)) invalid("操作のパス定義が不正です");
  const params = (input.params || {}) as Record<string, string>;
  return pathname.replace(/\[([A-Za-z][A-Za-z0-9_]*)\]/g, (_match, key: string) => {
    if (typeof params[key] !== "string" || !params[key] || params[key].length > 200) invalid("対象のパス項目が不足しています");
    return encodeURIComponent(params[key]);
  });
}
function standardRequest(method: string, pathname: string, input: Record<string, unknown>, origin: string): NextRequest {
  const url = new URL(pathname, origin);
  const query = (input.query || {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined) {
      if (!["string", "number", "boolean"].includes(typeof value)) invalid();
      url.searchParams.set(key, String(value));
    }
  }
  const headers = new Headers({ origin, "sec-fetch-site": "same-origin" });
  let body: BodyInit | undefined;
  if (input.files !== undefined) {
    if (!Array.isArray(input.files) || !input.files.length || input.files.length > 20 || ["GET", "HEAD"].includes(method)) invalid();
    const form = new FormData();
    for (const [key, value] of Object.entries((input.body || {}) as Record<string, unknown>)) form.append(key, typeof value === "string" ? value : JSON.stringify(value));
    for (const entry of input.files as unknown[]) {
      const file = decodeBusinessFile(entry);
      form.append((entry as { field: string }).field, new Blob([new Uint8Array(file.bytes)], { type: file.mimeType }), file.filename);
    }
    body = form;
  } else if (input.body !== undefined || !["GET", "HEAD"].includes(method)) {
    if (["GET", "HEAD"].includes(method)) invalid();
    headers.set("content-type", "application/json"); body = JSON.stringify(input.body ?? {});
  }
  return new NextRequest(url, { method, headers, ...(body !== undefined ? { body } : {}) });
}

export function routeOperation(options: RouteOperationOptions): BusinessOperation {
  if (!operationPattern.test(options.name) || Boolean(options.load) === Boolean(options.execute)) throw new Error("A business operation must have one fixed handler");
  assertSchemaDefinition(options.schema);
  return {
    name: options.name, description: options.description, mutation: options.mutation, inputSchema: options.schema,
    prepare(input, origin) {
      const pathname = pathForOperation(options.pathname, input);
      const built = options.buildRequest?.(input, origin) || standardRequest(options.method, pathname, input, origin);
      const request = new NextRequest(built instanceof Request ? built : built.request);
      const url = new URL(request.url);
      if (url.origin !== origin || url.pathname !== pathname || request.method !== options.method) invalid("固定された操作先と一致しません");
      const params = built instanceof Request ? (input.params || {}) : (built.params || input.params || {});
      return {
        request,
        async execute(context) {
          if (options.execute) return options.execute(input, context);
          const loadedRoute = await options.load!() as Record<string, unknown>;
          const handler = loadedRoute[options.method];
          if (typeof handler !== "function") throw new DataAccessError("UNAVAILABLE", "業務処理が利用できません", 503);
          // Dynamic route params are promises in the current Next.js route-handler contract.
          return handler(request, { params: Promise.resolve(params) });
        },
      };
    },
  };
}
