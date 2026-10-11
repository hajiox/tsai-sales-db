import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { DataAccessError } from "./contracts";
import { createDataAccessAdminClient, RPC_ERRORS, tokenHashFromRequest } from "./server";
import { runWithBusinessOperationContext } from "./business-operation-context";
import { MAX_OPERATION_INPUT_BYTES, MAX_OPERATION_OUTPUT_BYTES, decodeBusinessFile, validateOperationEnvelope, validateOperationJson, validateOperationSchema, type BusinessOperation } from "./operation-contracts";
import { recipeOperations } from "./recipe-operations";
import { financeOperations } from "./finance-operations";
import { otherOperations } from "./other-operations";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const operations = new Map<string, BusinessOperation>();
for (const operation of [...recipeOperations, ...financeOperations, ...otherOperations]) {
  if (operations.has(operation.name)) throw new Error(`Duplicate business operation: ${operation.name}`);
  operations.set(operation.name, operation);
}
type LedgerOperation = { operationId: string; operation: string; state: "running" | "completed" | "failed" | "unknown"; result?: unknown; createdAt?: string; completedAt?: string };
type GatewayAuthorization = { connectionId: string; actor: string; claimed?: boolean; operation?: LedgerOperation };

async function operationRpc(tokenHash: string, action: "authorize" | "claim" | "status" | "finish", payload: Record<string, unknown>): Promise<GatewayAuthorization> {
  const { data, error } = await createDataAccessAdminClient().rpc("tsa_business_operation_v1", { p_token_hash: tokenHash, p_action: action, p_payload: payload });
  if (error) {
    const code = /^DA_([A-Z_]+)$/.exec(error.message || "")?.[1];
    if (code && RPC_ERRORS[code]) throw new DataAccessError(code, RPC_ERRORS[code][1], RPC_ERRORS[code][0]);
    throw new DataAccessError("UNAVAILABLE", "業務操作の記録を確認できません", 503);
  }
  if (!data || typeof data.connectionId !== "string" || data.actor !== `data-access:${data.connectionId}`) throw new DataAccessError("UNAVAILABLE", "接続の検証結果を確認できません", 503);
  return data as GatewayAuthorization;
}

