import { NextResponse } from "next/server";
import {
  assessPreviousMonthKpi,
  getJstDateParts,
} from "@/lib/kpi-completeness";
import {
  buildKpiReminderContent,
  postKpiReminderToTsg,
} from "@/lib/tsg-kpi-reminder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim()
    || process.env.PUSH_NOTIFY_SECRET?.trim();
  if (!expected) return false;
  return request.headers.get("authorization") === `Bearer ${expected}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1";
    const dryRun = url.searchParams.get("dryRun") === "1";
    const now = new Date();
    const jst = getJstDateParts(now);

    if (!force && ![5, 7].includes(jst.day)) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "not_scheduled_day",
        jstDate: jst.isoDate,
      });
    }

    const result = await assessPreviousMonthKpi(now);
    if (result.complete) {
      return NextResponse.json({
        ok: true,
        complete: true,
        posted: false,
        result,
      });
    }

    const runKey = force
      ? `test-${jst.isoDate}`
      : `day-${String(jst.day).padStart(2, "0")}`;
    const sourceKey = `tsa-kpi-reminder:${result.targetMonth}:${runKey}`;

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        complete: false,
        posted: false,
        dryRun: true,
        sourceKey,
        content: buildKpiReminderContent(result, sourceKey),
        result,
      });
    }

    const posted = await postKpiReminderToTsg(result, sourceKey);
    return NextResponse.json({
      ok: true,
      complete: false,
      posted: true,
      sourceKey,
      result,
      tsg: posted,
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "KPI確認処理に失敗しました",
    }, { status: 500 });
  }
}
