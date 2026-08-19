"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  DownloadCloud,
  Loader2,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  ShoppingCart,
  Tag,
  WalletCards,
} from "lucide-react";

type ChannelRow = {
  channel: string;
  label: string;
  quantity: number;
  sales: number;
  productCost: number;
  productProfit: number;
  refunds: number;
  platformFees: number;
  paymentFees: number;
  sellerDiscounts: number;
  sellerCoupons: number;
  sellerPoints: number;
  shippingCosts: number;
  otherCosts: number;
  otherCredits: number;
  marketplaceFundedDiscounts: number;
  ecDeductions: number;
  directAdCost: number;
  finalProfit: number;
  profitRate: number;
  reportedGross: number;
  adjustedReportedGross: number;
  reconciliationDifference: number | null;
  netPayout: number | null;
  coverageLevel: "complete" | "partial" | "needs_review" | null;
  importedAt: string | null;
  settlementStatus: string;
  settlementAttemptedAt: string | null;
  settlementReason: string;
  retryPolicy: { mode: "automatic" | "after_action"; label: string };
  hasSettlement: boolean;
  settlementComplete: boolean;
  isEstimate: boolean;
  estimateBasis: string | null;
  estimateBasisMonths: string[];
};

type ProfitPayload = {
  month: string;
  channels: ChannelRow[];
  totals: {
    quantity: number;
    sales: number;
    productCost: number;
    productProfit: number;
    refunds: number;
    platformFees: number;
    paymentFees: number;
    sellerDiscounts: number;
    sellerCoupons: number;
    sellerPoints: number;
    shippingCosts: number;
    otherCosts: number;
    otherCredits: number;
    marketplaceFundedDiscounts: number;
    ecDeductions: number;
    adCost: number;
    sharedAdCost: number;
    finalProfit: number;
    profitRate: number;
    netPayout: number;
  };
  adCosts: AdCostBreakdown;
  comparisons: {
    previousMonth: ComparisonPayload;
    previousYear: ComparisonPayload;
  };
  completeness: {
    isFinal: boolean;
    completedSettlements: number;
    estimatedSettlements: number;
    totalSettlements: number;
    missingChannels: string[];
    settlementIssues: Array<{
      channel: string;
      label: string;
      status: string;
      progress: number;
      currentStep: string | null;
      startedAt: string | null;
      heartbeatAt: string | null;
      attemptedAt: string | null;
      reason: string;
      isEstimate: boolean;
      estimateBasis: string | null;
      retryPolicy: { mode: "automatic" | "after_action"; label: string };
    }>;
    salesJobs: { total: number; completed: number; waiting: number };
    adJobs: { total: number; completed: number; waiting: number };
  };
};

type SettlementIssue = ProfitPayload["completeness"]["settlementIssues"][number];

type AdCostBreakdown = {
  google: number;
  meta: number;
  amazon: number;
  rakuten: number;
  yahoo: number;
  other: number;
};

type ComparisonPayload = {
  month: string;
  totals: Omit<ProfitPayload["totals"], "netPayout">;
  adCosts: AdCostBreakdown;
  channels: Array<Pick<ChannelRow, "channel" | "directAdCost">>;
};

const CHANNEL_CARD_STYLES: Record<string, string> = {
  amazon: "border-green-200 bg-green-50",
  rakuten: "border-red-200 bg-red-50",
  yahoo: "border-orange-200 bg-orange-50",
  mercari: "border-yellow-200 bg-yellow-50",
  base: "border-blue-200 bg-blue-50",
  qoo10: "border-pink-200 bg-pink-50",
  tiktok: "border-teal-200 bg-teal-50",
};

const CHROME_HOST_BY_CHANNEL: Record<string, string> = {
  rakuten: "billpay.rakuten.co.jp",
  qoo10: "qsm.qoo10.jp",
};

