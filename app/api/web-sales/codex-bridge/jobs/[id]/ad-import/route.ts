import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import iconv from "iconv-lite";
import * as XLSX from "xlsx";
import { runOfficialFinanceAcquisition } from "@/lib/finance-acquisition/run";
import { POST as uploadMetaAds } from "@/app/api/meta-ads/upload-csv/route";
import { POST as matchMetaAds } from "@/app/api/meta-ads/auto-match/route";
import { POST as importMetaCosts } from "@/app/api/meta-ads/import-costs/route";
import { POST as uploadRakutenAds } from "@/app/api/rakuten-ads/upload-csv/route";
import { POST as matchRakutenAds } from "@/app/api/rakuten-ads/auto-match/route";
import { POST as importRakutenCosts } from "@/app/api/rakuten-ads/import-costs/route";
import { POST as uploadYahooAds } from "@/app/api/yahoo-ads/upload-csv/route";
import { POST as matchYahooAds } from "@/app/api/yahoo-ads/auto-match/route";
import { POST as importYahooCosts } from "@/app/api/yahoo-ads/import-costs/route";
import { POST as uploadAmazonAds } from "@/app/api/amazon-ads/upload-csv/route";
import { POST as matchAmazonAds } from "@/app/api/amazon-ads/auto-match/route";
import { POST as importAmazonCosts } from "@/app/api/amazon-ads/import-costs/route";
import { isCodexBridgeAuthorized, normalizeWorkerId } from "@/lib/web-sales-codex/server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdChannel = "google" | "meta" | "rakuten" | "yahoo" | "amazon";
type RouteHandler = (request: NextRequest) => Promise<Response>;

const MEDIA: Record<Exclude<AdChannel, "google">, {
  label: string;
  table: string;
  costColumn: string;
  upload: RouteHandler;
  match: RouteHandler;
  importCosts: RouteHandler;
}> = {
  meta: {
    label: "Meta広告",
    table: "meta_ads_performance",
    costColumn: "amount_spent",
    upload: uploadMetaAds,
    match: matchMetaAds,
    importCosts: importMetaCosts,
  },
  rakuten: {
    label: "楽天RPP広告",
    table: "rakuten_ads_performance",
    costColumn: "amount_spent",
    upload: uploadRakutenAds,
    match: matchRakutenAds,
    importCosts: importRakutenCosts,
  },
  yahoo: {
    label: "Yahoo広告",
    table: "yahoo_ads_performance",
    costColumn: "amount_spent",
    upload: uploadYahooAds,
    match: matchYahooAds,
    importCosts: importYahooCosts,
  },
  amazon: {
    label: "Amazon広告",
    table: "amazon_ads_performance",
    costColumn: "cost",
    upload: uploadAmazonAds,
    match: matchAmazonAds,
    importCosts: importAmazonCosts,
  },
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCodexBridgeAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const formData = await request.formData();
    const workerId = normalizeWorkerId(formData.get("workerId"));
    const supabase = getWebSalesAutomationServiceClient();
    const { data: job, error: jobError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,task_key,channel,status,worker_id,period_start,period_end,report_month")
      .eq("id", id)
      .single();
    if (jobError || !job) return NextResponse.json({ error: "タスクが見つかりません" }, { status: 404 });
    if (job.task_key !== "ad_cost_import" || !isAdChannel(job.channel)) {
      return NextResponse.json({ error: "広告費取込タスクではありません" }, { status: 409 });
    }
    if (job.status !== "running" || job.worker_id !== workerId) {
      return NextResponse.json({ error: "このPCが実行中のタスクではありません" }, { status: 409 });
    }

    const month = String(job.report_month).slice(0, 7);
    if (job.channel === "google") {
      return NextResponse.json(await runGoogleImport(month, job.period_start, job.period_end));
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "広告レポートファイルが必要です" }, { status: 400 });
    }
    await assertReportMonth(job.channel, file, month);
    const media = MEDIA[job.channel];

    const uploadForm = new FormData();
    uploadForm.set("file", file, file.name);
    uploadForm.set("month", month);
    const uploaded = await invoke(media.upload, request.url, uploadForm);
    const matched = await invoke(media.match, request.url, { month });

    const { count: unmatchedCount, error: unmatchedError } = await supabase
      .from(media.table)
      .select("id", { count: "exact", head: true })
      .eq("report_month", month)
      .is("series_code", null)
      .gt(media.costColumn, 0);
    if (unmatchedError) throw unmatchedError;
    if ((unmatchedCount || 0) > 0) {
      return NextResponse.json({
        status: "needs_review",
        summary: `${media.label}は${unmatchedCount}件の広告が未紐付けです`,
        details: "広告管理の該当媒体タブで紐付けを確認してから広告費取り込みを実行してください。",
        reportMonth: month,
        importedCount: Number(uploaded.inserted ?? uploaded.recordCount ?? 0),
        unmatchedCount,
        matchResult: matched,
      });
    }

    const imported = await invoke(media.importCosts, request.url, { month });
    const totalCost = Number(imported.totalCost ?? imported.amazon_cost ?? imported.yahoo_cost ?? 0);
    return NextResponse.json({
      status: "completed",
      summary: `${media.label} ${month} 広告費 ¥${Math.round(totalCost).toLocaleString("ja-JP")} を反映しました`,
      details: `${Number(uploaded.inserted ?? uploaded.recordCount ?? 0)}件の広告実績を更新しました。`,
      reportMonth: month,
      importedCount: Number(uploaded.inserted ?? uploaded.recordCount ?? 0),
      unmatchedCount: 0,
      totalCost,
      seriesCount: Number(imported.seriesCount ?? imported.series_count ?? 0),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "広告費を取り込めません" },
      { status: 500 },
    );
  }
}

