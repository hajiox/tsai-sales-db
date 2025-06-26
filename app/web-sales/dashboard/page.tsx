// /app/web-sales/dashboard/page.tsx ver.11 (商品管理機能復活版)
"use client"

import { useState, useEffect, Suspense, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import WebSalesSummaryCards from "@/components/websales-summary-cards"
import WebSalesRankingTable from "@/components/websales-ranking-table"
import WebSalesEditableTable from "@/components/web-sales-editable-table"
import WebSalesCharts from "@/components/websales-charts"
import WebSalesAiSection from "@/components/web-sales-ai-section"
import ProductAddModal from "@/components/ProductAddModal"
import { supabase } from "@/lib/supabase"
import { WebSalesData } from "@/types/db"
import { Plus, Trash2 } from "lucide-react"

export const dynamic = 'force-dynamic'

type ViewMode = 'month' | 'period';

// SearchParamsを使用するコンポーネントを分離
function WebSalesDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInitializedRef = useRef(false);
  
  // URLパラメータから月を取得、なければ現在月をデフォルトに
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

  // 🔥 商品管理機能の状態
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [selectedProductsForDelete, setSelectedProductsForDelete] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [productMaster, setProductMaster] = useState<any[]>([]) // 🔥 一時的にanyで型を緩和;

  // 月が変更された時にURLを更新（useCallbackで安定化）
  const handleMonthChange = useCallback((newMonth: string) => {
    if (newMonth === month) return; // 同じ月の場合は何もしない
    
    setMonth(newMonth);
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', newMonth);
    router.push(`?${params.toString()}`, { scroll: false });
  }, [month, searchParams, router]);

  // 初期化時のみURLパラメータを反映
  useEffect(() => {
    if (!isInitializedRef.current) {
      const urlMonth = getCurrentMonth();
      if (urlMonth !== month) {
        setMonth(urlMonth);
      }
      isInitializedRef.current = true;
    }
  }, []);

  // 🔥 商品マスターデータ取得
  useEffect(() => {
    const fetchProductMaster = async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*') // 🔥 全列を取得して実際の構造を確認
          .order('name');
        
        if (error) {
          console.error('商品マスター取得エラー:', error);
        } else {
          console.log('商品マスターデータ構造:', data?.[0]); // 🔥 構造をログ出力
          setProductMaster(data || []);
        }
      } catch (error) {
        console.error('商品マスター取得エラー:', error);
      }
    };

    fetchProductMaster();
  }, [refreshTrigger]);

  // データ取得（monthとrefreshTriggerのみに依存）
  useEffect(() => {
    let isCancelled = false;
    
    const fetchWebSalesData = async () => {
      if (!month) {
        setWebSalesData([]);
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      try {
        console.log('Debug - Calling web_sales_full_month with month:', month);
        const { data, error } = await supabase
          .rpc('web_sales_full_month', { target_month: month });
        
        if (isCancelled) return; // コンポーネントがアンマウントされた場合は処理しない
        
        if (error) {
          console.error('Error fetching web sales data:', error);
          setWebSalesData([]);
        } else {
          console.log('Debug - Data received:', data);
          setWebSalesData(data || []);
        }
      } catch (error) {
        if (isCancelled) return;
        console.error('Error during fetch operation:', error);
        setWebSalesData([]);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchWebSalesData();
    
    return () => {
      isCancelled = true;
    };
  }, [month, refreshTrigger]);

  const handleDataSaved = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  const selectPeriod = useCallback((months: 6 | 12) => {
    setPeriodMonths(months);
    setViewMode('period');
  }, []);

  // 🔥 商品追加処理
  const handleAddProduct = async (productData: { productName: string; price: number; seriesNumber: number; productNumber: number; seriesName: string }) => {
    try {
      const response = await fetch('/api/products/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: productData.productName,
          price: productData.price,
          series_number: productData.seriesNumber,
          product_number: productData.productNumber,
          series_name: productData.seriesName
        }),
      });
      
      if (!response.ok) throw new Error('商品追加に失敗しました');
      
      setIsAddingProduct(false);
      setRefreshTrigger(prev => prev + 1);
      alert('商品を追加しました');
    } catch (error) {
      console.error('商品追加エラー:', error);
      alert('商品追加に失敗しました');
    }
  };

  // 🔥 商品削除処理
  const handleDeleteProducts = async () => {
    if (selectedProductsForDelete.length === 0) {
      alert('削除する商品を選択してください');
      return;
    }

    if (!confirm(`選択した${selectedProductsForDelete.length}件の商品を削除しますか？`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .in('id', selectedProductsForDelete);

      if (error) throw error;

      setSelectedProductsForDelete([]);
      setRefreshTrigger(prev => prev + 1);
      alert(`${selectedProductsForDelete.length}件の商品を削除しました`);
    } catch (error) {
      console.error('商品削除エラー:', error);
      alert('商品削除に失敗しました');
    } finally {
      setIsDeleting(false);
    }
  };

  // 🔥 商品選択ハンドラー
  const handleProductSelect = (productId: string, isSelected: boolean) => {
    if (isSelected) {
      setSelectedProductsForDelete(prev => [...prev, productId]);
    } else {
      setSelectedProductsForDelete(prev => prev.filter(id => id !== productId));
    }
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
            <button 
              onClick={() => setViewMode('month')} 
              className={`px-3 py-2 text-sm rounded-md ${viewMode === 'month' ? 'bg-black text-white' : 'bg-white border'}`}
            >
              月別表示
            </button>
            <button 
              onClick={() => selectPeriod(6)} 
              className={`px-3 py-2 text-sm rounded-md ${viewMode === 'period' && periodMonths === 6 ? 'bg-black text-white' : 'bg-white border'}`}
            >
              過去6ヶ月
            </button>
            <button 
              onClick={() => selectPeriod(12)} 
              className={`px-3 py-2 text-sm rounded-md ${viewMode === 'period' && periodMonths === 12 ? 'bg-black text-white' : 'bg-white border'}`}
            >
              過去12ヶ月
            </button>
          </div>
          <div className="flex items-center gap-3">
            {viewMode === 'month' && (
              <input
                type="month"
                value={month}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="border rounded-md text-base p-2 bg-white"
              />
            )}
          </div>
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
            {isLoading ? (
              <div className="p-4">
                <div className="animate-pulse">
                  <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
                  <div className="h-64 bg-gray-200 rounded"></div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 🔥 商品マスター管理セクション */}
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold">全商品一覧 ({productMaster.length}商品)</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsAddingProduct(true)}
                      className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
                    >
                      <Plus className="h-4 w-4" />
                      商品登録
                    </button>
                    {selectedProductsForDelete.length > 0 && (
                      <button
                        onClick={handleDeleteProducts}
                        disabled={isDeleting}
                        className="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        {isDeleting ? '削除中...' : `選択商品削除 (${selectedProductsForDelete.length}件)`}
                      </button>
                    )}
                  </div>
                </div>
                
                <WebSalesEditableTable 
                  initialWebSalesData={webSalesData}
                  month={month}
                  productMaster={productMaster}
                  selectedProductsForDelete={selectedProductsForDelete}
                  onProductSelect={handleProductSelect}
                />
              </div>
            )}
            <WebSalesRankingTable month={month} />
            <WebSalesAiSection month={month} />
          </>
        )}
      </div>

      {/* 🔥 商品追加モーダル */}
      {isAddingProduct && (
        <ProductAddModal
          isOpen={isAddingProduct}
          onClose={() => setIsAddingProduct(false)}
          onAdd={handleAddProduct}
          existingProducts={productMaster.map(p => ({
            seriesNumber: p.series_number,
            productNumber: p.product_number,
            name: p.name,
            seriesName: p.series_name
          }))}
        />
      )}
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
