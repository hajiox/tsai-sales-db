// /app/web-sales/dashboard/page.tsx ver.16 (ヘッダーボタン削除＆裏方ロジック準備版)
"use client"

import { useState, useEffect, Suspense, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import WebSalesSummaryCards from "@/components/websales-summary-cards"
import WebSalesRankingTable from "@/components/websales-ranking-table"
import WebSalesEditableTable from "@/components/web-sales-editable-table"
import WebSalesCharts from "@/components/websales-charts"
import WebSalesAiSection from "@/components/web-sales-ai-section"
import ProductAddModal from "@/components/ProductAddModal"
import AmazonCsvImportModal from "@/components/AmazonCsvImportModal"
import { supabase } from "@/lib/supabase"
import { WebSalesData } from "@/types/db"

export const dynamic = 'force-dynamic'

type ViewMode = 'month' | 'period';

// SearchParamsを使用するコンポーネントを分離
function WebSalesDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInitializedRef = useRef(false);
  
  const getCurrentMonth = () => {
    const urlMonth = searchParams.get('month');
    if (urlMonth) return urlMonth;
    
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  const [month, setMonth] = useState<string>(() => getCurrentMonth());
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [webSalesData, setWebSalesData] = useState<WebSalesData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [periodMonths, setPeriodMonths] = useState<6 | 12>(6);

  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [isAmazonModalOpen, setIsAmazonModalOpen] = useState(false); // モーダルの状態管理は維持
  const [isDeleting, setIsDeleting] = useState(false);
  const [productMaster, setProductMaster] = useState<any[]>([])

  const handleMonthChange = useCallback((newMonth: string) => {
    if (newMonth === month) return;
    setMonth(newMonth);
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', newMonth);
    router.push(`?${params.toString()}`, { scroll: false });
  }, [month, searchParams, router]);

  useEffect(() => {
    if (!isInitializedRef.current) {
      const urlMonth = getCurrentMonth();
      if (urlMonth !== month) {
        setMonth(urlMonth);
      }
      isInitializedRef.current = true;
    }
  }, []);

  useEffect(() => {
    // 商品マスター取得（変更なし）
    // ...
  }, [refreshTrigger]);

  useEffect(() => {
    // データ取得（変更なし）
    // ...
  }, [month, refreshTrigger]);

  // インポート成功時に呼ばれる関数（裏方として維持）
  const handleImportSuccess = useCallback(() => {
    console.log('インポート成功！データ再取得をトリガーします。');
    setRefreshTrigger(prev => prev + 1);
    setIsAmazonModalOpen(false);
  }, []);
  
  // selectPeriod, handleAddProduct, handleDeleteProduct は変更なし

  return (
    <div className="w-full space-y-6">
      <header className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">WEB販売管理システム</h1>
          <p className="text-gray-500">
            {viewMode === 'month' ? '月次の販売実績を確認・管理します。' : `${month}月を基準とした過去${periodMonths}ヶ月間の集計結果`}
          </p>
        </div>
        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            {/* ... 月別・期間ボタン（変更なし）... */}
          </div>
          <div className="flex items-center gap-3">
            {viewMode === 'month' && (
              <input
                type="month"
                value={month}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="border rounded-md text-base p-2 bg-white"
              />
              // ★★★ 私が誤って追加したボタンはここから削除しました ★★★
            )}
          </div>
        </div>
      </header>
      
      <div className="space-y-6">
        {/* ... 各コンポーネント（変更なし）... */}
        <WebSalesSummaryCards
          month={month}
          refreshTrigger={refreshTrigger}
          viewMode={viewMode}
          periodMonths={periodMonths}
        />
        {/* ... */}
      </div>

      {/* ... ProductAddModal（変更なし）... */}

      {/* Amazonモーダルのレンダリングとロジックは裏方として維持 */}
      {isAmazonModalOpen && (
        <AmazonCsvImportModal
          isOpen={isAmazonModalOpen}
          onClose={() => setIsAmazonModalOpen(false)}
          onSuccess={handleImportSuccess}
        />
      )}
    </div>
  );
}

// NOTE: 可読性のため、変更のないコードブロックは省略しています。
// 実際にはファイル全体を置き換えてください。
