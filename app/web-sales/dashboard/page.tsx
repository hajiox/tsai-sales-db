// /app/web-sales/dashboard/page.tsx ver.12 (削除機能・縞々表示付き)
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
          .select('id, name, price, series, series_code, product_code')
          .order('series_code')
          .order('product_code');
        
        if (error) {
          console.error('商品マスター取得エラー:', error);
        } else {
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
          series_code: productData.seriesNumber,
          product_code: productData.productNumber,
          series: productData.seriesName
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

  // 🔥 商品削除処理（個別削除）
  const handleDeleteProduct = async (productId: string, productName: string) => {
    if (!confirm(`商品「${productName}」を削除しますか？\nこの操作は取り消せません。`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch('/api/products/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: productId }),
      });

      if (!response.ok) {
        throw new Error('商品削除に失敗しました');
      }

      setRefreshTrigger(prev => prev + 1);
      alert('商品を削除しました');
    } catch (error) {
      console.error('商品削除エラー:', error);
      alert('商品削除に失敗しました');
    } finally {
      setIsDeleting(false);
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
                  </div>
                </div>
                
                {/* 🔥 商品マスター一覧テーブル（縞々表示付き） */}
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">シリーズ番号</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">商品番号</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">商品名</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">シリーズ名</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">価格</th>
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">削除</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {productMaster.map((product, index) => (
                          <tr 
                            key={product.id} 
                            className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product.series_code}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product.product_code}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{product.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{product.series}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">¥{product.price?.toLocaleString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <button
                                onClick={() => handleDeleteProduct(product.id, product.name)}
                                disabled={isDeleting}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 disabled:opacity-50"
                              >
                                <Trash2 className="h-3 w-3" />
                                削除
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {productMaster.length === 0 && (
                    <div className="p-8 text-center text-gray-500">
                      商品マスターにデータがありません
                    </div>
                  )}
                </div>
                
                <WebSalesEditableTable 
                  initialWebSalesData={webSalesData}
                  month={month}
                  productMaster={productMaster}
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
            seriesNumber: p.series_code,
            productNumber: p.product_code,
            name: p.name,
            seriesName: p.series
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
