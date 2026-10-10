import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { DataAccessError, isUuid, validateChangeInput, validateReadInput } from "./contracts";

export function createDataAccessAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new DataAccessError("UNAVAILABLE", "データ接続の設定が未完了です", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function tokenHashFromRequest(request: Request): string {
  const match = /^Bearer (tsa_data_[A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") || "");
  if (!match) throw new DataAccessError("UNAUTHORIZED", "専用のデータ接続トークンが必要です", 401);
  return createHash("sha256").update(match[1]).digest("hex");
}
export const RPC_ERRORS: Record<string, [number, string]> = {
  UNAUTHORIZED: [401, "接続が無効または期限切れです"], FORBIDDEN: [403, "この操作の権限がありません"],
  NOT_FOUND: [404, "対象が見つかりません"], CONFLICT: [409, "対象が変更されています。再取得してください"],
  IDEMPOTENCY_CONFLICT: [409, "同じ実行キーが別の内容で使用されています"], APPROVAL_REQUIRED: [409, "管理者による変更内容の確認が必要です"],
  EXPIRED: [409, "変更案の有効期限が切れています"], REJECTED: [409, "この変更案は却下されています"], INVALID_INPUT: [400, "指定された操作または値を確認してください"],
};
export async function readDataAccessBody(request: Request) {
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) throw new DataAccessError("INVALID_INPUT", "JSON形式で送信してください");
  if (Number(request.headers.get("content-length") || 0) > 32768) throw new DataAccessError("INVALID_INPUT", "送信内容が大きすぎます", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new DataAccessError("INVALID_INPUT", "送信内容が必要です");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 32768) { await reader.cancel(); throw new DataAccessError("INVALID_INPUT", "送信内容が大きすぎます", 413); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new DataAccessError("INVALID_INPUT", "JSONを確認してください"); }
}
export async function handleDataAccess(request: Request, action: "read" | "prepare" | "apply", planId?: string) {
  const requestId = randomUUID();
  try {
    const tokenHash = tokenHashFromRequest(request);
    let payload: unknown;
    if (action === "apply") {
      if (!isUuid(planId)) throw new DataAccessError("INVALID_INPUT", "変更案のidを確認してください");
      // apply accepts no replacement values; its only input is the bound immutable plan ID.
      if (request.body) { const input = await readDataAccessBody(request); if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) throw new DataAccessError("INVALID_INPUT", "実行時に変更内容を差し替えることはできません"); }
      payload = { id: planId };
    } else payload = action === "read" ? validateReadInput(await readDataAccessBody(request)) : validateChangeInput(await readDataAccessBody(request));
    const { data, error } = await createDataAccessAdminClient().rpc("tsa_data_access_v1", { p_token_hash: tokenHash, p_action: action, p_payload: payload });
    if (error) {
      const code = /^DA_([A-Z_]+)$/.exec(error.message || "")?.[1];
      if (code && RPC_ERRORS[code]) { const [status, message] = RPC_ERRORS[code]; throw new DataAccessError(code, message, status); }
      console.error("data_access_failed", { requestId, action, code: error.code });
      throw new DataAccessError("UNAVAILABLE", "データ操作を完了できませんでした", 503);
    }
    return Response.json({ ok: true, data, requestId }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const safe = error instanceof DataAccessError ? error : new DataAccessError("UNAVAILABLE", "データ操作を完了できませんでした", 503);
    return Response.json({ ok: false, error: { code: safe.code, message: safe.message }, requestId }, { status: safe.status, headers: { "Cache-Control": "no-store" } });
  }
}
