
import { getKpiSummary } from "./actions";
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
    if (m.month < currentYearMonth) {
      elapsedMonthCount++;
      elapsedTarget += m.target;
      elapsedLastYear += m.lastYear;
    }
  });

  const remainingMonths = 12 - elapsedMonthCount;
  const achievementRate = elapsedTarget > 0 ? (totalActual / elapsedTarget) * 100 : 0;
  const yoyGrowthIds = elapsedLastYear > 0 ? ((totalActual - elapsedLastYear) / elapsedLastYear) * 100 : 0;

  return (
    <div className="min-h-screen bg-gray-50/50 print:bg-white print:min-h-0">
      <div className="flex-1 space-y-4 p-6 pt-4 print:p-2 print:pt-1">
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="outline" size="sm" className="gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                TSA TOP
              </Button>
            </Link>
            <h2 className="text-2xl font-bold tracking-tight">KPI ダッシュボード</h2>
          </div>
        </div>

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
      </div>
    </div>
  );
}
