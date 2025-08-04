// /app/food-store-analysis/page.tsx ver.7
"use client"

import { useState, useEffect, Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { FoodStoreCsvImportModal } from "@/components/food-store/FoodStoreCsvImportModal"
import { CategoryManagementModal } from "@/components/food-store/CategoryManagementModal"
import { ProductCategoryMappingModal } from "@/components/food-store/ProductCategoryMappingModal"
import { CategoryRankingCard } from "@/components/food-store/CategoryRankingCard"
import { ProductRankingCard } from "@/components/food-store/ProductRankingCard"
import { ProductSalesTable } from "@/components/food-store/ProductSalesTable"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, Package, Settings, Link } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { LineChart, Line, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useSearchParams, useRouter } from 'next/navigation'

function FoodStoreAnalysisContent() {
const router = useRouter()
const searchParams = useSearchParams()
const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
const [showImportModal, setShowImportModal] = useState(false)
const [showCategoryModal, setShowCategoryModal] = useState(false)
const [showMappingModal, setShowMappingModal] = useState(false)
const [data, setData] = useState<any>(null)
const [chartData, setChartData] = useState<any[]>([])
const [loading, setLoading] = useState(false)
const supabase = createClientComponentClient()

// URLパラメータから年月を読み取る
useEffect(() => {
  const yearParam = searchParams.get('year')
  const monthParam = searchParams.get('month')
  
  if (yearParam && monthParam) {
    const year = parseInt(yearParam)
    const month = parseInt(monthParam)
    
    if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
      setSelectedYear(year)
      setSelectedMonth(month)
    }
  }
}, [searchParams])

// 年月が変更されたらURLを更新
const updateURL = (year: number, month: number) => {
  const params = new URLSearchParams()
  params.set('year', year.toString())
  params.set('month', month.toString())
  router.push(`/food-store-analysis?${params.toString()}`)
}

const currentYear = new Date().getFullYear()
const yearOptions = Array.from(
  { length: currentYear - 2020 + 2 },
  (_, i) => 2020 + i
).reverse()

const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)

const fetchData = async () => {
  setLoading(true)
  try {
    const reportMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
    const lastYearMonth = `${selectedYear - 1}-${String(selectedMonth).padStart(2, '0')}-01`
    const twoYearsAgoMonth = `${selectedYear - 2}-${String(selectedMonth).padStart(2, '0')}-01`
    
    const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1
    const nextMonthYear = selectedMonth === 12 ? selectedYear - 1 : selectedYear - 1
    const lastYearNextMonth = `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-01`
    
    // 売上データ取得
    const { data: salesData, error: salesError } = await supabase
      .from('food_store_sales')
      .select('*')
      .eq('report_month', reportMonth)
      .order('total_sales', { ascending: false })

    if (salesError) throw salesError

    // 商品マスターとカテゴリー情報を取得
    if (salesData && salesData.length > 0) {
      const janCodes = [...new Set(salesData.map(item => item.jan_code))]
      
      const { data: productData, error: productError } = await supabase
        .from('food_product_master')
        .select(`
          jan_code,
          category_id,
          food_category_master (
            category_id,
            category_name
          )
        `)
        .in('jan_code', janCodes)

      if (productError) throw productError

      // データをマージ
      const productMap = new Map(
        productData?.map(p => [p.jan_code, p]) || []
      )

      const enrichedSalesData = salesData.map(sale => {
        const product = productMap.get(sale.jan_code)
        const categoryName = product?.food_category_master?.category_name || '未分類'
        return {
          ...sale,
          category: categoryName,
          food_product_master: product || null
        }
      })

      // 前年度データ取得
      const [
        { data: lastYearData },
        { data: twoYearsAgoData },
        { data: nextMonthPredictionData }
      ] = await Promise.all([
        supabase.from('food_store_sales').select('total_sales').eq('report_month', lastYearMonth),
        supabase.from('food_store_sales').select('total_sales').eq('report_month', twoYearsAgoMonth),
        supabase.from('food_store_sales').select('*').eq('report_month', lastYearNextMonth).order('total_sales', { ascending: false }).limit(10)
      ])

      const lastYearSales = lastYearData?.reduce((sum, item) => sum + (item.total_sales || 0), 0) || null
      const twoYearsAgoSales = twoYearsAgoData?.reduce((sum, item) => sum + (item.total_sales || 0), 0) || null

      const totalSales = enrichedSalesData.reduce((sum, item) => sum + (item.total_sales || 0), 0)
      const totalQuantity = enrichedSalesData.reduce((sum, item) => sum + (item.quantity_sold || 0), 0)

      // カテゴリー別集計
      const categoryTotals = enrichedSalesData.reduce((acc: any, item) => {
        const category = item.category
        if (!acc[category]) {
          acc[category] = { category, total_sales: 0, quantity_sold: 0, product_count: 0 }
        }
        acc[category].total_sales += item.total_sales || 0
        acc[category].quantity_sold += item.quantity_sold || 0
        acc[category].product_count += 1
        return acc
      }, {})

      const categoryRanking = Object.values(categoryTotals)
        .sort((a: any, b: any) => b.total_sales - a.total_sales)
        .slice(0, 5)

      setData({
        salesData: enrichedSalesData,
        categoryRanking,
        productRanking: enrichedSalesData.slice(0, 20),
        totalSales,
        totalQuantity,
        lastYearSales,
        twoYearsAgoSales,
        nextMonthPrediction: nextMonthPredictionData || [],
        hasData: true
      })
    } else {
      setData({
        salesData: [],
        categoryRanking: [],
        productRanking: [],
        totalSales: 0,
        totalQuantity: 0,
        lastYearSales: null,
        twoYearsAgoSales: null,
        nextMonthPrediction: [],
        hasData: false
      })
    }

    await fetchChartData()
  } catch (error) {
    console.error('データ取得エラー:', error)
    alert('データの取得に失敗しました')
  } finally {
    setLoading(false)
  }
}

