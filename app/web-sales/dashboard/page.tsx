'use client'

import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { useState, useEffect } from 'react'
import MainSidebar from '@/components/main-sidebar'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Calendar } from 'react-calendar'
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, Save, Edit3 } from 'lucide-react'
import { formatDateJST } from '@/lib/utils'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

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

interface EditingData {
  [key: string]: {
    amazon_count: string
    rakuten_count: string
    yahoo_count: string
    mercari_count: string
    base_count: string
    qoo10_count: string
    floor_count: string
  }
}

export default function WebSalesDashboard() {
  const { data: session, status } = useSession()
  const [selectedDate, setSelectedDate] = useState(new Date(2025, 3, 1))
  const [salesData, setSalesData] = useState<ProductSalesData[]>([])
  const [loading, setLoading] = useState(true)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [editingItems, setEditingItems] = useState<Set<string>>(new Set())
  const [editingData, setEditingData] = useState<EditingData>({})
  const [saving, setSaving] = useState<Set<string>>(new Set())

  if (status === 'loading') {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-600">読み込み中...</div>
    </div>
  }

  if (!session) {
    redirect('/login')
  }

  const fetchSalesData = async (targetMonth: Date) => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      const monthStr = `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, '0')}-01`
      
      const { data, error } = await supabase
        .from('web_sales_summary')
        .select('*')
        .eq('report_month', monthStr)
        .order('id')

      if (error) {
        console.error('データ取得エラー:', error)
        return
      }

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

  // 編集開始
  const startEdit = (itemId: string, item: ProductSalesData) => {
    setEditingItems(prev => new Set([...prev, itemId]))
    setEditingData(prev => ({
      ...prev,
      [itemId]: {
        amazon_count: String(item.amazon_count || 0),
        rakuten_count: String(item.rakuten_count || 0),
        yahoo_count: String(item.yahoo_count || 0),
        mercari_count: String(item.mercari_count || 0),
        base_count: String(item.base_count || 0),
        qoo10_count: String(item.qoo10_count || 0),
        floor_count: String(item.floor_count || 0),
      }
    }))
  }

  // 編集キャンセル
  const cancelEdit = (itemId: string) => {
    setEditingItems(prev => {
      const newSet = new Set(prev)
      newSet.delete(itemId)
      return newSet
    })
    setEditingData(prev => {
      const newData = { ...prev }
      delete newData[itemId]
      return newData
    })
  }

  // データ保存
  const saveItem = async (itemId: string) => {
    try {
      setSaving(prev => new Set([...prev, itemId]))
      const supabase = createClient()
      
      const editData = editingData[itemId]
      const amazonCount = parseInt(editData.amazon_count) || 0
      const rakutenCount = parseInt(editData.rakuten_count) || 0
      const yahooCount = parseInt(editData.yahoo_count) || 0
      const mercariCount = parseInt(editData.mercari_count) || 0
      const baseCount = parseInt(editData.base_count) || 0
      const qoo10Count = parseInt(editData.qoo10_count) || 0
      const floorCount = parseFloat(editData.floor_count) || 0
      
      const totalCount = amazonCount + rakutenCount + yahooCount + mercariCount + baseCount + qoo10Count + floorCount
      
      // 価格を取得して売上計算
      const currentItem = salesData.find(item => item.id === itemId)
      const totalSales = totalCount * (currentItem?.price || 0)

      const { error } = await supabase
        .from('web_sales_summary')
        .update({
          amazon_count: amazonCount,
          rakuten_count: rakutenCount,
          yahoo_count: yahooCount,
          mercari_count: mercariCount,
          base_count: baseCount,
          qoo10_count: qoo10Count,
          floor_count: floorCount,
          total_count: totalCount,
          total_sales: totalSales
        })
        .eq('id', itemId)

      if (error) {
        console.error('保存エラー:', error)
        alert('保存に失敗しました')
        return
      }

      // 成功時の処理
      cancelEdit(itemId)
      await fetchSalesData(selectedDate)
      
    } catch (error) {
      console.error('保存エラー:', error)
      alert('保存に失敗しました')
    } finally {
      setSaving(prev => {
        const newSet = new Set(prev)
        newSet.delete(itemId)
        return newSet
      })
    }
  }

  // 入力値変更
  const updateEditData = (itemId: string, field: string, value: string) => {
    setEditingData(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value
      }
    }))
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

  // グラフ用データ
  const chartData = [
    { name: 'Amazon', 販売数: monthSummary.amazonTotal, fill: '#FF9500' },
    { name: '楽天', 販売数: monthSummary.rakutenTotal, fill: '#BF0000' },
    { name: 'Yahoo!', 販売数: monthSummary.yahooTotal, fill: '#FF0033' },
    { name: 'メルカリ', 販売数: monthSummary.mercariTotal, fill: '#FF0080' },
    { name: 'BASE', 販売数: monthSummary.baseTotal, fill: '#0080FF' },
    { name: 'Qoo10', 販売数: monthSummary.qoo10Total, fill: '#8000FF' },
    { name: 'フロア', 販売数: monthSummary.floorTotal, fill: '#666666' },
  ]

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

      <main className="flex-1 ml-64 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* ヘッダー */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">WEB販売管理ダッシュボード</h1>
              <p className="text-gray-600 text-sm mt-1">商品別販売実績の管理</p>
            </div>
            
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-40 justify-start text-left">
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

          {/* 1. サマリーカード */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h3 className="text-xs font-medium text-gray-600 mb-1">総商品数</h3>
              <p className="text-lg font-bold text-gray-900">{monthSummary.totalProducts}品目</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h3 className="text-xs font-medium text-gray-600 mb-1">総販売数量</h3>
              <p className="text-lg font-bold text-gray-900">{monthSummary.totalQuantity.toLocaleString()}個</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h3 className="text-xs font-medium text-gray-600 mb-1">総売上金額</h3>
              <p className="text-lg font-bold text-gray-900">¥{monthSummary.totalSales.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h3 className="text-xs font-medium text-gray-600 mb-1">平均単価</h3>
              <p className="text-lg font-bold text-gray-900">
                ¥{monthSummary.totalQuantity > 0 ? Math.round(monthSummary.totalSales / monthSummary.totalQuantity).toLocaleString() : 0}
              </p>
            </div>
          </div>

          {/* 2. グラフ */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">ECサイト別販売数量</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="販売数" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">サイト別構成比</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {chartData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <span className="flex items-center">
                      <div className="w-3 h-3 rounded mr-2" style={{ backgroundColor: item.fill }}></div>
                      {item.name}
                    </span>
                    <span className="font-medium">{item.販売数}個</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 3. 商品別データ入力・編集テーブル */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-4 border-b">
              <h2 className="text-sm font-semibold text-gray-900">商品別販売実績（編集可能）</h2>
            </div>
            
            {loading ? (
              <div className="p-6 text-center">
                <div className="text-gray-600 text-sm">データを読み込み中...</div>
              </div>
            ) : salesData.length === 0 ? (
              <div className="p-6 text-center">
                <div className="text-gray-600 text-sm">選択した月のデータがありません</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium text-gray-500">商品名</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-500">価格</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-500">Amazon</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-500">楽天</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-500">Yahoo!</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-500">メルカリ</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-500">BASE</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-500">Qoo10</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-500">フロア</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-500">合計</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-500">売上</th>
                      <th className="px-2 py-2 text-center font-medium text-gray-500">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {salesData.map((item) => {
                      const isEditing = editingItems.has(item.id)
                      const isSaving = saving.has(item.id)
                      
                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-2 py-2">
                            <div>
                              <p className="font-medium text-gray-900 text-xs leading-tight max-w-xs">
                                {item.product_name}
                              </p>
                              <p className="text-blue-600 text-xs">{item.series_name}</p>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-center">
                            ¥{item.price?.toLocaleString() || 0}
                          </td>
                          
                          {/* 編集可能セル */}
                          {['amazon_count', 'rakuten_count', 'yahoo_count', 'mercari_count', 'base_count', 'qoo10_count', 'floor_count'].map((field) => (
                            <td key={field} className="px-2 py-2 text-center">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editingData[item.id]?.[field as keyof EditingData[string]] || '0'}
                                  onChange={(e) => updateEditData(item.id, field, e.target.value)}
                                  className="w-16 h-6 text-xs text-center p-1 border rounded"
                                  min="0"
                                />
                              ) : (
                                <span>{item[field as keyof ProductSalesData] || 0}</span>
                              )}
                            </td>
                          ))}
                          
                          <td className="px-2 py-2 text-center font-semibold">
                            {isEditing ? (
                              <span className="text-blue-600">
                                {Object.values(editingData[item.id] || {}).reduce((sum, val) => sum + (parseInt(val) || 0), 0)}
                              </span>
                            ) : (
                              item.total_count || 0
                            )}
                          </td>
                          <td className="px-2 py-2 text-center font-semibold">
                            ¥{(isEditing 
                              ? Object.values(editingData[item.id] || {}).reduce((sum, val) => sum + (parseInt(val) || 0), 0) * (item.price || 0)
                              : item.total_sales || 0
                            ).toLocaleString()}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {isEditing ? (
                              <div className="flex gap-1 justify-center">
                                <Button
                                  size="sm"
                                  onClick={() => saveItem(item.id)}
                                  disabled={isSaving}
                                  className="h-6 w-6 p-0"
                                >
                                  <Save className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => cancelEdit(item.id)}
                                  disabled={isSaving}
                                  className="h-6 w-6 p-0"
                                >
                                  ✕
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startEdit(item.id, item)}
                                className="h-6 w-6 p-0"
                              >
                                <Edit3 className="h-3 w-3" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 4. AI分析セクション（プレースホルダー） */}
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">AI分析レポート</h2>
            <div className="bg-blue-50 border border-blue-200 rounded p-4">
              <p className="text-blue-800 text-xs">
                AI分析機能は今後実装予定です。商品別の販売トレンド、在庫推奨、マーケティング提案などを提供します。
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