async function runGoogleImport(month: string, startDate: string, endDate: string) {
  // The Bridge authorizes this immutable job above. Call the server service,
  // not public HTTP handlers whose admin-session guards must stay mandatory.
  const outcome = await runOfficialFinanceAcquisition("advertising", "google", {
    startDate, endDate, reportMonth: month,
  });
  return {
    status: outcome.status === "success" && !outcome.preservedExisting ? "completed" : "needs_review",
    summary: outcome.details,
    details: outcome.details,
    reportMonth: month,
    importedCount: outcome.importedCount,
    unmatchedCount: outcome.unmatchedCount || 0,
    totalCost: outcome.totalCost,
    acquisitionPath: "api",
    warnings: outcome.warnings,
  };
}

async function invoke(handler: RouteHandler, origin: string, body: FormData | Record<string, unknown>) {
  const request = body instanceof FormData
    ? new NextRequest(new URL("/internal-ad-import", origin), { method: "POST", body })
    : new NextRequest(new URL("/internal-ad-import", origin), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
  const response = await handler(request);
  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(String(payload.error || `広告APIエラー (${response.status})`));
  }
  return payload;
}

async function assertReportMonth(channel: Exclude<AdChannel, "google">, file: File, month: string) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const [year, monthNumber] = month.split("-");
  const expected = [month, `${year}/${monthNumber}`, `${year}/${Number(monthNumber)}`, `${year}年${monthNumber}月`, `${year}年${Number(monthNumber)}月`];
  let searchable = "";

  if (channel === "amazon") {
    const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
    });
    const headers = (rows[0] || []).map((value) => String(value || "").trim());
    const startDateIndex = headers.findIndex((value) => value === "開始日" || value === "Start Date");

    if (startDateIndex >= 0) {
      const observedMonths = new Set(
        rows
          .slice(1)
          .map((row) => getCellMonth(row[startDateIndex]))
          .filter((value): value is string => Boolean(value)),
      );
      if (observedMonths.size === 1 && observedMonths.has(month)) return;
      if (observedMonths.size > 0) {
        throw new Error(`広告レポートの対象月を${month}と確認できません`);
      }
    }

    searchable = XLSX.utils.sheet_to_csv(sheet).slice(0, 200_000);
  } else if (channel === "rakuten" && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const zip = await JSZip.loadAsync(bytes);
    const csv = Object.values(zip.files).find((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".csv"));
    if (!csv) throw new Error("楽天RPPのZIP内にCSVがありません");
    searchable = iconv.decode(await csv.async("nodebuffer"), "shift_jis");
  } else {
    const utf8 = bytes.toString("utf8");
    searchable = /広告セット名|商品コード|開始日|終了日/.test(utf8)
      ? utf8
      : iconv.decode(bytes, "shift_jis");
  }

  if (!expected.some((value) => searchable.includes(value))) {
    throw new Error(`広告レポートの対象月を${month}と確認できません`);
  }
}

function getCellMonth(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? `${parsed.y}-${String(parsed.m).padStart(2, "0")}` : null;
  }
  if (typeof value !== "string" || !value.trim()) return null;

  const normalized = value.trim();
  const numericDate = normalized.match(/^(\d{4})[\/-](\d{1,2})[\/-]\d{1,2}$/);
  if (numericDate) return `${numericDate[1]}-${numericDate[2].padStart(2, "0")}`;

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isAdChannel(value: unknown): value is AdChannel {
  return ["google", "meta", "rakuten", "yahoo", "amazon"].includes(String(value));
}