async function readOperationBody(request: Request): Promise<unknown> {
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) throw new DataAccessError("INVALID_INPUT", "JSON形式で送信してください");
  if (Number(request.headers.get("content-length") || 0) > MAX_OPERATION_INPUT_BYTES) throw new DataAccessError("REQUEST_TOO_LARGE", "base64を含む送信全体は4MiB以下にしてください", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new DataAccessError("INVALID_INPUT", "送信内容が必要です");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > MAX_OPERATION_INPUT_BYTES) { await reader.cancel(); throw new DataAccessError("REQUEST_TOO_LARGE", "base64を含む送信全体は4MiB以下にしてください", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new DataAccessError("INVALID_INPUT", "JSONを確認してください"); }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const secretField = /(?:^|[_-])(?:token|token_hash|password|secret|credential|cookie|private_key|access_key|refresh_token|api_key|authorization)(?:$|[_-])/i;
// This fixed list contains environment names only. Never enumerate or log the environment.
const secretEnvironmentNames = [
  "SUPABASE_SERVICE_ROLE_KEY", "TSG_SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_JWT_SECRET",
  "GEMINI_API_KEY", "OPENAI_API_KEY", "NEXTAUTH_SECRET", "DATABASE_URL", "BLOB_READ_WRITE_TOKEN",
  "CRON_SECRET", "FINANCE_ADMIN_PASSWORD", "FINANCE_API_CREDENTIAL_ENCRYPTION_KEY",
  "GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_CLIENT_SECRET", "GOOGLE_SERVICE_ACCOUNT_JSON",
  "PUSH_NOTIFY_SECRET", "TSA_DELIVERY_SYNC_SECRET", "TSA_REVIEW_APP_TOKEN", "TSA_BRAND_STORE_MAIL_TOKEN",
  "TSA_CODEX_BRIDGE_TOKEN", "TSG_INTEGRATION_SECRET", "VAPID_PRIVATE_KEY",
] as const;
function redactionSecrets(token: string): string[] {
  const values = secretEnvironmentNames.map(name => process.env[name]).filter((value): value is string => !!value);
  if (token) values.push(token);
  try {
    const account = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
    if (typeof account.private_key === "string" && account.private_key) values.push(account.private_key);
  } catch { /* An invalid service account configuration must not appear in an error response. */ }
  return [...new Set(values.flatMap(value => [value, encodeURIComponent(value), JSON.stringify(value).slice(1, -1)]))].sort((a, b) => b.length - a.length);
}
function safeText(value: string, secrets: string[]): string {
  let text = value;
  for (const secret of secrets) text = text.replaceAll(secret, "[redacted]");
  text = text.replace(/tsa_data_[A-Za-z0-9_-]{43}/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9_.~+\/-]+=*/gi, "Bearer [redacted]")
    .replace(/AIza[A-Za-z0-9_-]{35}/g, "[redacted API key]")
    .replace(/\bsk-(?:(?:proj|svcacct)-)?[A-Za-z0-9_-]{20,}/g, "[redacted API key]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted JWT]")
    .replace(/(?:https?|postgres(?:ql)?|mysql|rediss?|mongodb(?:\+srv)?):\/\/[^\s"'<>/@:]+:[^\s"'<>/@]+@[^\s"'<>]+/gi, "[redacted credential URL]");
  return text.replace(/https?:\/\/[^\s"'<>]+/gi, candidate => {
    try {
      const url = new URL(candidate);
      const keys = [...url.searchParams.keys()];
      if (keys.some(key => /^(?:signature|sig|x-amz-.+|x-goog-.+)$/i.test(key))) return "[redacted signed URL]";
      if (keys.some(key => /^(?:key|api[_-]?key|access[_-]?token|refresh[_-]?token|token|authorization|password|secret|client[_-]?secret)$/i.test(key))) return "[redacted credential URL]";
    } catch { /* Ordinary text and malformed URLs are handled by the key patterns above. */ }
    return candidate;
  });
}
function safeValue(value: unknown, token: string, depth = 0, secrets = redactionSecrets(token)): unknown {
  if (depth > 30) return "[truncated]";
  if (typeof value === "string") return safeText(value, secrets);
  if (Array.isArray(value)) return value.map(item => safeValue(item, token, depth + 1, secrets));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !secretField.test(key) && !/^(?:accessToken|refreshToken|apiKey|clientSecret|privateKey|tokenHash|set-cookie|prompt|system_prompt|user_prompt|developer_prompt|full_prompt)$/i.test(key)).map(([key, item]) => [key, safeValue(item, token, depth + 1, secrets)]));
  return value;
}
async function boundedResponse(response: Response, operationName: string, token: string) {
  if (!(response instanceof Response) || response.status >= 300 && response.status < 400) throw new DataAccessError("UNAVAILABLE", "業務処理が転送を返したため結果を確定できません", 503);
  const chunks: Uint8Array[] = []; let size = 0;
  const reader = response.body?.getReader();
  if (reader) for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > MAX_OPERATION_OUTPUT_BYTES) { await reader.cancel(); throw new DataAccessError("RESPONSE_TOO_LARGE", "結果が大きすぎるため状態を照会してください", 413); }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  const mimeType = (response.headers.get("content-type") || "application/octet-stream").split(";")[0].trim().toLowerCase();
  let result: Record<string, unknown>;
  if (mimeType === "application/json" || mimeType.endsWith("+json")) {
    let body: unknown;
    try { body = bytes.length ? JSON.parse(bytes.toString("utf8")) : null; } catch { throw new DataAccessError("UNAVAILABLE", "業務処理の応答形式を確認できません", 503); }
    result = { status: response.status, body: safeValue(body, token) };
  } else {
    const disposition = response.headers.get("content-disposition") || "";
    let filename = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
    if (filename) { try { filename = decodeURIComponent(filename); } catch { filename = undefined; } }
    filename ||= /filename="?([^";]+)"?/i.exec(disposition)?.[1];
    const extension = mimeType === "application/pdf" ? "pdf" : mimeType === "text/csv" ? "csv" : mimeType === "image/png" ? "png" : mimeType === "image/jpeg" ? "jpg" : mimeType === "image/svg+xml" ? "svg" : "bin";
    filename = (filename || `${operationName}.${extension}`).replace(/[\\/\r\n\u0000]/g, "_").slice(0, 200);
    result = { status: response.status, file: { filename, mimeType, encoding: "base64", content: bytes.toString("base64"), sha256: createHash("sha256").update(bytes).digest("hex") } };
  }
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_OPERATION_OUTPUT_BYTES - 4096) throw new DataAccessError("RESPONSE_TOO_LARGE", "結果が大きすぎるため状態を照会してください", 413);
  const body = result.body as Record<string, unknown> | undefined;
  const failed = !response.ok || !!body && (body.ok === false || body.success === false);
  return { result, state: failed ? "failed" as const : "completed" as const };
}
function operationData(operation: LedgerOperation) {
  return { ...operation, ...(operation.state === "running" || operation.state === "unknown" ? { message: "処理中または結果未確定です。同じキーの操作は再実行されません。保存先とジョブの状態を確認してください。" } : {}) };
}