const fetchChartData = async () => {
  try {
    const months = []
    const currentDate = new Date(selectedYear, selectedMonth - 1)
    
    for (let i = 11; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1)
      months.push({
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        label: `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}`
      })
    }

    const chartDataPromises = months.map(async ({ year, month, label }) => {
      const reportMonth = `${year}-${String(month).padStart(2, '0')}-01`
      const { data, error } = await supabase
        .from('food_store_sales')
        .select('total_sales, quantity_sold')
        .eq('report_month', reportMonth)

      if (error) throw error

      const totalSales = data?.reduce((sum, item) => sum + (item.total_sales || 0), 0) || 0
      const totalQuantity = data?.reduce((sum, item) => sum + (item.quantity_sold || 0), 0) || 0

      return {
        month: label,
        売上: totalSales,
        個数: totalQuantity
      }
    })

    const chartData = await Promise.all(chartDataPromises)
    setChartData(chartData)
  } catch (error) {
    console.error('チャートデータ取得エラー:', error)
  }
}

const handleDeleteMonth = async () => {
  if (!confirm(`${selectedYear}年${selectedMonth}月のデータを削除しますか？`)) {
    return
  }

  try {
    const reportMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
    const { error } = await supabase.from('food_store_sales').delete().eq('report_month', reportMonth)
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

const handleYearChange = (value: string) => {
  const year = Number(value)
  setSelectedYear(year)
  updateURL(year, selectedMonth)
}

const handleMonthChange = (value: string) => {
  const month = Number(value)
  setSelectedMonth(month)
  updateURL(selectedYear, month)
}

return (
  <div className="p-6 space-y-6">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Select value={String(selectedYear)} onValueChange={handleYearChange}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{yearOptions.map(year => <SelectItem key={year} value={String(year)}>{year}年</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(selectedMonth)} onValueChange={handleMonthChange}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>{monthOptions.map(month => <SelectItem key={month} value={String(month)}>{month}月</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={() => setShowImportModal(true)}>CSV読込</Button>
        <Button variant="destructive" onClick={handleDeleteMonth} disabled={!data || loading}>月削除</Button>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowMappingModal(true)}>
          <Link className="h-4 w-4 mr-2" />商品カテゴリー紐付け
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowCategoryModal(true)}>
          <Settings className="h-4 w-4 mr-2" />カテゴリー管理
        </Button>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-4 max-w-2xl">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">今月の実績</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data?.hasData ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  <span className="text-sm text-muted-foreground">合計売上</span>
                </div>
                <div className="text-xl font-bold">{formatCurrency(data.totalSales)}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-muted-foreground">販売個数</span>
                </div>
                <div className="text-xl font-bold">{data.totalQuantity.toLocaleString()}個</div>
              </div>
            </>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              データ未入力
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">前年度比較</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{selectedYear - 1}年{selectedMonth}月</span>
            <div className="text-lg font-semibold">{data?.lastYearSales ? formatCurrency(data.lastYearSales) : "データなし"}</div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{selectedYear - 2}年{selectedMonth}月</span>
            <div className="text-lg font-semibold">{data?.twoYearsAgoSales ? formatCurrency(data.twoYearsAgoSales) : "データなし"}</div>
          </div>
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader>
        <CardTitle className="text-base">来月の販売予測</CardTitle>
        <p className="text-sm text-muted-foreground">
          {selectedYear - 1}年{selectedMonth === 12 ? 1 : selectedMonth + 1}月の実績を基に、来月はこんな商品が売れるようです
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 gap-4">
          {data?.nextMonthPrediction && data.nextMonthPrediction.length > 0 ? (
            data.nextMonthPrediction.map((product: any, index: number) => (
              <div key={index} className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground">#{index + 1}</div>
                <div className="text-sm font-medium line-clamp-2">{product.product_name}</div>
                <div className="text-xs text-muted-foreground">{formatCurrency(product.total_sales)}</div>
              </div>
            ))
          ) : (
            <div className="col-span-5 text-center text-muted-foreground">予測データがありません</div>
          )}
        </div>
      </CardContent>
    </Card>

    <div>
      <h2 className="text-lg font-semibold mb-4">カテゴリーランキング TOP5</h2>
      <div className="grid grid-cols-5 gap-4">
        {data?.hasData && data.categoryRanking.length > 0 ? (
          data.categoryRanking.map((category: any, index: number) => (
            <CategoryRankingCard key={index} rank={index + 1} category={category} />
          ))
        ) : (
          Array.from({ length: 5 }, (_, i) => (
            <Card key={i} className="h-full">
              <CardContent className="p-4 flex items-center justify-center h-32">
                <span className="text-gray-500">データ未入力</span>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>

    <div>
      <h2 className="text-lg font-semibold mb-4">商品ランキング TOP20</h2>
      <div className="grid grid-cols-10 gap-2">
        {data?.hasData && data.productRanking.length > 0 ? (
          data.productRanking.map((product: any, index: number) => (
            <ProductRankingCard 
              key={index} 
              rank={index + 1} 
              product={{
                product_name: product.product_name,
                total_sales: product.total_sales,
                quantity_sold: product.quantity_sold,
                category_name: product.category || '未分類'
              }} 
            />
          ))
        ) : (
          Array.from({ length: 20 }, (_, i) => (
            <div key={i} className="h-24">
              <Card className="h-full p-2 flex items-center justify-center">
                <span className="text-xs text-gray-500">データ未入力</span>
              </Card>
            </div>
          ))
        )}
      </div>
    </div>

    <div>
      <h2 className="text-lg font-semibold mb-4">売上・販売個数推移（過去12ヶ月）</h2>
      <Card>
        <CardContent className="pt-6">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip formatter={(value: number) => value.toLocaleString()} />
              <Legend />
              <Bar yAxisId="left" dataKey="売上" fill="#3b82f6" name="売上（円）" />
              <Line yAxisId="right" type="monotone" dataKey="個数" stroke="#10b981" strokeWidth={2} name="販売個数" />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>

    <div>
      <h2 className="text-lg font-semibold mb-4">販売商品一覧</h2>
      <ProductSalesTable data={data?.salesData || []} />
    </div>

    {showImportModal && (
      <FoodStoreCsvImportModal
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

    {showCategoryModal && (
      <CategoryManagementModal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        onUpdate={fetchData}
      />
    )}

    {showMappingModal && (
      <ProductCategoryMappingModal
        isOpen={showMappingModal}
        onClose={() => setShowMappingModal(false)}
        onMappingComplete={fetchData}
      />
    )}
  </div>
)
}

export default function FoodStoreAnalysisPage() {
return (
  <Suspense fallback={
    <div className="p-6">
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    </div>
  }>
    <FoodStoreAnalysisContent />
  </Suspense>
)
}
