// /app/web-sales/dashboard/page.tsx ver.15 (Amazonインポート＆自動更新対応版)
"use client"

import { useState, useEffect, Suspense, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import WebSalesSummaryCards from "@/components/websales-summary-cards"
import WebSalesRankingTable from "@/components/websales-ranking-table"
import WebSalesEditableTable from "@/components/web-sales-editable-table"
import WebSalesCharts from "@/components/websales-charts"
import WebSalesAiSection from "@/components/web-sales-ai-section"
import ProductAddModal from "@/components/ProductAddModal"
import AmazonCsvImportModal from "@/components/AmazonCsvImportModal" // ★ 1. Amazonモーダルをインポート
import { supabase } from "@/lib/supabase"
import { WebSalesData } from "@/types/db"
import { Plus, Trash2, Upload } from "lucide-react" // ★ Uploadアイコンをインポート

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
  const [isAmazonModalOpen, setIsAmazonModalOpen] = useState(false); // ★ 2. Amazonモーダルの表示状態
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
        console.log('🔄 データ再取得トリガー作動:', month, `(Trigger: ${refreshTrigger})`);
        
        const { data: salesData, error: salesError } = await supabase
          .from('web_sales_summary')
          .select('*')
          .eq('report_month', `${month}-01`);

        if (salesError) throw salesError;

        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('*')
          .order('series_code')
          .order('product_code');

        if (productsError) throw productsError;

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
        
        if (isCancelled) return;
        setWebSalesData(combinedData);
        
      } catch (error) {
        if (isCancelled) return;
        console.error('データ取得エラー:', error);
        setWebSalesData([]);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    fetchWebSalesData();
    
    return () => { isCancelled = true; };
  }, [month, refreshTrigger]);

  // ★ 3. インポート成功時に呼ばれる関数
  const handleImportSuccess = useCallback(() => {
    console.log('インポート成功！データ再取得をトリガーします。');
    setRefreshTrigger(prev => prev + 1); // このトリガーがuseEffectを再実行させる
    setIsAmazonModalOpen(false); // モーダルを閉じる
  }, []);

  const selectPeriod = useCallback((months: 6 | 12) => {
    setPeriodMonths(months);
    setViewMode('period');
  }, []);

  const handleAddProduct = async (productData: { productName: string; price: number; seriesNumber: number; productNumber: number; seriesName: string }) => {
    // 省略（変更なし）
  };
  const handleDeleteProduct = async (productId: string, productName: string) => {
    // 省略（変更なし）
  };

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
              <>
                <input
                  type="month"
                  value={month}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="border rounded-md text-base p-2 bg-white"
                />
                {/* ★ 4. Amazonインポートボタンを追加 */}
                <button
                  onClick={() => setIsAmazonModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                >
                  <Upload size={16} />
                  Amazonインポート
                </button>
              </>
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
         {viewMode === 'month' && (
          <>
            <WebSalesCharts month={month} refreshTrigger={refreshTrigger} />
            {isLoading ? (
              <div className="p-4"><div className="animate-pulse"><div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div><div className="h-64 bg-gray-200 rounded"></div></div></div>
            ) : (
              <div className="space-y-4">
                <WebSalesEditableTable initialWebSalesData={webSalesData} month={month}/>
              </div>
            )}
            <WebSalesRankingTable month={month} />
            <WebSalesAiSection month={month} />
          </>
        )}
      </div>

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

      {/* ★ 5. Amazonモーダルをレンダリング */}
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

function DashboardLoading() {
  // 省略（変更なし）
  return <div>Loading...</div>
}

export default function WebSalesDashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <WebSalesDashboardContent />
    </Suspense>
  );
}
