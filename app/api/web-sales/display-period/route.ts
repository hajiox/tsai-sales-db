import { NextResponse } from "next/server";
import { getBusinessAdminSession, isBusinessAdminSession } from "@/lib/data-access/business-operation-context";
import { getWebSalesDisplayPeriod } from "@/lib/web-sales-analysis/period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET(request: Request) {
  const session = await getBusinessAdminSession();
  if (!isBusinessAdminSession(session)) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }
  const month = new URL(request.url).searchParams.get("month") || "";
  try {
    return NextResponse.json(await getWebSalesDisplayPeriod(month));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "集計期間を確認できません" },
      { status: 400 },
    );
  }
}
