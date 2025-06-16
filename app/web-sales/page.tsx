'use client'

import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { useState, useEffect } from 'react'
import MainSidebar from '@/components/main-sidebar'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Calendar } from 'react-calendar'
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon } from 'lucide-react'
import { formatDateJST } from '@/lib/utils'

interface ProductSalesData {
  id: string
  product_name: string
  series_name: string
  price: number
  amazon_count: number
  rakuten_count: number
  yahoo_count: number
  mercari_count: number
  base_count: number
  qoo10_count: number
  floor_count: number
  total_count: number
  total_sales: number
  report_month: string
}

export default function WebSalesDashboard() {
  const { data: session, status } = useSession()
  const [selectedDate, setSelectedDate] = useState(new Date(2025, 3, 1)) // 2025年4月
  const [salesData, setSalesData] = useState<ProductSalesData[]>([])
  const [loading, setLoading] = useState(true)
  const [calendarOpen, setCalendarOpen] = useState(false)

  if (status === 'loading') {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-600">読み込み中...</div>
    </div>
  }

  if (!session) {
    redirect('/login')
  }

  // データ取得
  const fetchSalesData = async (targetMonth: Date) => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      // 月をフォーマット（2025-04-01形式）
      const monthStr = `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, '0')}-01`
      console.log('検索対象月:', monthStr)
      
      // まず利用可能なデータを確認
      const { data: availableMonths } = await supabase
        .from('web_sales_summary')
        .select('report_month')
        .limit(10)
      
      console.log('利用可能な月:', availableMonths)
      
      // web_sales_summaryテーブルから直接データを取得
      const { data, error } = await supabase
        .from('web_sales_summary')
        .select('*')
        .eq('report_month', monthStr)
        .order('id')

      if (error) {
        console.error('データ取得エラー:', error)
        return
      }

      console.log('取得データ:', data)

      setSalesData(data || [])
    } catch (error) {
      console.error('データ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSalesData(selectedDate)
  }, [selectedDate])

  // 月間サマリー計算
  const monthSummary = {
    totalProducts: salesData.length,
    totalQuantity: salesData.reduce((sum, item) => sum + (item.total_count || 0), 0),
    totalSales: salesData.reduce((sum, item) => sum + (item.total_sales || 0), 0),
    amazonTotal: salesData.reduce((sum, item) => sum + (item.amazon_count || 0), 0),
    rakutenTotal: salesData.reduce((sum, item) => sum + (item.rakuten_count || 0), 0),
    yahooTotal: salesData.reduce((sum, item) => sum + (item.yahoo_count || 0), 0),
    mercariTotal: salesData.reduce((sum, item) => sum + (item.mercari_count || 0), 0),
    baseTotal: salesData.reduce((sum, item) => sum + (item.base_count || 0), 0),
    qoo10Total: salesData.reduce((sum, item) => sum + (item.qoo10_count || 0), 0),
    floorTotal: salesData.reduce((sum, item) => sum + (item.floor_count || 0), 0),
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <MainSidebar>
        <Button
          variant="ghost"
          className="w-full justify-start text-sm h-10 text-gray-300 hover:text-white hover:bg-gray-700"
        >
          📊 ダッシュボード
        </Button>
      </MainSidebar>

      <main className="flex-1 ml-64 p-8">
        <div className="max-w-7xl mx-auto">
          {/* ヘッダー */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">WEB販売管理ダッシュボード</h1>
              <p className="text-gray-600 mt-2">商品別販売実績の管理</p>
            </div>
            
            {/* 月選択 */}
            <div className="flex items-center space-x-4">
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-48 justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? formatDateJST(selectedDate, 'YYYY年MM月') : '月を選択'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      if (date) {
                        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1)
                        setSelectedDate(firstDay)
                        setCalendarOpen(false)
                      }
                    }}
                    locale="ja"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* 月間サマリー */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-600 mb-2">総商品数</h3>
              <p className="text-2xl font-bold text-gray-900">{monthSummary.totalProducts}品目</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-600 mb-2">総販売数量</h3>
              <p className="text-2xl font-bold text-gray-900">{monthSummary.totalQuantity.toLocaleString()}個</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-600 mb-2">総売上金額</h3>
              <p className="text-2xl font-bold text-gray-900">¥{monthSummary.totalSales.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-600 mb-2">平均単価</h3>
              <p className="text-2xl font-bold text-gray-900">
                ¥{monthSummary.totalQuantity > 0 ? Math.round(monthSummary.totalSales / monthSummary.totalQuantity).toLocaleString() : 0}
              </p>
            </div>
          </div>

          {/* ECサイト別サマリー */}
          <div className="grid grid-cols-7 gap-4 mb-8">
            {[
              { name: 'Amazon', count: monthSummary.amazonTotal, color: 'bg-orange-100 text-orange-800' },
              { name: '楽天', count: monthSummary.rakutenTotal, color: 'bg-red-100 text-red-800' },
              { name: 'Yahoo!', count: monthSummary.yahooTotal, color: 'bg-purple-100 text-purple-800' },
              { name: 'メルカリ', count: monthSummary.mercariTotal, color: 'bg-pink-100 text-pink-800' },
              { name: 'BASE', count: monthSummary.baseTotal, color: 'bg-blue-100 text-blue-800' },
              { name: 'Qoo10', count: monthSummary.qoo10Total, color: 'bg-green-100 text-green-800' },
              { name: 'フロア', count: monthSummary.floorTotal, color: 'bg-gray-100 text-gray-800' },
            ].map((site) => (
              <div key={site.name} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h3 className="text-xs font-medium text-gray-600 mb-1">{site.name}</h3>
                <p className={`text-sm font-bold px-2 py-1 rounded ${site.color}`}>
                  {site.count.toLocaleString()}個
                </p>
              </div>
            ))}
          </div>

          {/* 商品別販売データ */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">商品別販売実績</h2>
            </div>
            
            {loading ? (
              <div className="p-8 text-center">
                <div className="text-gray-600">データを読み込み中...</div>
              </div>
            ) : salesData.length === 0 ? (
              <div className="p-8 text-center">
                <div className="text-gray-600">選択した月のデータがありません</div>
                <div className="text-xs text-gray-500 mt-2">2025年4月のデータがある場合は、その月を選択してください</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">商品</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">価格</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Amazon</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">楽天</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Yahoo!</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">メルカリ</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">BASE</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Qoo10</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">フロア</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">合計</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">売上</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {salesData.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {item.product_name}
                            </p>
                            <p className="text-xs text-blue-600">{item.series_name}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-900">
                          ¥{item.price?.toLocaleString() || 0}
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-900">{item.amazon_count || 0}</td>
                        <td className="px-4 py-3 text-center text-sm text-gray-900">{item.rakuten_count || 0}</td>
                        <td className="px-4 py-3 text-center text-sm text-gray-900">{item.yahoo_count || 0}</td>
                        <td className="px-4 py-3 text-center text-sm text-gray-900">{item.mercari_count || 0}</td>
                        <td className="px-4 py-3 text-center text-sm text-gray-900">{item.base_count || 0}</td>
                        <td className="px-4 py-3 text-center text-sm text-gray-900">{item.qoo10_count || 0}</td>
                        <td className="px-4 py-3 text-center text-sm text-gray-900">{item.floor_count || 0}</td>
                        <td className="px-4 py-3 text-center text-sm font-semibold text-gray-900">
                          {item.total_count || 0}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-semibold text-gray-900">
                          ¥{item.total_sales?.toLocaleString() || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
