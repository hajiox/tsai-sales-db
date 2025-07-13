// /app/brand-store-analysis/page.tsx ver.3 (マスターデータ連携版)
"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { BrandStoreCsvImportModal } from "@/components/brand-store/BrandStoreCsvImportModal"
import { MasterDataModal } from "@/components/brand-store/MasterDataModal"
import { CategoryRankingCard } from "@/components/brand-store/CategoryRankingCard"
import { ProductRankingCard } from "@/components/brand-store/ProductRankingCard"
import { ProductSalesTable } from "@/components/brand-store/ProductSalesTable"
import { Settings } from "lucide-react"

// ★ 型定義を追加
type SalesData = any;
type ProductMaster = { product_id: number; category_id: number; };
type CategoryMaster = { category_id: number; category_name: string; };


export default function BrandStoreAnalysisPage() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showMasterModal, setShowMasterModal] = useState(false)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const supabase = createClientComponentClient()

  const yearOptions = Array.from({ length: 5 }, (_, i) => selectedYear - i)
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)

  // データ取得関数をマスター連携版に修正
  const fetchData = async () => {
    setLoading(true)
    try {
      const reportMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
      
      // ★ 売上データ、商品マスター、カテゴリーマスターを同時に取得
      const [
        { data: salesData, error: salesError },
        { data: productMaster, error: productMasterError },
        { data: categoryMaster, error: categoryMasterError }
      ] = await Promise.all([
        supabase.from('brand_store_sales').select('*').eq('report_month', reportMonth).order('total_sales', { ascending: false }),
        supabase.from('product_master').select('product_id, category_id'),
        supabase.from('category_master').select('category_id, category_name')
      ]);

      if (salesError) throw salesError;
      if (productMasterError) throw productMasterError;
      if (categoryMasterError) throw categoryMasterError;

      if (salesData && salesData.length > 0) {
        // ★ マスターデータからMapを作成
        const productToCategoryMap = new Map(productMaster.map((p: ProductMaster) => [p.product_id, p.category_id]));
        const categoryNameMap = new Map(categoryMaster.map((c: CategoryMaster) => [c.category_id, c.category_name]));

        // ★ 売上データにマスターのカテゴリー名を付与
        const enrichedSalesData = salesData.map((sale: SalesData) => {
          const categoryId = productToCategoryMap.get(sale.product_id);
          const categoryName = categoryId ? categoryNameMap.get(categoryId) : null;
          return {
            ...sale,
            category: categoryName || sale.category || '未設定' // マスターにあれば上書き、なければ元のデータを使う
          };
        });

        // カテゴリー別集計 (マスター連携後のデータを使用)
        const categoryTotals = enrichedSalesData.reduce((acc: any, item: SalesData) => {
          const category = item.category; // ここは↑で上書きされた値
          if (!acc[category]) {
            acc[category] = { category, total_sales: 0, quantity_sold: 0, product_count: 0 };
          }
          acc[category].total_sales += item.total_sales || 0;
          acc[category].quantity_sold += item.quantity_sold || 0;
          acc[category].product_count += 1;
          return acc;
        }, {});

        const categoryRanking = Object.values(categoryTotals)
          .sort((a: any, b: any) => b.total_sales - a.total_sales)
          .slice(0, 5);

        setData({
          salesData: enrichedSalesData, // ★ 連携後のデータをセット
          categoryRanking,
          productRanking: enrichedSalesData.slice(0, 10) // ★ 連携後のデータをセット
        });
      } else {
        setData(null);
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
      alert('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  const handleDeleteMonth = async () => {
    if (!confirm(`${selectedYear}年${selectedMonth}月のデータを削除しますか？`)) {
      return
    }

    try {
      const reportMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
      const { error } = await supabase.from('brand_store_sales').delete().eq('report_month', reportMonth)
      if (error) throw error
      alert('データを削除しました')
      fetchData()
    } catch (error) {
      console.error('削除エラー:', error)
      alert('削除に失敗しました')
    }
  }

  useEffect(() => {
    fetchData()
  }, [selectedYear, selectedMonth])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Select value={String(selectedYear)} onValueChange={(value) => setSelectedYear(Number(value))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{yearOptions.map(year => <SelectItem key={year} value={String(year)}>{year}年</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(selectedMonth)} onValueChange={(value) => setSelectedMonth(Number(value))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{monthOptions.map(month => <SelectItem key={month} value={String(month)}>{month}月</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={() => setShowImportModal(true)}>CSV読込</Button>
          <Button variant="destructive" onClick={handleDeleteMonth} disabled={!data || loading}>月削除</Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowMasterModal(true)}>
          <Settings className="h-4 w-4 mr-2" />マスターデータ管理
        </Button>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">カテゴリーランキング TOP5</h2>
        <div className="grid grid-cols-5 gap-4">
          {data?.categoryRanking?.map((category: any, index: number) => (
            <CategoryRankingCard key={index} rank={index + 1} category={category} />
          ))}
          {(!data || data.categoryRanking?.length === 0) && <div className="col-span-5 text-center text-gray-500">データがありません</div>}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">商品ランキング TOP10</h2>
        <div className="grid grid-cols-5 gap-4">
          {data?.productRanking?.map((product: any, index: number) => (
            <ProductRankingCard key={index} rank={index + 1} product={product} />
          ))}
          {(!data || data.productRanking?.length === 0) && <div className="col-span-5 text-center text-gray-500">データがありません</div>}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">販売商品一覧</h2>
        <ProductSalesTable data={data?.salesData || []} />
      </div>

      {showImportModal && (
        <BrandStoreCsvImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImportComplete={() => {
            setShowImportModal(false)
            fetchData()
          }}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
        />
      )}

      {showMasterModal && (
        <MasterDataModal
          isOpen={showMasterModal}
          onClose={() => setShowMasterModal(false)}
        />
      )}
    </div>
  )
}