export default function EcProfitOverview({ month }: { month: string }) {
  const [data, setData] = useState<ProfitPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [action, setAction] = useState<"estimate" | "official" | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/web-sales/ec-profit?month=${encodeURIComponent(month)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "EC利益を取得できません");
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "EC利益を取得できません");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const hasActiveSettlementJob = data?.completeness.settlementIssues.some(
      (issue) => issue.status === "queued" || issue.status === "running",
    );
    if (!hasActiveSettlementJob) {
      if (actionMessage?.includes("開始しました")) {
        setActionMessage("再取得処理は完了しました。結果を反映しました。");
      }
      return;
    }

    const timer = window.setTimeout(() => {
      void load();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [data, actionMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !data) {
    return (
      <div className="flex min-h-72 items-center justify-center border-y border-slate-200 bg-white text-sm text-slate-500">
        <Loader2 size={18} className="mr-2 animate-spin" /> 月次利益を集計しています
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-between gap-4 border-l-4 border-red-500 bg-red-50 px-4 py-4 text-sm text-red-800">
        <span>{error || "EC利益を取得できません"}</span>
        <button type="button" onClick={load} className="flex size-10 shrink-0 items-center justify-center rounded border border-red-200 bg-white" title="再読み込み">
          <RefreshCw size={16} />
        </button>
      </div>
    );
  }

  const recalculateEstimate = async () => {
    setAction("estimate");
    setActionMessage(null);
    try {
      const response = await fetch("/api/web-sales/ec-profit/estimate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month, channels: data.completeness.missingChannels }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "概算を再計算できません");
      await load();
      setActionMessage(`概算を再計算しました（${payload.estimated || 0}媒体更新）`);
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : "概算を再計算できません");
    } finally {
      setAction(null);
    }
  };

  const retryOfficial = async () => {
    setAction("official");
    setActionMessage(null);
    try {
      const period = monthPeriod(month);
      const response = await fetch("/api/web-sales/codex-jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          taskKey: "ec_profit_import",
          channels: data.completeness.missingChannels,
          startDate: period.startDate,
          endDate: period.endDate,
          incompleteOnly: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "公式データの再取得を開始できません");
      setActionMessage(payload.jobs?.length
        ? `公式データの再取得を${payload.jobs.length}媒体で開始しました`
        : "すでに実行中、または再取得対象はありません");
      await load();
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : "公式データの再取得を開始できません");
    } finally {
      setAction(null);
    }
  };

  const profitLabel = data.completeness.isFinal
    ? "最終利益"
    : data.completeness.estimatedSettlements > 0
      ? "概算利益"
      : "暫定利益";
  const previousMonth = data.comparisons.previousMonth;
  const previousYear = data.comparisons.previousYear;
  const displayedAdCosts = authoritativeAdCosts(data);
  const previousMonthAdCosts = authoritativeAdCosts(previousMonth);
  const previousYearAdCosts = authoritativeAdCosts(previousYear);
  const waitingForChromeIssues = data.completeness.settlementIssues.filter(
    (issue) => issue.status === "waiting_for_user"
      && /(browser security policy|declined permission|Chrome.*(?:アクセス|許可|セキュリティ))/i.test(issue.reason),
  );
  const waitingForChromeHosts = waitingForChromeIssues.map(
    (issue) => CHROME_HOST_BY_CHANNEL[issue.channel] || issue.label,
  );
  const activeSettlementIssues = data.completeness.settlementIssues.filter(
    (issue) => issue.status === "queued" || issue.status === "running",
  );
  const stalledSettlementIssues = activeSettlementIssues.filter(
    (issue) => issue.status === "running" && isHeartbeatStale(issue.heartbeatAt),
  );
  const operatorSettlementIssues = data.completeness.settlementIssues.filter(
    (issue) => issue.status === "waiting_for_user",
  );
  const failedSettlementIssues = data.completeness.settlementIssues.filter(
    (issue) => issue.status === "failed",
  );
  const feeTotal = data.totals.platformFees + data.totals.paymentFees;
  const promotionTotal = data.totals.sellerDiscounts + data.totals.sellerCoupons + data.totals.sellerPoints;
  const refundEtcTotal = data.totals.refunds + data.totals.shippingCosts + data.totals.otherCosts - data.totals.otherCredits;
  const otherEcDeductions = promotionTotal + refundEtcTotal;

  const metrics = [
    { label: "売上", value: data.totals.sales, icon: ShoppingCart, tone: "blue", note: `${formatNumber(data.totals.quantity)}個` },
    { label: "商品原価", value: data.totals.productCost, icon: PackageCheck, tone: "slate", note: "EC控除を除く" },
    {
      label: "EC手数料",
      value: feeTotal,
      icon: ReceiptText,
      tone: "amber",
      note: `販売 ${yen(data.totals.platformFees)} / 決済 ${yen(data.totals.paymentFees)}`,
      comparison: metricComparison(feeTotal, feeValue(previousMonth), feeValue(previousYear)),
    },
    {
      label: "値引・返金等",
      value: otherEcDeductions,
      icon: Tag,
      tone: "rose",
      note: `値引等 ${yen(promotionTotal)} / 返金等 ${yen(refundEtcTotal)}`,
      comparison: metricComparison(otherEcDeductions, otherEcValue(previousMonth), otherEcValue(previousYear)),
    },
    {
      label: "広告費",
      value: data.totals.adCost,
      icon: CircleDollarSign,
      tone: "orange",
      note: `共通 ${yen(data.totals.sharedAdCost)}`,
      comparison: metricComparison(data.totals.adCost, previousMonth.totals.adCost, previousYear.totals.adCost),
    },
    { label: profitLabel, value: data.totals.finalProfit, icon: WalletCards, tone: data.totals.finalProfit >= 0 ? "emerald" : "red", note: `${data.totals.profitRate.toFixed(1)}%` },
    { label: "入金レポート合計", value: data.totals.netPayout, icon: CheckCircle2, tone: "cyan", note: `${data.completeness.completedSettlements}/${data.completeness.totalSettlements}媒体` },
  ];

  return (
    <div className="space-y-5">
      <section className="border-y border-slate-200 bg-white px-3 py-4 sm:px-5">
        <div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-slate-950">EC月次利益</h2>
              <span className={`rounded px-2 py-1 text-xs font-semibold ${data.completeness.isFinal ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                {data.completeness.isFinal
                  ? "精算取得済み"
                  : `精算 ${data.completeness.completedSettlements}/7${data.completeness.estimatedSettlements ? `・概算 ${data.completeness.estimatedSettlements}` : ""}`}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">売上 − 商品原価 − EC手数料・値引・返金 − 広告費</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded border border-slate-200 bg-slate-200 text-center sm:max-w-2xl">
          <CompletionCell label="商品売上" value={data.completeness.salesJobs.completed} total={data.completeness.salesJobs.total} />
          <CompletionCell label="EC精算" value={data.completeness.completedSettlements} total={data.completeness.totalSettlements} />
          <CompletionCell label="広告費" value={data.completeness.adJobs.completed} total={data.completeness.adJobs.total} />
        </div>

        <SettlementActivityStatus
          active={activeSettlementIssues}
          stalled={stalledSettlementIssues}
          operatorWaiting={operatorSettlementIssues}
          failed={failedSettlementIssues}
          incompleteCount={data.completeness.settlementIssues.length}
        />
      </section>

      {!data.completeness.isFinal && (
        <div className="border-l-4 border-amber-500 bg-amber-50 px-4 py-4 text-sm text-amber-950">
          <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
              <strong>EC精算が{data.completeness.completedSettlements}/7の理由</strong>
              <p className="mt-0.5 text-xs text-amber-800">概算計上中の媒体は過去の公式精算比率で利益へ反映済みです。公式明細を取得でき次第、自動で確定値へ置き換えます。</p>
            </div>
          </div>
          <div className="mt-3 divide-y divide-amber-200 border-y border-amber-200">
            {data.completeness.settlementIssues.map((issue) => (
              <div key={issue.channel} className="grid gap-1 py-2.5 sm:grid-cols-[140px_minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                <div className="flex items-center gap-2">
                  <strong className="text-xs">{issue.label}</strong>
                  {issue.isEstimate && <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">概算計上中</span>}
                </div>
                <div className="min-w-0">
                  <span className="block text-xs leading-5 text-amber-900">{issue.reason}</span>
                  <span className="mt-0.5 block text-[11px] font-medium text-amber-700">
                    最終実行: {issue.attemptedAt ? formatDateTime(issue.attemptedAt) : "未実行"}・{settlementStatusLabel(issue.status)}
                  </span>
                  {(issue.status === "queued" || issue.status === "running") && (
                    <span className="mt-1 block text-[11px] font-bold text-blue-800">
                      {issue.status === "queued" ? "順番待ち" : `${issue.currentStep || "処理中"}（${Math.round(issue.progress || 0)}%）`}
                      {issue.heartbeatAt ? `・最終応答 ${formatTime(issue.heartbeatAt)}` : ""}
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-start gap-1 sm:items-end">
                  <SettlementStatusBadge issue={issue} />
                  {issue.status !== "queued" && issue.status !== "running" && (
                    <span className={`inline-flex w-fit items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold ${issue.retryPolicy.mode === "automatic" ? "bg-blue-100 text-blue-800" : "bg-white text-amber-900"}`}>
                      <CalendarClock size={13} /> 次回: {issue.retryPolicy.label}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <button type="button" onClick={recalculateEstimate} disabled={action !== null} className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-amber-300 bg-white px-4 text-xs font-bold text-amber-950 disabled:opacity-50">
              {action === "estimate" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              概算を再計算
            </button>
            <button type="button" onClick={retryOfficial} disabled={action !== null} className="inline-flex min-h-10 items-center justify-center gap-2 rounded bg-slate-900 px-4 text-xs font-bold text-white disabled:opacity-50">
              {action === "official" ? <Loader2 size={15} className="animate-spin" /> : <DownloadCloud size={15} />}
              公式データを再取得
            </button>
            {actionMessage && <span className="text-xs font-medium text-amber-900">{actionMessage}</span>}
          </div>
          {waitingForChromeHosts.length > 0 && (
            <div className="mt-2 border-l-2 border-amber-400 pl-3 text-[11px] leading-5 text-amber-800">
              <p>
                Chrome操作許可は全EC共通で、ログインとは別にサイトのホスト単位で管理されます。
                今回未許可: <span className="font-semibold">{waitingForChromeHosts.join(" / ")}</span>
              </p>
              <p>他媒体はすでに許可済み、または保存済みの原本を再利用できたため確認が出ていません。</p>
              <div className="mt-2 text-amber-950">
                <strong>日本語版Codexでの設定手順</strong>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                  <li>Codexアプリで「設定」を開きます。</li>
                  <li>左側の「コンピューターの使用」を開きます。</li>
                  <li>「制御」欄の「Google Chrome」にある「管理」を押します。</li>
                  <li>「サイトの権限」で「追加」を押します。</li>
                  <li>上記の未許可ホストを1件入力し、「閲覧を許可」を選んで「追加」します。残りのホストも同様に追加します。</li>
                  <li>TSAへ戻り「公式データを再取得」を押します。</li>
                </ol>
                <p className="mt-1">すでに対象ホストが「閲覧をブロック」で登録されている場合は、その行を開いて「閲覧を許可」へ変更してください。</p>
              </div>
            </div>
          )}
        </div>
      )}

      <section className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="border-y border-slate-200 bg-white px-3 py-4 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">EC別 経費内訳</h3>
            <p className="mt-0.5 text-xs text-slate-500">販売・決済手数料から値引、返金、送料、広告費まで媒体別に確認できます</p>
          </div>
          <div className="text-[11px] text-slate-500">金額下は売上比</div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4 2xl:grid-cols-7">
          {data.channels.map((row) => <ChannelExpenseCard key={row.channel} row={row} />)}
        </div>
        <p className="mt-2 text-[10px] text-slate-500">Google・Meta・その他の共通広告費はEC別カードへ重複配賦せず、広告費合計と最終利益で控除しています。</p>
      </section>

      <section className="border-y border-slate-200 bg-white px-3 py-4 sm:px-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">経費サマリー</h3>
            <p className="mt-0.5 text-xs text-slate-500">主要経費の売上比と前月・前年同月からの増減をまとめています</p>
          </div>
          <div className="text-[11px] text-slate-500">前月 {previousMonth.month} / 前年 {previousYear.month}</div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <ExpenseComparison
            label="販売・決済手数料"
            value={feeTotal}
            sales={data.totals.sales}
            previous={feeValue(previousMonth)}
            previousYear={feeValue(previousYear)}
          />
          <ExpenseComparison
            label="値引・クーポン・ポイント"
            value={promotionTotal}
            sales={data.totals.sales}
            previous={promotionValue(previousMonth)}
            previousYear={promotionValue(previousYear)}
          />
          <ExpenseComparison
            label="返金・送料・その他"
            value={refundEtcTotal}
            sales={data.totals.sales}
            previous={refundEtcValue(previousMonth)}
            previousYear={refundEtcValue(previousYear)}
          />
          <ExpenseComparison
            label="広告費"
            value={data.totals.adCost}
            sales={data.totals.sales}
            previous={previousMonth.totals.adCost}
            previousYear={previousYear.totals.adCost}
          />
        </div>

        <div className="mt-4 border-t border-slate-200 pt-3">
          <div className="flex flex-wrap items-end justify-between gap-1">
            <h4 className="text-xs font-bold text-slate-800">広告費の媒体内訳</h4>
            <p className="text-[10px] text-slate-500">EC精算内の広告請求が専用広告データより大きい場合は精算値を採用</p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3 xl:grid-cols-6">
            {([
              ["Google", "google"],
              ["Meta", "meta"],
              ["Amazon", "amazon"],
              ["楽天", "rakuten"],
              ["Yahoo!", "yahoo"],
              ["その他", "other"],
            ] as const).map(([label, key]) => (
              <AdPlatformValue
                key={key}
                label={label}
                value={displayedAdCosts[key]}
                previous={previousMonthAdCosts[key]}
                previousYear={previousYearAdCosts[key]}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white px-3 py-4 sm:px-5">
        <h3 className="text-sm font-bold text-slate-900">利益の内訳</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:grid-cols-7">
          <FormulaValue label="売上" value={data.totals.sales} positive />
          <FormulaValue label="商品原価" value={-data.totals.productCost} />
          <FormulaValue label="手数料" value={-(data.totals.platformFees + data.totals.paymentFees)} />
          <FormulaValue label="値引・クーポン" value={-(data.totals.sellerDiscounts + data.totals.sellerCoupons + data.totals.sellerPoints)} />
          <FormulaValue label="返金・送料等" value={-(data.totals.refunds + data.totals.shippingCosts + data.totals.otherCosts - data.totals.otherCredits)} />
          <FormulaValue label="広告費" value={-data.totals.adCost} />
          <FormulaValue label={profitLabel} value={data.totals.finalProfit} result />
        </div>
        {data.totals.marketplaceFundedDiscounts > 0 && (
          <p className="mt-2 text-[11px] text-emerald-700">モール負担クーポン補填 {yen(data.totals.marketplaceFundedDiscounts)} はTSA売上に含まれるため、利益へ二重加算せず売上照合に反映しています。</p>
        )}
      </section>

      <section className="overflow-hidden border-y border-slate-200 bg-white">
        <div className="flex items-center justify-between px-3 py-4 sm:px-5">
          <div>
            <h3 className="text-base font-bold text-slate-950">EC別利益</h3>
            <p className="mt-0.5 text-xs text-slate-500">行を開くと手数料・割引の内訳と売上照合を確認できます</p>
          </div>
          <Tag size={18} className="text-slate-400" />
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[1080px] table-fixed text-sm">
            <thead className="border-y border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="w-44 px-5 py-3 text-left font-semibold">EC</th>
                <th className="px-3 py-3 text-right font-semibold">売上</th>
                <RateHeading label="商品利益" rateLabel="利益率" />
                <RateHeading label="手数料" rateLabel="手数料率" />
                <RateHeading label="値引等" rateLabel="値引率" />
                <RateHeading label="返金等" rateLabel="返金等率" />
                <RateHeading label="広告費" rateLabel="広告比率" />
                <RateHeading label="最終利益" rateLabel="利益率" />
                <th className="w-16 px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.channels.map((row) => (
                <DesktopChannelRows key={row.channel} row={row} open={expanded === row.channel} onToggle={() => setExpanded(expanded === row.channel ? null : row.channel)} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-slate-200 lg:hidden">
          {data.channels.map((row) => (
            <MobileChannel key={row.channel} row={row} open={expanded === row.channel} onToggle={() => setExpanded(expanded === row.channel ? null : row.channel)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function SettlementActivityStatus({
  active,
  stalled,
  operatorWaiting,
  failed,
  incompleteCount,
}: {
  active: SettlementIssue[];
  stalled: SettlementIssue[];
  operatorWaiting: SettlementIssue[];
  failed: SettlementIssue[];
  incompleteCount: number;
}) {
  if (stalled.length > 0) {
    return (
      <div className="mt-3 flex items-start gap-2 border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-red-900">
        <AlertTriangle size={17} className="mt-0.5 shrink-0" />
        <div>
          <strong className="text-sm">応答停止の可能性: {stalled.map((issue) => issue.label).join(" / ")}</strong>
          <p className="mt-0.5 text-xs">Bridgeから2分以上応答がありません。自動更新を続けています。</p>
        </div>
      </div>
    );
  }
  if (active.length > 0) {
    const running = active.filter((issue) => issue.status === "running");
    const queued = active.filter((issue) => issue.status === "queued");
    return (
      <div className="mt-3 flex items-start gap-2 border-l-4 border-blue-500 bg-blue-50 px-3 py-2.5 text-blue-950">
        <Loader2 size={17} className="mt-0.5 shrink-0 animate-spin" />
        <div>
          <strong className="text-sm">
            現在実行中: {running.map((issue) => `${issue.label} ${Math.round(issue.progress || 0)}%`).join(" / ") || "開始準備中"}
          </strong>
          <p className="mt-0.5 text-xs">
            {running.map((issue) => issue.currentStep || "処理中").join(" / ")}
            {queued.length > 0 ? `・次の順番: ${queued.map((issue) => issue.label).join(" / ")}` : ""}
          </p>
        </div>
      </div>
    );
  }
  if (failed.length > 0) {
    return (
      <div className="mt-3 flex items-start gap-2 border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-red-900">
        <AlertTriangle size={17} className="mt-0.5 shrink-0" />
        <div><strong className="text-sm">処理停止・エラー: {failed.map((issue) => issue.label).join(" / ")}</strong></div>
      </div>
    );
  }
  if (operatorWaiting.length > 0) {
    return (
      <div className="mt-3 flex items-start gap-2 border-l-4 border-amber-500 bg-amber-50 px-3 py-2.5 text-amber-950">
        <AlertTriangle size={17} className="mt-0.5 shrink-0" />
        <div><strong className="text-sm">操作待ち: {operatorWaiting.map((issue) => issue.label).join(" / ")}</strong></div>
      </div>
    );
  }
  return (
    <div className="mt-3 flex items-start gap-2 border-l-4 border-slate-400 bg-slate-50 px-3 py-2.5 text-slate-800">
      <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" />
      <div>
        <strong className="text-sm">現在、実行中の処理はありません</strong>
        <p className="mt-0.5 text-xs">
          {incompleteCount > 0
            ? `${incompleteCount}媒体は処理完了済みで、公式明細の公開待ちです。次回予定時刻に自動確認します。`
            : "すべての精算取得が完了しています。"}
        </p>
      </div>
    </div>
  );
}

function SettlementStatusBadge({ issue }: { issue: SettlementIssue }) {
  if (issue.status === "running") {
    const stalled = isHeartbeatStale(issue.heartbeatAt);
    return (
      <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold ${stalled ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"}`}>
        {stalled ? <AlertTriangle size={13} /> : <Loader2 size={13} className="animate-spin" />}
        {stalled ? "応答停止の可能性" : `実行中 ${Math.round(issue.progress || 0)}%`}
      </span>
    );
  }
  const styles: Record<string, string> = {
    queued: "bg-slate-200 text-slate-800",
    needs_review: "bg-amber-200 text-amber-900",
    waiting_for_user: "bg-orange-200 text-orange-900",
    failed: "bg-red-100 text-red-800",
    completed: "bg-emerald-100 text-emerald-800",
    not_started: "bg-slate-200 text-slate-700",
  };
  return (
    <span className={`inline-flex w-fit items-center gap-1 rounded px-2 py-1 text-[11px] font-bold ${styles[issue.status] || styles.not_started}`}>
      {settlementStatusLabel(issue.status)}
    </span>
  );
}

