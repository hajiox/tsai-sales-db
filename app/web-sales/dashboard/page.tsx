'use client'

import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { useState, useEffect } from 'react'
import MainSidebar from '@/components/main-sidebar'
import { Button } from '@/components/ui/button'
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
  const [salesData, setSalesData] = useState<ProductSalesData[]>([])
  const [loading, setLoading] = useState(true)
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

  // データ取得
  const fetchSalesData = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/web-sales-data')
      const result = await response.json()
      
      if (result.error) {
        console.error('APIエラー:', result.error)
        return
      }

      setSalesData(result.data || [])
    } catch (error) {
      console.error('データ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

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
      
      const editData = editingData[itemId]
      const updateData = {
        amazon_count: parseInt(editData.amazon_count) || 0,
        rakuten_count: parseInt(editData.rakuten_count) || 0,
        yahoo_count: parseInt(editData.yahoo_count) || 0,
        mercari_count: parseInt(editData.mercari_count) || 0,
        base_count: parseInt(editData.base_count) || 0,
        qoo10_count: parseInt(editData.qoo10_count) || 0,
        floor_count: parseFloat(editData.floor_count) || 0,
      }

      const response = await fetch(`/api/web-sales-data/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      })

      if (!response.ok) {
        throw new Error('保存に失敗しました')
      }

      cancelEdit(itemId)
      await fetchSalesData()
      
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
    fetchSalesData()
  }, [])

  // 合計計算
  const getTotalQuantity = (item: ProductSalesData) => {
    return (item.amazon_count || 0) + (item.rakuten_count || 0) + (item.yahoo_count || 0) + 
           (item.mercari_count || 0) + (item.base_count || 0) + (item.qoo10_count || 0) + (item.floor_count || 0)
  }

  const getTotalSales = (item: ProductSalesData) => {
    return getTotalQuantity(item) * (item.price || 0)
  }

  // サマリー計算
  const summary = {
    totalProducts: salesData.length,
    totalQuantity: salesData.reduce((sum, item) => sum + getTotalQuantity(item), 0),
    totalSales: salesData.reduce((sum, item) => sum + getTotalSales(item), 0),
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
    { name: 'Amazon', 販売数: summary.amazonTotal, fill: '#FF9500' },
    { name: '楽天', 販売数: summary.rakutenTotal, fill: '#BF0000' },
    { name: 'Yahoo!', 販売数: summary.yahooTotal, fill: '#FF0033' },
    { name: 'メルカリ', 販売数: summary.mercariTotal, fill: '#FF0080' },
    { name: 'BASE', 販売数: summary.baseTotal, fill: '#0080FF' },
    { name: 'Qoo10', 販売数: summary.qoo10Total, fill: '#8000FF' },
    { name: 'フロア', 販売数: summary.floorTotal, fill: '#666666' },
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
            <Button onClick={fetchSalesData} disabled={loading}>
              {loading ? '更新中...' : 'データ更新'}
            </Button>
          </div>

          {/* 1. サマリーカード */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h3 className="text-xs font-medium text-gray-600 mb-1">総商品数</h3>
              <p className="text-lg font-bold text-gray-900">{summary.totalProducts}品目</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h3 className="text-xs font-medium text-gray-600 mb-1">総販売数量</h3>
              <p className="text-lg font-bold text-gray-900">{summary.totalQuantity.toLocaleString()}個</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h3 className="text-xs font-medium text-gray-600 mb-1">総売上金額</h3>
              <p className="text-lg font-bold text-gray-900">¥{summary.totalSales.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h3 className="text-xs font-medium text-gray-600 mb-1">平均単価</h3>
              <p className="text-lg font-bold text-gray-900">
                ¥{summary.totalQuantity > 0 ? Math.round(summary.totalSales / summary.totalQuantity).toLocaleString() : 0}
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
                                {item.product_name || '商品名なし'}
                              </p>
                              <p className="text-blue-600 text-xs">{item.series_name || 'シリーズなし'}</p>
                            </div>
                          </td>
                          <td className="px-2 py-2 text-center">
                            ¥{(item.price || 0).toLocaleString()}
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
                                {Object.values(editingData[item.id] || {}).reduce((sum, val) => sum + (parseFloat(val) || 0), 0)}
                              </span>
                            ) : (
                              getTotalQuantity(item)
                            )}
                          </td>
                          <td className="px-2 py-2 text-center font-semibold">
                            ¥{(isEditing 
                              ? Object.values(editingData[item.id] || {}).reduce((sum, val) => sum + (parseFloat(val) || 0), 0) * (item.price || 0)
                              : getTotalSales(item)
                            ).toLocaleString()}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {isEditing ? (
                              <div className="flex gap-1 justify-center">
                                <button
                                  onClick={() => saveItem(item.id)}
                                  disabled={isSaving}
                                  className="h-6 w-6 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50"
                                >
                                  💾
                                </button>
                                <button
                                  onClick={() => cancelEdit(item.id)}
                                  disabled={isSaving}
                                  className="h-6 w-6 bg-gray-600 text-white rounded text-xs hover:bg-gray-700 disabled:opacity-50"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEdit(item.id, item)}
                                className="h-6 w-6 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                              >
                                ✏️
                              </button>
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
