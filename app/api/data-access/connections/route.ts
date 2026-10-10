import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { dataAccessAdmin, dataAccessAdminDb, isDataAccessAdminOrigin, isDataAccessId, validateDataConnection, validateDataConnectionPermissions } from "@/lib/data-access-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const connectionColumns = "id,label,scopes,resource_ids,max_limit,expires_at,revoked_at,last_used_at,created_at";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

function error(code: string, message: string, status: number, requestId: string) {
  return NextResponse.json({ ok: false, error: { code, message }, requestId }, { status, headers });
}

export async function GET() {
  const requestId = randomUUID();
  if (!await dataAccessAdmin()) return error("UNAUTHORIZED", "管理者ログインが必要です", 401, requestId);
  const db = dataAccessAdminDb();
  const [connections, changes, audit] = await Promise.all([
    db.from("data_access_connections").select(connectionColumns).order("created_at", { ascending: false }).limit(100),
    db.from("data_access_changes").select("id,connection_id,resource,operation,record_id,values,before_data,requires_approval,status,approved_by,approved_at,expires_at,created_at,result").order("created_at", { ascending: false }).limit(50),
    db.from("data_access_audit").select("id,connection_id,resource,operation,record_id,created_at").order("created_at", { ascending: false }).limit(50),
  ]);
  if (connections.error || changes.error || audit.error) return error("UNAVAILABLE", "データ接続情報を取得できません。保存設定を確認してください", 503, requestId);
  return NextResponse.json({ ok: true, data: { connections: connections.data, changes: changes.data, audit: audit.data }, requestId }, { headers });
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const actor = await dataAccessAdmin();
  if (!actor) return error("UNAUTHORIZED", "管理者ログインが必要です", 401, requestId);
  if (!isDataAccessAdminOrigin(request)) return error("FORBIDDEN", "送信元が正しくありません", 403, requestId);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return error("VALIDATION", "JSONで送信してください", 415, requestId);
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 32000) return error("VALIDATION", "入力が大きすぎます", 413, requestId);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return error("VALIDATION", "入力が正しくありません", 400, requestId);
  }
  const db = dataAccessAdminDb();
  if (body.action === "create") {
    let created;
    try { created = validateDataConnection(body); }
    catch (cause) { return error("VALIDATION", cause instanceof Error ? cause.message : "入力が正しくありません", 400, requestId); }
    const { data, error: failure } = await db.from("data_access_connections").insert({ ...created.connection, created_by: actor }).select(connectionColumns).single();
    if (failure) return error("UNAVAILABLE", "接続を作成できませんでした", 503, requestId);
    return NextResponse.json({ ok: true, data: { connection: data, token: created.token }, requestId }, { headers });
  }
  if (!isDataAccessId(body.id)) return error("VALIDATION", "対象IDが正しくありません", 400, requestId);
  if (body.action === "permissions") {
    let permissions;
    try { permissions = validateDataConnectionPermissions(body); }
    catch (cause) { return error("VALIDATION", cause instanceof Error ? cause.message : "権限が正しくありません", 400, requestId); }
    const { data, error: failure } = await db.from("data_access_connections").update(permissions).eq("id", body.id).is("revoked_at", null).gt("expires_at", new Date().toISOString()).select(connectionColumns).maybeSingle();
    if (failure) return error("UNAVAILABLE", "権限を更新できませんでした", 503, requestId);
    if (!data) return error("CONFLICT", "有効な接続が見つかりません", 409, requestId);
    return NextResponse.json({ ok: true, data: { connection: data }, requestId }, { headers });
  }
  if (body.action === "revoke") {
    const { data, error: failure } = await db.from("data_access_connections").update({ revoked_at: new Date().toISOString() }).eq("id", body.id).is("revoked_at", null).select("id");
    if (failure) return error("UNAVAILABLE", "接続を停止できませんでした", 503, requestId);
    return NextResponse.json({ ok: true, data: { revoked: Boolean(data?.length) }, requestId }, { headers });
  }
  if (body.action === "review" && ["approve", "reject"].includes(String(body.decision))) {
    const { data, error: failure } = await db.rpc("tsa_data_access_review_plan", { p_id: body.id, p_decision: body.decision, p_actor: actor });
    if (failure) return error("CONFLICT", "確認対象の状態が変わりました。再読み込みしてください", 409, requestId);
    return NextResponse.json({ ok: true, data, requestId }, { headers });
  }
  return error("VALIDATION", "操作が正しくありません", 400, requestId);
}