function MetricCard({ label, value, note, icon: Icon, tone, comparison }: { label: string; value: number; note: string; icon: typeof ShoppingCart; tone: string; comparison?: { previous: number | null; previousYear: number | null } }) {
  const styles: Record<string, string> = {
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    slate: "border-slate-200 bg-slate-50 text-slate-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    orange: "border-orange-200 bg-orange-50 text-orange-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    red: "border-red-200 bg-red-50 text-red-800",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-800",
  };
  return (
    <div className={`min-w-0 rounded-md border p-3 ${styles[tone] || styles.slate}`}>
      <div className="flex items-center gap-2 text-xs font-semibold opacity-75"><Icon size={15} />{label}</div>
      <div className="mt-2 truncate text-lg font-bold tabular-nums" title={yen(value)}>{yen(value)}</div>
      <div className="mt-1 truncate text-[11px] opacity-70" title={note}>{note}</div>
      {comparison && (
        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 border-t border-current/10 pt-1.5">
          <CompactDelta label="前月" value={comparison.previous} />
          <CompactDelta label="前年" value={comparison.previousYear} />
        </div>
      )}
    </div>
  );
}

function ExpenseComparison({ label, value, sales, previous, previousYear }: { label: string; value: number; sales: number; previous: number; previousYear: number }) {
  return (
    <div className="min-w-0 border-l-2 border-amber-400 bg-slate-50 px-3 py-2.5">
      <div className="truncate text-[11px] font-semibold text-slate-600" title={label}>{label}</div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <strong className="truncate text-base tabular-nums text-slate-950" title={yen(value)}>{yen(value)}</strong>
        <span className="shrink-0 text-[10px] text-slate-500">売上比 {formatRate(rateOf(value, sales) || 0)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-200 pt-1.5">
        <CompactDelta label="前月" value={changeRate(value, previous)} />
        <CompactDelta label="前年" value={changeRate(value, previousYear)} />
      </div>
    </div>
  );
}

function AdPlatformValue({ label, value, previous, previousYear }: { label: string; value: number; previous: number; previousYear: number }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-sm font-bold tabular-nums text-slate-900" title={yen(value)}>{yen(value)}</div>
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
        <CompactDelta label="前月" value={changeRate(value, previous)} />
        <CompactDelta label="前年" value={changeRate(value, previousYear)} />
      </div>
    </div>
  );
}

