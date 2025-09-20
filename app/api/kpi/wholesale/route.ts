import { NextResponse } from "next/server";
import { getWholesaleOemOverview } from "@/server/db/kpi";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get("month");
  const month = monthParam && monthParam.length >= 7
    ? `${monthParam.slice(0, 7)}-01`
    : new Date().toISOString().slice(0, 7) + "-01";

  const data = await getWholesaleOemOverview(month);
  return NextResponse.json({ month, ...data });
}
