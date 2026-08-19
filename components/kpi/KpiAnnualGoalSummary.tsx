import { Factory, Target, TrendingUp, Users } from "lucide-react";

import type { ChannelCode, KpiSummary } from "@/app/kpi/actions";

type Props = {
  fiscalYear: number;
  data: KpiSummary;
};

function totalOf(rows: Array<{ actual: number; target: number; lastYear: number }>, key: "actual" | "target" | "lastYear") {
  return rows.reduce((sum, row) => sum + row[key], 0);
}

function compactYen(value: number) {
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(2).replace(/\.?0+$/, "")}億円`;
  }
  return `${Math.round(value / 10_000).toLocaleString("ja-JP")}万円`;
}

function compactCount(value: number, unit: string) {
  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(1).replace(/\.0$/, "")}万${unit}`;
  }
  return `${value.toLocaleString("ja-JP")}${unit}`;
}

function growthLabel(target: number, baseline: number) {
  if (baseline <= 0) return "比較実績なし";
  const growth = ((target / baseline) - 1) * 100;
  return `前年度比 ${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%`;
}

export default function KpiAnnualGoalSummary({ fiscalYear, data }: Props) {
  const channelCodes: ChannelCode[] = ["WEB", "WHOLESALE", "STORE", "SHOKU"];
  const annualTarget = channelCodes.reduce((sum, code) => sum + totalOf(data.channels[code], "target"), 0);

  if (annualTarget <= 0) return null;

  const annualActual = channelCodes.reduce((sum, code) => sum + totalOf(data.channels[code], "actual"), 0);
  const annualBaseline = channelCodes.reduce((sum, code) => sum + totalOf(data.channels[code], "lastYear"), 0);
  const twoYearsAgo = data.total.reduce((sum, row) => sum + row.twoYearsAgo, 0);
  const priorGrowth = twoYearsAgo > 0 ? ((annualBaseline / twoYearsAgo) - 1) * 100 : null;
  const targetGrowth = annualBaseline > 0 ? ((annualTarget / annualBaseline) - 1) * 100 : null;

  const webTarget = totalOf(data.channels.WEB, "target");
  const webBaseline = totalOf(data.channels.WEB, "lastYear");
  const wholesaleTarget = totalOf(data.channels.WHOLESALE, "target");
  const wholesaleBaseline = totalOf(data.channels.WHOLESALE, "lastYear");
  const storeTarget = totalOf(data.channels.STORE, "target");
  const shokuTarget = totalOf(data.channels.SHOKU, "target");
  const storeBaseline = totalOf(data.channels.STORE, "lastYear") + totalOf(data.channels.SHOKU, "lastYear");
  const manufacturingTarget = data.manufacturing.reduce((sum, row) => sum + row.target, 0);
  const manufacturingBaseline = data.manufacturing.reduce((sum, row) => sum + row.lastYear, 0);
  const acquisitionTarget = data.salesActivity.reduce((sum, row) => sum + row.target, 0);
  const progress = annualTarget > 0 ? Math.min(100, (annualActual / annualTarget) * 100) : 0;

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm print:hidden" aria-labelledby="annual-goal-heading">
      <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          <h3 id="annual-goal-heading" className="text-base font-bold text-slate-900">
            FY{fiscalYear} 年度目標
          </h3>
          <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            3億円超
          </span>
        </div>
        <p className="text-xs text-slate-500">{fiscalYear - 1}年8月〜{fiscalYear}年7月</p>
      </div>

      <div className="grid lg:grid-cols-[1.05fr_2fr]">
        <div className="border-b border-slate-200 px-4 py-4 lg:border-b-0 lg:border-r">
          <p className="text-xs font-medium text-slate-500">全社売上目標</p>
          <p className="mt-1 text-3xl font-bold text-slate-950">{compactYen(annualTarget)}</p>
          <p className="mt-1 text-sm font-semibold text-emerald-700">{growthLabel(annualTarget, annualBaseline)}</p>
          <div className="mt-4 h-2 overflow-hidden rounded bg-slate-100" role="progressbar" aria-label="年度売上目標の達成率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
            <div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            現在 {compactYen(annualActual)} / {progress.toFixed(1)}%
          </p>
        </div>

        <div className="grid sm:grid-cols-2">
          <div className="border-b border-slate-200 px-4 py-3 sm:border-r">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <TrendingUp className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              最重点：外販・OEM
            </div>
            <p className="mt-1 text-xl font-bold text-slate-900">{compactYen(wholesaleTarget)}</p>
            <p className="text-xs font-semibold text-emerald-700">{growthLabel(wholesaleTarget, wholesaleBaseline)}</p>
            {data.annualPlan && (
              <p className="mt-1 text-xs text-slate-500">
                外販 {compactYen(data.annualPlan.wholesaleCoreTarget)} / OEM {compactYen(data.annualPlan.oemTarget)}
              </p>
            )}
          </div>

          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <TrendingUp className="h-4 w-4 text-blue-600" aria-hidden="true" />
              次重点：WEB販売
            </div>
            <p className="mt-1 text-xl font-bold text-slate-900">{compactYen(webTarget)}</p>
            <p className="text-xs font-semibold text-blue-700">{growthLabel(webTarget, webBaseline)}</p>
          </div>

          <div className="border-b border-slate-200 px-4 py-3 sm:border-b-0 sm:border-r">
            <p className="text-xs font-medium text-slate-500">店舗2部門</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{compactYen(storeTarget + shokuTarget)}</p>
            <p className="text-xs text-slate-500">
              ブランド館 {compactYen(storeTarget)} / 食 {compactYen(shokuTarget)}
            </p>
            <p className="mt-1 text-xs font-semibold text-slate-600">{growthLabel(storeTarget + shokuTarget, storeBaseline)}</p>
          </div>

          <div className="px-4 py-3">
            <p className="text-xs font-medium text-slate-500">実行KPI</p>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm font-bold text-slate-900">
              <span className="inline-flex items-center gap-1.5">
                <Factory className="h-4 w-4 text-sky-600" aria-hidden="true" />
                製造 {compactCount(manufacturingTarget, "点")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4 text-orange-600" aria-hidden="true" />
                新規・OEM {compactCount(acquisitionTarget, "件")}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              製造は{growthLabel(manufacturingTarget, manufacturingBaseline).replace("前年度比 ", "前年度比 ")}
            </p>
          </div>
        </div>
      </div>

      {priorGrowth !== null && targetGrowth !== null && (
        <p className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-600">
          前年度は{priorGrowth >= 0 ? "+" : ""}{priorGrowth.toFixed(1)}%成長。今期は負荷を抑え、{targetGrowth >= 0 ? "+" : ""}{targetGrowth.toFixed(1)}%を計画しています。
        </p>
      )}
    </section>
  );
}
