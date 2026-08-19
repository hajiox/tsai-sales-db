import { NextResponse } from "next/server";
import { validatePeriod } from "@/lib/web-sales-automation/date";
import { runChannelSync } from "@/lib/web-sales-automation/sync";
import {
  WEB_SALES_CHANNELS,
  type WebSalesChannel,
} from "@/lib/web-sales-automation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const period = validatePeriod(String(body.startDate || ""), String(body.endDate || ""));
    const requested: string[] = Array.isArray(body.channels) ? body.channels.map(String) : [];
    const channels = (requested.length > 0 ? requested : WEB_SALES_CHANNELS)
      .filter((channel): channel is WebSalesChannel =>
        WEB_SALES_CHANNELS.includes(channel as WebSalesChannel));
    if (channels.length === 0) {
      return NextResponse.json({ error: "同期対象を選択してください" }, { status: 400 });
    }

    const results = [];
    for (const channel of channels) {
      results.push(await runChannelSync(channel, period, "manual"));
    }
    const failed = results.filter((result) => result.status === "failed").length;
    const review = results.filter((result) => result.status === "needs_review").length;
    return NextResponse.json({
      ok: failed === 0,
      summary: { total: results.length, failed, review },
      results,
    }, { status: failed === results.length ? 502 : 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "自動同期に失敗しました" },
      { status: 500 },
    );
  }
}
