import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getBusinessAdminSession, isBusinessAdminSession } from "@/lib/data-access/business-operation-context";
import { buildWebSalesAnalysisPacket } from "@/lib/web-sales-analysis/packet";
import {
  analysisPacketHash, getDirectAnalysisPool, loadDirectCostWarnings,
  monthlyAnalysisPeriod, withDirectCostWarnings,
} from "@/lib/web-sales-analysis/direct";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET(request: Request) {
  const session = await getBusinessAdminSession();
  if (!isBusinessAdminSession(session)) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }
  const month = new URL(request.url).searchParams.get("month") || "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: "対象月が正しくありません" }, { status: 400 });
  }
  try {
    const period = monthlyAnalysisPeriod(month);
    const sourcePacket = await buildWebSalesAnalysisPacket({ month, ...period });
    const client = await getDirectAnalysisPool().connect();
    let costWarnings;
    try {
      costWarnings = await loadDirectCostWarnings(client, month);
    } finally {
      client.release();
    }
    const packet = withDirectCostWarnings(sourcePacket, costWarnings);
    return NextResponse.json(
      { month, period, packet, packetHash: analysisPacketHash(packet), saveRequestId: randomUUID(), costWarnings },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "分析データを準備できません" },
      { status: 500 },
    );
  }
}
