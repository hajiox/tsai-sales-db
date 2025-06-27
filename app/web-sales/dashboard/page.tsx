// /app/web-sales/dashboard/page.tsx ver.14 (楽天対応・直接クエリ版)
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
        console.log('🔍 直接クエリでデータ取得開始:', month);
        
        // 🔥 関数呼び出しを直接クエリに変更
        const { data: salesData, error: salesError } = await supabase
          .from('web_sales_summary')
          .select('*')
          .eq('report_month', `${month}-01`);

        if (salesError) {
          console.error('売上データ取得エラー:', salesError);
          setWebSalesData([]);
          return;
        }

        // 🔥 商品データも取得
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('*')
          .order('series_code')
          .order('product_code');

        if (productsError) {
          console.error('商品データ取得エラー:', productsError);
          setWebSalesData([]);
          return;
        }

        console.log('🔍 売上データ:', salesData);
        console.log('🔍 商品データ:', productsData);

        // 🔥 データを結合（関数と同じ形式）
        const combinedData = productsData.map(product => {
          const salesItem = salesData?.find(s => s.product_id === product.id);
          
          return {
            product_id: product.id,
            product_name: product.name,
            price: product.price,
            amazon_count: salesItem?.amazon_count || 0,
            rakuten_count: salesItem?.rakuten_count || 0,
            yahoo_count: salesItem?.yahoo_count || 0,
            mercari_count: salesItem?.mercari_count || 0,
            base_count: salesItem?.base_count || 0,
            qoo10_count: salesItem?.qoo10_count || 0,
            name: product.name,
            series: product.series,
            series_code: product.series_code,
            product_code: product.product_code,
            report_month: salesItem?.report_month || null
          };
        });

        console.log('🔍 結合後データ:', combinedData.slice(0, 3));
        console.log('🔍 楽天データ確認:', combinedData.filter(d => d.rakuten_count > 0));
        
        if (isCancelled) return;
        setWebSalesData(combinedData);
        
      } catch (error) {
        if (isCancelled) return;
        console.error('データ取得エラー:', error);
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
                {/* 🔥 WebSalesEditableTable - ここで1回だけ呼び出し */}
                <WebSalesEditableTable 
                  initialWebSalesData={webSalesData}
                  month={month}
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
