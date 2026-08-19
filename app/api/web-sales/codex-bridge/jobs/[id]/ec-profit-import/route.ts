import { NextResponse } from "next/server";
import { z } from "zod";
import { isCodexBridgeAuthorized, normalizeWorkerId } from "@/lib/web-sales-codex/server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const money = z.number().finite().min(0).max(10_000_000_000);
const payloadSchema = z.object({
  workerId: z.string(),
  data: z.object({
    channel: z.enum(["amazon", "rakuten", "yahoo", "mercari", "base", "qoo10", "tiktok"]),
    report_month: z.string().regex(/^\d{4}-\d{2}$/),
    period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    report_basis: z.enum(["order", "transaction", "settlement", "mixed"]),
    coverage_level: z.enum(["complete", "partial", "needs_review"]),
    gross_sales: money,
    refunds: money,
    platform_fees: money,
    payment_fees: money,
    seller_discounts: money,
    seller_coupons: money,
    seller_points: money,
    shipping_costs: money,
    other_costs: money,
    other_credits: money,
    net_payout: money.nullable(),
    notes: z.string().max(4000).nullable().default(null),
    source_files: z.array(z.string().min(1).max(500)).min(1).max(20),
    excluded_marketplace_funded_discounts: money.default(0),
    excluded_ad_costs: money.default(0),
  }),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCodexBridgeAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const parsed = payloadSchema.parse(await request.json());
    const workerId = normalizeWorkerId(parsed.workerId);
    const data = parsed.data;
    const supabase = getWebSalesAutomationServiceClient();
    const { data: job, error: jobError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,task_key,channel,status,worker_id,period_start,period_end,report_month")
      .eq("id", id)
      .single();
    if (jobError || !job) return NextResponse.json({ error: "タスクが見つかりません" }, { status: 404 });
    if (job.task_key !== "ec_profit_import") {
      return NextResponse.json({ error: "EC控除取込タスクではありません" }, { status: 409 });
    }
    if (job.status !== "running" || job.worker_id !== workerId) {
      return NextResponse.json({ error: "このPCが実行中のタスクではありません" }, { status: 409 });
    }

    const jobMonth = String(job.report_month).slice(0, 7);
    if (data.channel !== job.channel
      || data.report_month !== jobMonth
      || data.period_start !== job.period_start
      || data.period_end !== job.period_end) {
      return NextResponse.json({ error: "タスクと取込データのECまたは対象期間が一致しません" }, { status: 400 });
    }

    const totalDeductions = data.refunds + data.platform_fees + data.payment_fees
      + data.seller_discounts + data.seller_coupons + data.seller_points
      + data.shipping_costs + data.other_costs;
    // Excluded marketplace-funded benefits and ad costs are informational.
    // The normalized contract reconciles only seller-borne EC deductions.
    const calculatedPayout = data.gross_sales
      - totalDeductions
      + data.other_credits;
    const payoutDifference = data.net_payout == null ? null : data.net_payout - calculatedPayout;
    const tolerance = Math.max(100, data.gross_sales * 0.005);
    const payoutIsDirectlyComparable = data.report_basis === "order"
      || data.report_basis === "transaction";
    const payoutNeedsReview = data.net_payout != null
      && payoutIsDirectlyComparable
      && Math.abs(payoutDifference || 0) > tolerance;
    const coverageLevel = payoutNeedsReview ? "needs_review" : data.coverage_level;

    const row = {
      channel: data.channel,
      report_month: `${data.report_month}-01`,
      period_start: data.period_start,
      period_end: data.period_end,
      report_basis: data.report_basis,
      coverage_level: coverageLevel,
      gross_sales: data.gross_sales,
      refunds: data.refunds,
      platform_fees: data.platform_fees,
      payment_fees: data.payment_fees,
      seller_discounts: data.seller_discounts,
      seller_coupons: data.seller_coupons,
      seller_points: data.seller_points,
      shipping_costs: data.shipping_costs,
      other_costs: data.other_costs,
      other_credits: data.other_credits,
      net_payout: data.net_payout,
      source_job_id: job.id,
      source_files: data.source_files.map((file) => file.replace(/^.*[\\/]/, "")),
      raw_summary: {
        ...data,
        calculated_payout: round(calculatedPayout),
        payout_difference: payoutDifference == null ? null : round(payoutDifference),
      },
      notes: data.notes,
      imported_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error: upsertError } = await supabase
      .from("ec_profit_monthly")
      .upsert(row, { onConflict: "channel,report_month" });
    if (upsertError) throw upsertError;

    const status = coverageLevel === "complete" ? "completed" : "needs_review";
    return NextResponse.json({
      status,
      summary: `${label(data.channel)} ${data.report_month}のEC控除 ¥${Math.round(totalDeductions - data.other_credits).toLocaleString("ja-JP")} を反映しました`,
      details: payoutNeedsReview
        ? `計算入金額とレポート入金額に ¥${Math.round(Math.abs(payoutDifference || 0)).toLocaleString("ja-JP")} の差があります。`
        : data.notes || "手数料・返金・店舗負担の割引等を月次利益へ反映しました。",
      importedCount: 1,
      reportMonth: data.report_month,
      totalDeductions: round(totalDeductions - data.other_credits),
      coverageLevel,
      payoutDifference: payoutDifference == null ? null : round(payoutDifference),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: `精算データ形式が正しくありません: ${error.issues[0]?.message || "validation error"}` }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "EC控除を取り込めません" },
      { status: 500 },
    );
  }
}

function label(channel: string) {
  return ({ amazon: "Amazon", rakuten: "楽天", yahoo: "Yahoo!", mercari: "メルカリShops", base: "BASE", qoo10: "Qoo10", tiktok: "TikTok Shop" } as Record<string, string>)[channel] || channel;
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
