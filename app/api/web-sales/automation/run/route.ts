import { NextResponse } from "next/server";
import { validatePeriod } from "@/lib/web-sales-automation/date";
import { enqueueFinanceAcquisitions } from "@/lib/finance-acquisition/dispatch";
import { isFinanceAdmin, isSameOriginFinanceRequest } from "@/lib/finance-acquisition/auth";
import { ACTIVE_EC_CHANNELS } from "@/lib/web-sales-abcd/monthly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!await isFinanceAdmin()) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  if (!isSameOriginFinanceRequest(request)) return NextResponse.json({ error: "送信元が正しくありません" }, { status: 403 });
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > 8000) return NextResponse.json({ error: "要求が大きすぎます" }, { status: 413 });
    const body = JSON.parse(text);
    const period = validatePeriod(String(body.startDate || ""), String(body.endDate || ""));
    const requested: string[] = Array.isArray(body.channels) ? body.channels.map(String) : [];
    const channels = [...new Set(requested.length > 0 ? requested : ACTIVE_EC_CHANNELS)]
      .filter(channel => (ACTIVE_EC_CHANNELS as readonly string[]).includes(channel));
    if (channels.length === 0) {
      return NextResponse.json({ error: "同期対象を選択してください" }, { status: 400 });
    }

    return NextResponse.json(await enqueueFinanceAcquisitions({ kind: "sales", channels, period,
      triggerType: "manual", allowBridge: true, incompleteOnly: body.incompleteOnly === true }));
  } catch {
    return NextResponse.json(
      { error: "取得要求を登録できません。対象期間と既存の処理状態を確認してください" },
      { status: 400 },
    );
  }
}
