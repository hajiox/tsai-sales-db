// /app/web-sales/dashboard/page.tsx
"use client"

import { useState } from "react"
import WebSalesSummaryCards from "@/components/websales-summary-cards"
import WebSalesRankingTable from "@/components/websales-ranking-table"
import WebSalesEditableTable from "@/components/web-sales-editable-table"
import WebSalesCharts from "@/components/websales-charts"
import WebSalesAiSection from "@/components/web-sales-ai-section"

export const dynamic = 'force-dynamic'

// 型定義を追加
type ViewMode = 'month' | 'period';

export default function WebSalesDashboardPage() {
  // --- 月表示用の状態 ---
  const [month, setMonth] = useState<string>('2025-06'); // 最新の月に変更
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // --- 表示モードと期間表示用の状態を追加 ---
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [periodData, setPeriodData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [periodLabel, setPeriodLabel] = useState('');

  // データ保存時のリフレッシュ処理
  const handleDataSaved = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // 期間集計APIを呼び出す関数
  const handleFetchPeriodData = async (months: 6 | 12) => {
    setIsLoading(true);
    setPeriodData(null);
    setViewMode('period');
    setPeriodLabel(`（${month}月を基準とした過去${months}ヶ月間の集計）`);

    try {
      const res = await fetch('/api/web-sales-period', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_month: month,
          period_months: months,
        }),
      });
      if (!res.ok) throw new Error('API request failed');
      const data = await res.json();
      setPeriodData(data);
    } catch (error) {
      console.error("期間データの取得に失敗:", error);
      // ここでエラー通知を表示することも可能
    } finally {
      setIsLoading(false);
    }
  };

  // 月表示モードに切り替える関数
  const switchToMonthView = () => {
    setViewMode('month');
    setPeriodData(null);
    setPeriodLabel('');
  };

  return (
    <div className="w-full space-y-6">
      <header className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">WEB販売管理システム</h1>
          <p className="text-gray-500">
            {viewMode === 'month' ? '月次の販売実績を確認・管理します。' : `期間集計結果を表示しています。${periodLabel}`}
          </p>
        </div>
        {/* 操作パネル */}
        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <button onClick={switchToMonthView} className={`px-3 py-2 text-sm rounded-md ${viewMode === 'month' ? 'bg-black text-white' : 'bg-white'}`}>月別表示</button>
            <button onClick={() => handleFetchPeriodData(6)} className={`px-3 py-2 text-sm rounded-md ${periodLabel.includes('6') ? 'bg-black text-white' : 'bg-white'}`}>過去6ヶ月</button>
            <button onClick={() => handleFetchPeriodData(12)} className={`px-3 py-2 text-sm rounded-md ${periodLabel.includes('12') ? 'bg-black text-white' : 'bg-white'}`}>過去12ヶ月</button>
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

      {/* ローディング表示 */}
      {isLoading && <div className="text-center p-10">データを読み込んでいます...</div>}

      {/* 表示切替 */}
      <div className="space-y-6">
        {viewMode === 'month' && !isLoading && (
          <>
            {/* 月表示の時は、これまで通りのコンポーネントを表示 */}
            <WebSalesSummaryCards month={month} refreshTrigger={refreshTrigger} />
            <WebSalesCharts month={month} refreshTrigger={refreshTrigger} />
            <WebSalesEditableTable month={month} onDataSaved={handleDataSaved} />
            <WebSalesRankingTable month={month} />
            <WebSalesAiSection month={month} />
          </>
        )}
        {viewMode === 'period' && periodData && !isLoading && (
          <>
            {/* 期間表示の時は、集計データをサマリーカードに渡す */}
            {/* 注意: これを機能させるには、次にWebSalesSummaryCardsコンポーネントの修正が必要です */}
            <WebSalesSummaryCards periodData={periodData} month={month} refreshTrigger={refreshTrigger} />
            <p className="text-center text-gray-500 text-sm">期間集計では、サマリー表示のみ利用できます。</p>
          </>
        )}
      </div>
    </div>
  );
}
