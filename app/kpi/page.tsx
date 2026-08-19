
import { getAvailableKpiFiscalYears, getKpiSummary } from "./actions";
import { format } from 'date-fns';
import KpiPageClient from "@/components/kpi/KpiPageClient";
import { Button } from "@/components/ui/button";
import Link from "next/link";
// Helper to calculate current FY
function getCurrentFiscalYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  return month >= 8 ? year + 1 : year;
}

export const dynamic = 'force-dynamic';

export default async function KpiPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string | string[] }>;
}) {
  const resolvedSearchParams = await searchParams;
  const currentFiscalYear = getCurrentFiscalYear();
  const yearParam = Array.isArray(resolvedSearchParams.year)
    ? resolvedSearchParams.year[0]
    : resolvedSearchParams.year;
  const requestedFiscalYear = yearParam ? parseInt(yearParam, 10) : NaN;
  const fiscalYear = Number.isInteger(requestedFiscalYear)
    ? requestedFiscalYear
    : currentFiscalYear;

  const [data, storedFiscalYears] = await Promise.all([
    getKpiSummary(fiscalYear),
    getAvailableKpiFiscalYears(currentFiscalYear),
  ]);
  const availableFiscalYears = Array.from(
    new Set([currentFiscalYear, fiscalYear, ...storedFiscalYears])
  ).sort((a, b) => b - a);

  // Calculate annual summary metrics
  const totalActual = data.total.reduce((sum, m) => sum + m.actual, 0);
  const totalTarget = data.total.reduce((sum, m) => sum + m.target, 0);
  const totalLastYear = data.total.reduce((sum, m) => sum + m.lastYear, 0);
  const totalTwoYearsAgo = data.total.reduce((sum, m) => sum + m.twoYearsAgo, 0);

  // Elapsed month calculation for pace-adjusted achievement rate
  const now = new Date();
  const currentYearMonth = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-01');

  let elapsedMonthCount = 0;
  let elapsedTarget = 0;
  let elapsedLastYear = 0;
  data.total.forEach(m => {
    if (m.month < currentYearMonth) {
      elapsedMonthCount++;
      elapsedTarget += m.target;
      elapsedLastYear += m.lastYear;
    }
  });

  const remainingMonths = 12 - elapsedMonthCount;
  const achievementRate = elapsedTarget > 0 ? (totalActual / elapsedTarget) * 100 : 0;
  const yoyGrowthIds = elapsedLastYear > 0 ? ((totalActual - elapsedLastYear) / elapsedLastYear) * 100 : 0;
  const fiscalStartYear = fiscalYear - 1;
  const fiscalPeriodLabel = `${fiscalStartYear}年8月 - ${fiscalYear}年7月`;
  const completedMonthCount = data.total.filter((month) => month.actual > 0).length;
  const remainingInputMonths = Math.max(0, 12 - completedMonthCount);
  const progressPercent = Math.min(100, Math.max(0, (completedMonthCount / 12) * 100));

  return (
    <div className="kpi-page-shell min-h-screen bg-gray-50/50 print:min-h-0 print:bg-white">
      <style>{`
        @media screen and (max-width: 1023px) {
          .kpi-existing-content {
            min-width: 0;
          }

          .kpi-existing-content > .space-y-4 > .flex.items-center.justify-between.pb-4 {
            align-items: stretch;
            flex-direction: column;
            gap: 10px;
          }

          .kpi-existing-content > .space-y-4 > .flex.items-center.justify-between.pb-4 > div:first-child,
          .kpi-existing-content > .space-y-4 > .flex.items-center.justify-between.pb-4 [role="combobox"] {
            width: 100%;
          }

          .kpi-existing-content > .space-y-4 > .flex.items-center.justify-between.pb-4 > div:last-child {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            width: 100%;
          }

          .kpi-existing-content > .space-y-4 > .flex.items-center.justify-between.pb-4 button {
            min-height: 44px;
            white-space: normal;
          }

          .kpi-existing-content > .space-y-4 > .grid.md\\:grid-cols-2.lg\\:grid-cols-5 {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .kpi-existing-content > .space-y-4 > .grid.md\\:grid-cols-2.lg\\:grid-cols-5 > :last-child {
            grid-column: 1 / -1;
          }

          .kpi-existing-content > .space-y-4 > .grid.md\\:grid-cols-2.lg\\:grid-cols-5 > div > div:first-child {
            padding: 12px 12px 4px;
          }

          .kpi-existing-content > .space-y-4 > .grid.md\\:grid-cols-2.lg\\:grid-cols-5 > div > div:nth-child(2) {
            padding: 8px 12px 12px;
          }

          .kpi-existing-content > .space-y-4 > .grid.md\\:grid-cols-2.lg\\:grid-cols-5 .text-2xl.font-bold {
            font-size: 1.125rem;
            line-height: 1.35;
            overflow-wrap: anywhere;
          }

          .kpi-existing-content h2,
          .kpi-existing-content h3 {
            line-height: 1.4;
          }

          .kpi-existing-content .mt-8 {
            margin-top: 1.25rem;
          }

          .kpi-existing-content .overflow-x-auto {
            -webkit-overflow-scrolling: touch;
            max-width: 100%;
            overscroll-behavior-x: contain;
          }

          .kpi-existing-content table {
            width: max-content;
          }

          .kpi-existing-content input,
          .kpi-existing-content select,
          .kpi-existing-content textarea {
            font-size: 16px;
            min-height: 42px;
          }

          .kpi-existing-content input.w-24 {
            width: 6.5rem;
          }

          [role="dialog"] {
            max-height: calc(100dvh - 24px);
            max-width: calc(100vw - 16px);
          }
        }
      `}</style>
      <div className="flex-1 space-y-3 p-3 pt-3 sm:space-y-4 sm:p-4 lg:space-y-4 lg:p-6 lg:pt-4 print:p-2 print:pt-1">
        <div className="flex items-center justify-between print:hidden">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <Link href="/">
              <Button variant="outline" size="sm" className="h-10 shrink-0 gap-1 lg:h-9">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                TSA TOP
              </Button>
            </Link>
            <h2 className="min-w-0 text-xl font-bold tracking-tight sm:text-2xl">KPI ダッシュボード</h2>
          </div>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm lg:hidden print:hidden" aria-label="対象期間と入力進捗">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">対象期間</p>
              <p className="mt-0.5 text-base font-bold text-slate-900">{fiscalPeriodLabel}</p>
            </div>
            <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
              FY{fiscalYear}
            </span>
          </div>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-500">実績入力済み</p>
              <p className="text-lg font-bold text-slate-900">{completedMonthCount}<span className="ml-1 text-sm font-medium text-slate-500">/ 12ヶ月</span></p>
            </div>
            <p className="text-right text-xs text-slate-500">未入力 {remainingInputMonths}ヶ月</p>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="年度入力進捗" aria-valuemin={0} aria-valuemax={12} aria-valuenow={completedMonthCount}>
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progressPercent}%` }} />
          </div>
        </section>

        <div className="kpi-existing-content min-w-0">
          <KpiPageClient
            fiscalYear={fiscalYear}
            availableFiscalYears={availableFiscalYears}
            data={data}
            summaryMetrics={{
              totalActual,
              totalTarget,
              totalLastYear,
              totalTwoYearsAgo,
              achievementRate,
              yoyGrowthIds,
              elapsedMonthCount,
              remainingMonths,
              elapsedTarget,
              elapsedLastYear,
            }}
          />
        </div>
      </div>
    </div>
  );
}
