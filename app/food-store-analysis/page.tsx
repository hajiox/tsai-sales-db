// /app/food-store-analysis/page.tsx ver.3
'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar, Upload, Package, Settings, Link } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CategoryRankingCard } from '@/components/food-store/CategoryRankingCard'
import { ProductRankingCard } from '@/components/food-store/ProductRankingCard'
import { ProductSalesTable } from '@/components/food-store/ProductSalesTable'
import { FoodStoreCsvImportModal } from '@/components/food-store/FoodStoreCsvImportModal'
import { CategoryManagementModal } from '@/components/food-store/CategoryManagementModal'
import { ProductCategoryMappingModal } from '@/components/food-store/ProductCategoryMappingModal'
import { useSearchParams, useRouter } from 'next/navigation'

function FoodStoreAnalysisContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1)
  const [availableMonths, setAvailableMonths] = useState<Array<{year: number, month: number}>>([])
  const [categoryData, setCategoryData] = useState<any[]>([])
  const [productData, setProductData] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCsvImport, setShowCsvImport] = useState(false)
  const [showCategoryManagement, setShowCategoryManagement] = useState(false)
  const [showProductMapping, setShowProductMapping] = useState(false)
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
  const updateURL = useCallback((year: number, month: number) => {
    const params = new URLSearchParams()
    params.set('year', year.toString())
    params.set('month', month.toString())
    router.push(`/food-store-analysis?${params.toString()}`)
  }, [router])

  // 利用可能な月を取得
  useEffect(() => {
    fetchAvailableMonths()
  }, [])

  // データを取得
  useEffect(() => {
    fetchData()
  }, [selectedYear, selectedMonth])

  const fetchAvailableMonths = async () => {
    try {
      const { data, error } = await supabase
        .from('food_store_sales')
        .select('report_month')
        .order('report_month', { ascending: false })

      if (error) throw error

      const uniqueMonths = Array.from(new Set(data?.map(d => d.report_month) || []))
        .map(dateStr => {
          const date = new Date(dateStr)
          return {
            year: date.getFullYear(),
            month: date.getMonth() + 1
          }
        })

      setAvailableMonths(uniqueMonths)
    } catch (error) {
      console.error('Error fetching available months:', error)
    }
  }

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const startDate = new Date(selectedYear, selectedMonth - 1, 1)
      const endDate = new Date(selectedYear, selectedMonth, 0)

      const { data: salesData, error: salesError } = await supabase
        .from('food_store_sales')
        .select(`
          *,
          food_product_master!jan_code (
            category_id,
            food_category_master (
              category_name
            )
          )
        `)
        .gte('report_month', startDate.toISOString())
        .lte('report_month', endDate.toISOString())
        .order('total_sales', { ascending: false })

      if (salesError) throw salesError

      // カテゴリー別集計
      const categoryMap = new Map()
      salesData?.forEach(item => {
        // カテゴリー名を安全に取得
        let categoryName = '未分類'
        if (item.food_product_master && 
            item.food_product_master.food_category_master && 
            item.food_product_master.food_category_master.category_name) {
          categoryName = item.food_product_master.food_category_master.category_name
        }

        if (!categoryMap.has(categoryName)) {
          categoryMap.set(categoryName, {
            category: categoryName,
            totalSales: 0,
            itemCount: 0,
            totalQuantity: 0
          })
        }
        const cat = categoryMap.get(categoryName)
        cat.totalSales += item.total_sales || 0
        cat.itemCount += 1
        cat.totalQuantity += item.quantity_sold || 0
      })

      const categoryArray = Array.from(categoryMap.values())
        .sort((a, b) => b.totalSales - a.totalSales)

      setCategoryData(categoryArray)
      setProductData(salesData || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleYearMonthChange = (type: 'year' | 'month', value: string) => {
    const numValue = parseInt(value)
    if (type === 'year') {
      setSelectedYear(numValue)
      updateURL(numValue, selectedMonth)
    } else {
      setSelectedMonth(numValue)
      updateURL(selectedYear, numValue)
    }
  }

  const handleImportComplete = () => {
    fetchAvailableMonths()
    fetchData()
  }

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  const hasDataForCurrentMonth = availableMonths.some(m => 
    m.year === selectedYear && m.month === selectedMonth
  )

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">食のブランド館分析</h1>
        <div className="flex gap-2">
          <Button onClick={() => setShowProductMapping(true)} variant="outline">
            <Link className="h-4 w-4 mr-2" />
            商品カテゴリー紐付け
          </Button>
          <Button onClick={() => setShowCategoryManagement(true)} variant="outline">
            <Settings className="h-4 w-4 mr-2" />
            カテゴリー管理
          </Button>
          <Button onClick={() => setShowCsvImport(true)}>
            <Upload className="h-4 w-4 mr-2" />
            CSV読込
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              表示期間
            </CardTitle>
            {!hasDataForCurrentMonth && (
              <span className="text-sm text-orange-600">
                {selectedYear}年{selectedMonth}月のデータがありません
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Select value={selectedYear.toString()} onValueChange={(value) => handleYearMonthChange('year', value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(year => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}年
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedMonth.toString()} onValueChange={(value) => handleYearMonthChange('month', value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map(month => (
                  <SelectItem key={month} value={month.toString()}>
                    {month}月
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {availableMonths.length > 0 && (
            <div className="mt-2 text-sm text-gray-600">
              データ登録済み: {availableMonths.map(m => `${m.year}年${m.month}月`).join(', ')}
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">データを読み込み中...</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CategoryRankingCard data={categoryData} />
            <ProductRankingCard data={productData} />
          </div>

          <ProductSalesTable 
            data={productData}
            categories={categoryData}
          />
        </>
      )}

      <FoodStoreCsvImportModal
        isOpen={showCsvImport}
        onClose={() => setShowCsvImport(false)}
        onImportComplete={handleImportComplete}
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
      />

      <CategoryManagementModal
        isOpen={showCategoryManagement}
        onClose={() => setShowCategoryManagement(false)}
        onUpdate={fetchData}
      />

      <ProductCategoryMappingModal
        isOpen={showProductMapping}
        onClose={() => setShowProductMapping(false)}
        onMappingComplete={fetchData}
      />
    </div>
  )
}

export default function FoodStoreAnalysisPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">読み込み中...</div>
        </div>
      </div>
    }>
      <FoodStoreAnalysisContent />
    </Suspense>
  )
}
