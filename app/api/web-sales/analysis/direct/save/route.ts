import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { buildWebSalesAnalysisPacket } from "@/lib/web-sales-analysis/packet";
import {
  assertDirectPacket, assertDirectQuality, directAnalysisSaveSchema, DirectAnalysisConflict,
  getDirectAnalysisPool, loadDirectCostWarnings, monthlyAnalysisPeriod, saveDirectAnalysis,
  withDirectCostWarnings,
} from "@/lib/web-sales-analysis/direct";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "aizubrandhall@gmail.com";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const adminEmail = session?.user?.email?.toLowerCase();
  if (adminEmail !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "送信元が正しくありません" }, { status: 403 });
  }
  try {
    const input = directAnalysisSaveSchema.parse(await request.json());
    const period = monthlyAnalysisPeriod(input.month);
    const sourcePacket = await buildWebSalesAnalysisPacket({ month: input.month, ...period });
    const client = await getDirectAnalysisPool().connect();
    try {
      const costWarnings = await loadDirectCostWarnings(client, input.month);
      const freshPacket = withDirectCostWarnings(sourcePacket, costWarnings);
      assertDirectPacket(input, freshPacket);
      assertDirectQuality(input, freshPacket, costWarnings);
      const saved = await saveDirectAnalysis(client, input, adminEmail);
      return NextResponse.json({ ...saved, costWarnings }, { headers: { "Cache-Control": "no-store" } });
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: `分析結果の形式が正しくありません: ${error.issues[0]?.message || "validation error"}` }, { status: 400 });
    }
    if (error instanceof DirectAnalysisConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "分析結果を保存できません" },
      { status: 500 },
    );
  }
}
