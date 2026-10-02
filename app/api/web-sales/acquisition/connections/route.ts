import { NextResponse } from "next/server";
import { isFinanceAdmin, isSameOriginFinanceRequest } from "@/lib/finance-acquisition/auth";
import { getConfiguredApiCredentialNames, saveRotatedApiCredentials, API_CREDENTIAL_NAMES } from "@/lib/finance-acquisition/credential-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!await isFinanceAdmin()) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  try {
    const configured = await getConfiguredApiCredentialNames();
    return NextResponse.json({ settings: API_CREDENTIAL_NAMES.map(name => ({ name, configured: configured.has(name) })) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "API接続状態を取得できません" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!await isFinanceAdmin()) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  if (!isSameOriginFinanceRequest(request)) return NextResponse.json({ error: "送信元が正しくありません" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "JSONで送信してください" }, { status: 415 });
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 420_000) return NextResponse.json({ error: "接続情報が大きすぎます" }, { status: 413 });
    const body = JSON.parse(text);
    const values = body.values;
    if (!values || typeof values !== "object" || Array.isArray(values) || Object.keys(values).length > 25) {
      return NextResponse.json({ error: "API接続情報が正しくありません" }, { status: 400 });
    }
    await saveRotatedApiCredentials(values);
    return NextResponse.json({ ok: true, message: "API接続情報を暗号化して保存しました。取得時に接続と金額を検証します" });
  } catch {
    return NextResponse.json({ error: "API接続情報を保存できません。入力項目と保存設定を確認してください" }, { status: 400 });
  }
}
