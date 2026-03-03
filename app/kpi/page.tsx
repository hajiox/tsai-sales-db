
import { getKpiSummary } from "./actions";
import { format } from 'date-fns';
import { KpiMainChart, KpiChannelChart } from "@/components/kpi/KpiCharts";
import KpiPageClient from "@/components/kpi/KpiPageClient";
import { Suspense } from "react";
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
  searchParams: { year?: string };
}) {
  const fiscalYear = searchParams.year
    ? parseInt(searchParams.year)
    : getCurrentFiscalYear();

  const data = await getKpiSummary(fiscalYear);

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
    // Count months that have fully completed (before current month)
    if (m.month < currentYearMonth) {
      elapsedMonthCount++;
      elapsedTarget += m.target;
      elapsedLastYear += m.lastYear;
    }
  });

  const remainingMonths = 12 - elapsedMonthCount;
  // Adjusted rate: actual vs elapsed months' target only
  const achievementRate = elapsedTarget > 0 ? (totalActual / elapsedTarget) * 100 : 0;
  // Adjusted YoY: actual vs same elapsed months' last year actual
  const yoyGrowthIds = elapsedLastYear > 0 ? ((totalActual - elapsedLastYear) / elapsedLastYear) * 100 : 0;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">KPI ダッシュボード</h2>
          <div className="flex items-center space-x-2">

          </div>
        </div>

        {/* Client Component for interactivity (Year Selector, Modal, etc.) */}
        <KpiPageClient
          fiscalYear={fiscalYear}
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

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
          <div className="col-span-4">
            <KpiMainChart data={data.total} fiscalYear={fiscalYear} />
          </div>
          <div className="col-span-3">
            <KpiChannelChart data={data.total} fiscalYear={fiscalYear} />
          </div>
        </div>
      </div>
    </div>
  );
}
