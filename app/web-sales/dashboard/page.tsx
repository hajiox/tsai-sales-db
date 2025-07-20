// /app/web-sales/dashboard/page.tsx ver.25 (ビルドエラー修正版)
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
        const { data: salesData, error: salesError } = await supabase
          .from('web_sales_summary')
          .select('*')
          .eq('report_month', `${month}-01`);

        if (salesError) {
          console.error('売上データ取得エラー:', salesError);
          setWebSalesData([]);
          return;
        }

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
        
        const combinedData = productsData.map(product => {
          const salesItem = salesData?.find(s => s.product_id === product.id);
          
          return {
            product_id: product.id,
            product_name: product.name,
            price: product.price,
            profit_rate: product.profit_rate,
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
  
  const handleAddProduct = async (productData: { productName: string; price: number; seriesNumber: number; productNumber: number; seriesName: string }) => {
    // Implementation omitted
  };
  
  const handleDeleteProduct = async (productId: string, productName: string) => {
    // Implementation omitted
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
        
        {/* モード切り替えボタン部分 - 月選択ボタンを常時表示 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px',
          backgroundColor: '#f9fafb',
          borderRadius: '8px',
          marginBottom: '16px',
          border: '1px solid #e5e7eb'
        }}>
          <div style={{display: 'flex', gap: '8px'}}>
            <button 
              onClick={() => setViewMode('month')}
              style={{
                padding: '8px 12px',
                fontSize: '14px',
                borderRadius: '6px',
                backgroundColor: viewMode === 'month' ? '#000' : '#fff',
                color: viewMode === 'month' ? '#fff' : '#000',
                border: '1px solid #ddd',
                cursor: 'pointer'
              }}
            >
              月別表示
            </button>
            
            <button 
              onClick={() => selectPeriod(6)}
              style={{
                padding: '8px 12px',
                fontSize: '14px',
                borderRadius: '6px',
                backgroundColor: viewMode === 'period' && periodMonths === 6 ? '#000' : '#fff',
                color: viewMode === 'period' && periodMonths === 6 ? '#fff' : '#000',
                border: '1px solid #ddd',
                cursor: 'pointer'
              }}
            >
              過去6ヶ月
            </button>
            
            <button 
              onClick={() => selectPeriod(12)}
              style={{
                padding: '8px 12px',
                fontSize: '14px',
                borderRadius: '6px',
                backgroundColor: viewMode === 'period' && periodMonths === 12 ? '#000' : '#fff',
                color: viewMode === 'period' && periodMonths === 12 ? '#fff' : '#000',
                border: '1px solid #ddd',
                cursor: 'pointer'
              }}
            >
              過去12ヶ月
            </button>
          </div>
          
          {/* 月選択ボタンを常時表示 */}
          <div>
            <input
              type="month"
              value={month}
              onChange={(e) => handleMonthChange(e.target.value)}
              style={{
                border: '1px solid #ddd',
                borderRadius: '6px',
                padding: '8px',
                backgroundColor: '#fff'
              }}
            />
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

        {/* グラフコンポーネントへの月数パラメータを正確に渡す */}
        <WebSalesCharts 
          month={month} 
          refreshTrigger={refreshTrigger}
          periodMonths={viewMode === 'period' ? periodMonths : 6}
        />

        {/* 月別表示モードの場合のみ表示するコンポーネント */}
        {viewMode === 'month' && (
          <>
            {isLoading ? (
              <div className="p-4">
                <div className="animate-pulse">
                  <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
                  <div className="h-64 bg-gray-200 rounded"></div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <WebSalesEditableTable 
                  initialWebSalesData={webSalesData}
                  month={month}
                  onDataUpdated={handleDataSaved}
                />
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
    </div>
  );
}

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

export default function WebSalesDashboardPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <WebSalesDashboardContent />
    </Suspense>
  );
}