function CompactDelta({ label, value }: { label: string; value: number | null }) {
  if (value == null) return <span className="text-[10px] text-slate-400">{label} -</span>;
  return (
    <span className={`text-[10px] font-semibold ${value > 0 ? "text-red-600" : value < 0 ? "text-emerald-700" : "text-slate-500"}`}>
      {label} {value > 0 ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

function CompletionCell({ label, value, total }: { label: string; value: number; total: number }) {
  const complete = value === total;
  return (
    <div className="bg-white px-2 py-2.5">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`mt-0.5 text-sm font-bold tabular-nums ${complete ? "text-emerald-700" : "text-amber-700"}`}>{value}/{total}</div>
    </div>
  );
}

function FormulaValue({ label, value, positive, result }: { label: string; value: number; positive?: boolean; result?: boolean }) {
  return (
    <div className={`min-w-0 border-l-2 px-2 ${result ? "border-emerald-500 bg-emerald-50 py-2" : "border-slate-200 py-1"}`}>
      <div className="truncate text-[11px] text-slate-500">{label}</div>
      <div className={`mt-1 truncate font-bold tabular-nums ${result ? value >= 0 ? "text-emerald-700" : "text-red-700" : positive ? "text-blue-700" : "text-slate-800"}`} title={signedYen(value)}>{signedYen(value)}</div>
    </div>
  );
}

function ChannelExpenseCard({ row }: { row: ChannelRow }) {
  const fees = row.platformFees + row.paymentFees;
  const promotions = row.sellerDiscounts + row.sellerCoupons + row.sellerPoints;
  const refundEtc = row.refunds + row.shippingCosts + row.otherCosts - row.otherCredits;
  const totalExpenses = row.ecDeductions + row.directAdCost;
  return (
    <article className={`flex min-h-[285px] min-w-0 flex-col rounded-md border p-3 ${CHANNEL_CARD_STYLES[row.channel] || "border-slate-200 bg-slate-50"}`}>
      <div className="border-b border-current/10 pb-2">
        <div className="flex items-start justify-between gap-2">
          <h4 className="truncate text-sm font-bold text-slate-950" title={row.label}>{row.label}</h4>
          <span className="shrink-0 text-[10px] font-medium text-slate-500">売上 {yen(row.sales)}</span>
        </div>
        <div className="mt-2 flex items-end justify-between gap-2">
          <span className="text-[11px] font-semibold text-slate-600">EC控除</span>
          <div className="text-right">
            <strong className="block text-lg tabular-nums text-slate-950">{yen(row.ecDeductions)}</strong>
            <span className="block text-[10px] font-bold text-orange-700">{formatNullableRate(rateOf(row.ecDeductions, row.sales))}</span>
          </div>
        </div>
        <StatusText row={row} />
      </div>

      <div className="mt-2 flex-1 space-y-1.5">
        <ExpenseCardLine label="販売手数料" value={row.platformFees} sales={row.sales} />
        <ExpenseCardLine label="決済手数料" value={row.paymentFees} sales={row.sales} />
        <ExpenseCardLine label="手数料計" value={fees} sales={row.sales} strong />
        <ExpenseCardLine label="値引・クーポン等" value={promotions} sales={row.sales} />
        {row.marketplaceFundedDiscounts > 0 && (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 text-[10px] font-semibold text-emerald-700">
            <span className="truncate" title="モール負担クーポン補填">モール負担補填</span>
            <span className="whitespace-nowrap tabular-nums">+{yen(row.marketplaceFundedDiscounts)}</span>
          </div>
        )}
        <ExpenseCardLine label="返金・送料・その他" value={refundEtc} sales={row.sales} />
        <ExpenseCardLine label="広告費" value={row.directAdCost} sales={row.sales} />
      </div>

      <div className="mt-3 border-t border-current/10 pt-2">
        <ExpenseCardLine label="経費合計" value={totalExpenses} sales={row.sales} strong />
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
          <span className="font-medium text-slate-600">最終利益</span>
          <strong className={`tabular-nums ${row.finalProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>{yen(row.finalProfit)}</strong>
        </div>
      </div>
    </article>
  );
}

function ExpenseCardLine({ label, value, sales, strong }: { label: string; value: number; sales: number; strong?: boolean }) {
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-2 text-[10px] ${strong ? "font-bold text-slate-900" : "text-slate-600"}`}>
      <span className="truncate" title={label}>{label}</span>
      <span className="whitespace-nowrap tabular-nums">{value ? yen(value) : "—"} <span className="text-[9px] font-medium opacity-65">{formatNullableRate(rateOf(value, sales))}</span></span>
    </div>
  );
}

function DesktopChannelRows({ row, open, onToggle }: { row: ChannelRow; open: boolean; onToggle: () => void }) {
  const fees = row.platformFees + row.paymentFees;
  const promotions = row.sellerDiscounts + row.sellerCoupons + row.sellerPoints;
  const refundEtc = row.refunds + row.shippingCosts + row.otherCosts - row.otherCredits;
  return (
    <>
      <tr className="border-b border-slate-100 hover:bg-slate-50">
        <td className="px-5 py-3">
          <div className="font-bold text-slate-950">{row.label}</div>
          <StatusText row={row} />
        </td>
        <MoneyCell value={row.sales} />
        <MoneyCell value={row.productProfit} rate={rateOf(row.productProfit, row.sales)} />
        <MoneyCell value={fees} rate={rateOf(fees, row.sales)} muted />
        <MoneyCell value={promotions} rate={rateOf(promotions, row.sales)} muted />
        <MoneyCell value={refundEtc} rate={rateOf(refundEtc, row.sales)} muted />
        <MoneyCell value={row.directAdCost} rate={rateOf(row.directAdCost, row.sales)} muted />
        <td className={`px-3 py-3 text-right font-bold tabular-nums ${row.finalProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>
          <div>{yen(row.finalProfit)}</div>
          <div className="text-[11px]">{row.profitRate.toFixed(1)}%</div>
        </td>
        <td className="px-3 py-3 text-right">
          <button type="button" onClick={onToggle} className="inline-flex size-9 items-center justify-center rounded border border-slate-200 bg-white" title="内訳を見る">
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </td>
      </tr>
      {open && <tr className="border-b border-slate-200 bg-slate-50"><td colSpan={9} className="px-5 py-4"><ChannelDetails row={row} /></td></tr>}
    </>
  );
}

function MobileChannel({ row, open, onToggle }: { row: ChannelRow; open: boolean; onToggle: () => void }) {
  return (
    <div className="px-3 py-4">
      <button type="button" onClick={onToggle} className="flex w-full items-start justify-between gap-3 text-left">
        <div>
          <div className="font-bold text-slate-950">{row.label}</div>
          <StatusText row={row} />
        </div>
        <div className="text-right">
          <div className={`font-bold tabular-nums ${row.finalProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{yen(row.finalProfit)}</div>
          <div className="text-xs text-slate-500">{row.profitRate.toFixed(1)}%</div>
        </div>
      </button>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <SmallValue label="売上" value={row.sales} />
        <SmallValue label="商品利益" value={row.productProfit} rate={rateOf(row.productProfit, row.sales)} />
        <SmallValue label="EC控除" value={row.ecDeductions} rate={rateOf(row.ecDeductions, row.sales)} />
      </div>
      {open && <div className="mt-4 border-t border-slate-200 pt-4"><ChannelDetails row={row} /></div>}
    </div>
  );
}

function ChannelDetails({ row }: { row: ChannelRow }) {
  const values = [
    ["販売・決済手数料", row.platformFees + row.paymentFees],
    ["店舗負担値引", row.sellerDiscounts],
    ["店舗負担クーポン", row.sellerCoupons],
    ["店舗負担ポイント", row.sellerPoints],
    ["返金", row.refunds],
    ["送料・出荷費", row.shippingCosts],
    ["その他（控除−戻入）", row.otherCosts - row.otherCredits],
  ] as const;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4">
        {values.map(([label, value]) => <SmallValue key={label} label={label} value={value} rate={rateOf(value, row.sales)} />)}
      </div>
      <div className="border-l-2 border-slate-200 pl-3 text-xs text-slate-600">
        <div className="flex justify-between gap-3"><span>TSA売上</span><strong>{yen(row.sales)}</strong></div>
        <div className="mt-1 flex justify-between gap-3"><span>{row.isEstimate ? "概算基準売上" : "レポート売上"}</span><strong>{row.hasSettlement ? yen(row.reportedGross) : "未取得"}</strong></div>
        {row.marketplaceFundedDiscounts > 0 && (
          <>
            <div className="mt-1 flex justify-between gap-3 text-emerald-700"><span>モール負担クーポン補填</span><strong>+{yen(row.marketplaceFundedDiscounts)}</strong></div>
            <div className="mt-1 flex justify-between gap-3 font-semibold text-slate-800"><span>補填後レポート売上</span><strong>{yen(row.adjustedReportedGross)}</strong></div>
          </>
        )}
        {row.reconciliationDifference != null && (
          <div className={`mt-1 flex justify-between gap-3 ${Math.abs(row.reconciliationDifference) > 100 ? "text-amber-700" : "text-emerald-700"}`}>
            <span>{row.marketplaceFundedDiscounts > 0 ? "補填後照合差額" : "照合差額"}</span><strong>{signedYen(row.reconciliationDifference)}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusText({ row }: { row: ChannelRow }) {
  const text = row.settlementComplete ? "精算取得済み" : row.isEstimate ? "概算値" : !row.hasSettlement ? "精算未取得" : row.coverageLevel === "partial" ? "期間途中" : "要確認";
  const color = row.settlementComplete ? "text-emerald-700" : row.isEstimate ? "text-amber-700" : row.coverageLevel === "partial" ? "text-blue-700" : "text-amber-700";
  return <div className={`mt-0.5 text-[11px] font-medium ${color}`} title={row.settlementReason}>{text} / {formatNumber(row.quantity)}個</div>;
}

function RateHeading({ label, rateLabel }: { label: string; rateLabel: string }) {
  return (
    <th className="px-3 py-2.5 text-right font-semibold">
      <span className="block">{label}</span>
      <span className="mt-0.5 block text-[10px] font-normal text-slate-400">{rateLabel}</span>
    </th>
  );
}

function MoneyCell({ value, rate, muted }: { value: number; rate?: number | null; muted?: boolean }) {
  return (
    <td className={`px-3 py-3 text-right tabular-nums ${muted ? "text-slate-500" : "font-semibold text-slate-900"}`}>
      <div className="truncate" title={yen(value)}>{value ? yen(value) : "—"}</div>
      {rate != null && <div className="mt-0.5 text-[10px] font-medium text-slate-400">{formatRate(rate)}</div>}
    </td>
  );
}

function SmallValue({ label, value, rate }: { label: string; value: number; rate?: number | null }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] text-slate-500">{label}</div>
      <div className="mt-0.5 truncate font-semibold tabular-nums text-slate-900" title={yen(value)}>{yen(value)}</div>
      {rate != null && <div className="mt-0.5 text-[10px] font-medium tabular-nums text-slate-400">売上比 {formatRate(rate)}</div>}
    </div>
  );
}

function rateOf(value: number, sales: number) {
  return sales > 0 ? (value / sales) * 100 : null;
}

function feeValue(summary: ComparisonPayload) {
  return summary.totals.platformFees + summary.totals.paymentFees;
}

function promotionValue(summary: ComparisonPayload) {
  return summary.totals.sellerDiscounts + summary.totals.sellerCoupons + summary.totals.sellerPoints;
}

function refundEtcValue(summary: ComparisonPayload) {
  return summary.totals.refunds + summary.totals.shippingCosts + summary.totals.otherCosts - summary.totals.otherCredits;
}

function otherEcValue(summary: ComparisonPayload) {
  return promotionValue(summary) + refundEtcValue(summary);
}

function authoritativeAdCosts(summary: {
  adCosts: AdCostBreakdown;
  channels: Array<Pick<ChannelRow, "channel" | "directAdCost">>;
}): AdCostBreakdown {
  const channelAds = new Map(summary.channels.map((row) => [row.channel, row.directAdCost]));
  return {
    google: summary.adCosts.google,
    meta: summary.adCosts.meta,
    amazon: channelAds.get("amazon") || 0,
    rakuten: channelAds.get("rakuten") || 0,
    yahoo: channelAds.get("yahoo") || 0,
    other: summary.adCosts.other,
  };
}

function changeRate(current: number, comparison: number) {
  return comparison > 0 ? (current - comparison) / comparison * 100 : null;
}

function metricComparison(current: number, previous: number, previousYear: number) {
  return {
    previous: changeRate(current, previous),
    previousYear: changeRate(current, previousYear),
  };
}

function formatRate(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatNullableRate(value: number | null) {
  return value == null ? "—" : formatRate(value);
}

function yen(value: number) {
  return `¥${Math.round(value || 0).toLocaleString("ja-JP")}`;
}

function signedYen(value: number) {
  if (!value) return "¥0";
  return `${value > 0 ? "+" : "−"}¥${Math.round(Math.abs(value)).toLocaleString("ja-JP")}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function isHeartbeatStale(value: string | null) {
  if (!value) return true;
  const time = new Date(value).getTime();
  return Number.isNaN(time) || Date.now() - time > 120_000;
}

function settlementStatusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: "順番待ち",
    running: "実行中",
    completed: "完了",
    needs_review: "処理完了・公式公開待ち",
    waiting_for_user: "操作待ち",
    failed: "処理停止・エラー",
    not_started: "未実行",
  };
  return labels[status] || status;
}

function formatNumber(value: number) {
  return Math.round(value || 0).toLocaleString("ja-JP");
}

function monthPeriod(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return {
    startDate: `${month}-01`,
    endDate: new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10),
  };
}
