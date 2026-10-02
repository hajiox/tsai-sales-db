import { NextResponse } from "next/server";
import { z } from "zod";
import { isFinanceAdmin, isSameOriginFinanceRequest } from "@/lib/finance-acquisition/auth";
import { enqueueFinanceAcquisitions } from "@/lib/finance-acquisition/dispatch";
import { assertFullMonth } from "@/lib/finance-acquisition/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const schema = z.object({ startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict();

export async function POST(request: Request) {
  if (!await isFinanceAdmin()) return NextResponse.json({ error: "管理者ログインが必要です" }, { status: 401 });
  if (!isSameOriginFinanceRequest(request)) return NextResponse.json({ error: "不正な送信元です" }, { status: 403 });
  try {
    const input = schema.parse(await request.json());
    const period = { startDate: input.startDate, endDate: input.endDate, reportMonth: input.startDate.slice(0, 7) };
    assertFullMonth(period);
    const result = await enqueueFinanceAcquisitions({ kind: "advertising", channels: ["amazon"],
      period, allowBridge: false });
    return NextResponse.json(result, { status: result.summary.queued > 0 ? 202 : 200 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "対象期間の形式が正しくありません" }, { status: 400 });
    if (error instanceof Error && /月次精算|対象月は/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Amazon広告を取得できません" }, { status: 500 });
  }
}
