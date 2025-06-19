// /app/web-sales/dashboard/page.tsx ver.4 (旧CSVインポートUIを完全削除)
"use client"

import { useState } from "react"
import WebSalesSummaryCards from "@/components/websales-summary-cards"
import WebSalesRankingTable from "@/components/websales-ranking-table"
import WebSalesEditableTable from "@/components/web-sales-editable-table"
import WebSalesCharts from "@/components/websales-charts"
import WebSalesAiSection from "@/components/web-sales-ai-section"

export const dynamic = 'force-dynamic'

type ViewMode = 'month' | 'period';

export default function WebSalesDashboardPage() {
  const [month, setMonth] = useState<string>('2025-06');
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [periodMonths, setPeriodMonths] = useState<6 | 12>(6);

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
                onChange={(e) => setMonth(e.target.value)}
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