export async function handleBusinessOperations(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const tokenHash = tokenHashFromRequest(request);
    const envelope = validateOperationEnvelope(await readOperationBody(request));
    if (envelope.action === "status") {
      const authorized = await operationRpc(tokenHash, "status", { ...(envelope.operationId ? { operationId: envelope.operationId } : { idempotencyKey: envelope.idempotencyKey }) });
      if (!authorized.operation) throw new DataAccessError("NOT_FOUND", "操作が見つかりません", 404);
      return Response.json({ ok: true, data: operationData(authorized.operation), requestId }, { headers });
    }
    if (envelope.action === "catalog") {
      await operationRpc(tokenHash, "authorize", {});
      return Response.json({ ok: true, data: { operations: [...operations.values()].map(({ name, description, mutation, inputSchema }) => ({ name, description, mutation, inputSchema })) }, requestId }, { headers });
    }
    const operation = operations.get(envelope.operation);
    if (!operation) throw new DataAccessError("INVALID_INPUT", "カタログにない操作です");
    validateOperationSchema(operation.inputSchema, envelope.input);
    validateOperationJson(envelope.input);
    // Decode/hash checks cannot consume a durable mutation key or start a handler.
    if (envelope.input.files !== undefined) {
      if (!Array.isArray(envelope.input.files)) throw new DataAccessError("INVALID_INPUT", "ファイルの配列を確認してください");
      for (const file of envelope.input.files) decodeBusinessFile(file);
    }
    if (operation.mutation && !envelope.idempotencyKey) throw new DataAccessError("INVALID_INPUT", "保存操作にはidempotencyKeyが必要です");
    // Fixed Request construction is pure validation; reject it before consuming a mutation key.
    const prepared = operation.prepare(envelope.input, new URL(request.url).origin);
    const authorized = await operationRpc(tokenHash, operation.mutation ? "claim" : "authorize", operation.mutation ? {
      operation: operation.name, idempotencyKey: envelope.idempotencyKey,
      inputHash: createHash("sha256").update(canonical({ operation: operation.name, input: envelope.input })).digest("hex"),
    } : {});
    if (operation.mutation && !authorized.claimed) {
      if (!authorized.operation) throw new DataAccessError("UNAVAILABLE", "操作状態を確認できません", 503);
      return Response.json({ ok: true, data: operationData(authorized.operation), requestId }, { headers });
    }
    const operationId = authorized.operation?.operationId;
    let captured: Awaited<ReturnType<typeof boundedResponse>>;
    try {
      const response = await runWithBusinessOperationContext({ connectionId: authorized.connectionId, operation: operation.name, request: prepared.request }, () => prepared.execute({
        request: prepared.request, connectionId: authorized.connectionId, actor: authorized.actor, idempotencyKey: envelope.idempotencyKey,
      }));
      captured = await boundedResponse(response, operation.name, request.headers.get("authorization")?.slice(7) || "");
    } catch (cause) {
      if (!operation.mutation || !operationId) throw cause;
      // Handler effects and this ledger use separate transactions. Never retry an uncertain write.
      const result = { error: { code: cause instanceof DataAccessError ? cause.code : "EXECUTION_UNKNOWN", message: "業務処理の完了を確定できません。同じキーは再実行せず保存先を確認してください。" } };
      await operationRpc(tokenHash, "finish", { operationId, state: "unknown", result }).catch(() => undefined);
      return Response.json({ ok: true, data: operationData({ operationId, operation: operation.name, state: "unknown", result }), requestId }, { headers });
    }
    if (!operation.mutation) return Response.json({ ok: true, data: { operation: operation.name, state: captured.state, result: captured.result }, requestId }, { headers });
    try {
      const finished = await operationRpc(tokenHash, "finish", { operationId, ...captured });
      if (!finished.operation) throw new Error("Missing operation result");
      return Response.json({ ok: true, data: operationData(finished.operation), requestId }, { headers });
    } catch {
      return Response.json({ ok: true, data: operationData({ operationId: operationId!, operation: operation.name, state: "unknown", result: { error: { code: "RESULT_UNCONFIRMED", message: "保存結果の記録を確定できません。同じキーで状態を照会してください。" } } }), requestId }, { headers });
    }
  } catch (cause) {
    const error = cause instanceof DataAccessError ? cause : new DataAccessError("UNAVAILABLE", "業務操作を完了できませんでした", 503);
    return Response.json({ ok: false, error: safeValue({ code: error.code, message: error.message }, request.headers.get("authorization")?.slice(7) || ""), requestId }, { status: error.status, headers });
  }
}
