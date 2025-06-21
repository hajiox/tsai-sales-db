// /app/web-sales/dashboard/page.tsx ver.6 (Suspense対応版)
"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import WebSalesSummaryCards from "@/components/websales-summary-cards"
import WebSalesRankingTable from "@/components/websales-ranking-table"
import WebSalesEditableTable from "@/components/web-sales-editable-table"
import WebSalesCharts from "@/components/websales-charts"
import WebSalesAiSection from "@/components/web-sales-ai-section"

export const dynamic = 'force-dynamic'

type ViewMode = 'month' | 'period';

// SearchParamsを使用するコンポーネントを分離
function WebSalesDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // URLパラメータから月を取得、なければ現在月をデフォルトに
  const getCurrentMonth = () => {
    const urlMonth = searchParams.get('month');
    if (urlMonth) return urlMonth;
    
    // デフォルトは現在月
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  const [month, setMonth] = useState<string>(getCurrentMonth());
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [periodMonths, setPeriodMonths] = useState<6 | 12>(6);

  // URLパラメータが変更された時にstateを更新
  useEffect(() => {
    const urlMonth = searchParams.get('month');
    if (urlMonth && urlMonth !== month) {
      setMonth(urlMonth);
    }
  }, [searchParams, month]);

  // 月が変更された時にURLを更新
  const handleMonthChange = (newMonth: string) => {
    setMonth(newMonth);
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', newMonth);
    router.push(`?${params.toString()}`);
  };

  const handleDataSaved = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const selectPeriod = (months: 6 | 12) => {
    setPeriodMonths(months);
    setViewMode('period');
  };

  return (
    <div className="w-full space-y-6">
      <header className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">WEB販売管理システム</h1>
          <p className="text-gray-500">
            {viewMode === 'month' 
              ? '月次の販売実績を確認・管理します。' 
              : `${month}月を基準とした過去${periodMonths}ヶ月間の集計結果`}
          </p>
        </div>
        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <button onClick={() => setViewMode('month')} className={`px-3 py-2 text-sm rounded-md ${viewMode === 'month' ? 'bg-black text-white' : 'bg-white border'}`}>月別表示</button>
            <button onClick={() => selectPeriod(6)} className={`px-3 py-2 text-sm rounded-md ${viewMode === 'period' && periodMonths === 6 ? 'bg-black text-white' : 'bg-white border'}`}>過去6ヶ月</button>
            <button onClick={() => selectPeriod(12)} className={`px-3 py-2 text-sm rounded-md ${viewMode === 'period' && periodMonths === 12 ? 'bg-black text-white' : 'bg-white border'}`}>過去12ヶ月</button>
          </div>
          {viewMode === 'month' && (
            <div className="flex items-center gap-3">
              <input
                type="month"
                value={month}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="border rounded-md text-base p-2 bg-white"
              />
            </div>
          )}
        </div>
      </header>
      
      <div className="space-y-6">
        <WebSalesSummaryCards
          month={month}
          refreshTrigger={refreshTrigger}
          viewMode={viewMode}
          periodMonths={periodMonths}
        />

        {viewMode === 'month' && (
          <>
            <WebSalesCharts month={month} refreshTrigger={refreshTrigger} />
            <WebSalesEditableTable month={month} onDataSaved={handleDataSaved} />
            <WebSalesRankingTable month={month} />
            <WebSalesAiSection month={month} />
          </>
        )}
      </div>
    </div>
  );
}

// ローディングコンポーネント
function DashboardLoading() {
  return (
    <div className="w-full space-y-6">
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
        <div className="h-12 bg-gray-200 rounded mb-6"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    </div>
  );
}

// メインコンポーネント
export default function WebSalesDashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <WebSalesDashboardContent />
    </Suspense>
  );
}
