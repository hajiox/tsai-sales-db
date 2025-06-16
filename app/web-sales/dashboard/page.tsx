'use client'

import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { useState, useEffect } from 'react'
import MainSidebar from '@/components/main-sidebar'
import { Button } from '@/components/ui/button'

export default function WebSalesDashboard() {
  const { data: session, status } = useSession()
  const [salesData, setSalesData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)

  if (status === 'loading') {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-600">読み込み中...</div>
    </div>
  }

  if (!session) {
    redirect('/login')
  }

  // データ取得機能
  const fetchData = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/web-sales-data')
      const result = await response.json()
      
      if (result.error) {
        console.error('APIエラー:', result.error)
        return
      }

      setSalesData(result.data || [])
      setDataLoaded(true)
      
    } catch (error) {
      console.error('データ取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }

  // 合計計算
  const getTotalQuantity = (item: any) => {
    return (item.amazon_count || 0) + (item.rakuten_count || 0) + (item.yahoo_count || 0) + 
           (item.mercari_count || 0) + (item.base_count || 0) + (item.qoo10_count || 0) + (item.floor_count || 0)
  }

  const getTotalSales = (item: any) => {
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
            <Button onClick={fetchData} disabled={loading}>
              {loading ? 'データ取得中...' : 'データ取得'}
            </Button>
          </div>

          {/* 1. サマリーカード */}
          {dataLoaded && (
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow-sm border p-4">
                <h3 className="text-xs font-medium text-gray-600 mb-1">総商品数</h3>
                <p className="text-sm font-bold text-gray-900">{summary.totalProducts}品目</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border p-4">
                <h3 className="text-xs font-medium text-gray-600 mb-1">総販売数量</h3>
                <p className="text-sm font-bold text-gray-900">{summary.totalQuantity.toLocaleString()}個</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border p-4">
                <h3 className="text-xs font-medium text-gray-600 mb-1">総売上金額</h3>
                <p className="text-sm font-bold text-gray-900">¥{summary.totalSales.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-lg shadow-sm border p-4">
                <h3 className="text-xs font-medium text-gray-600 mb-1">平均単価</h3>
                <p className="text-sm font-bold text-gray-900">
                  ¥{summary.totalQuantity > 0 ? Math.round(summary.totalSales / summary.totalQuantity).toLocaleString() : 0}
                </p>
              </div>
            </div>
          )}

          {/* 2. グラフエリア（簡易版） */}
          {dataLoaded && (
            <div className="grid grid-cols-7 gap-2">
              {[
                { name: 'Amazon', count: summary.amazonTotal, color: 'bg-orange-100 text-orange-800' },
                { name: '楽天', count: summary.rakutenTotal, color: 'bg-red-100 text-red-800' },
                { name: 'Yahoo!', count: summary.yahooTotal, color: 'bg-purple-100 text-purple-800' },
                { name: 'メルカリ', count: summary.mercariTotal, color: 'bg-pink-100 text-pink-800' },
                { name: 'BASE', count: summary.baseTotal, color: 'bg-blue-100 text-blue-800' },
                { name: 'Qoo10', count: summary.qoo10Total, color: 'bg-green-100 text-green-800' },
                { name: 'フロア', count: summary.floorTotal, color: 'bg-gray-100 text-gray-800' },
              ].map((site) => (
                <div key={site.name} className="bg-white rounded-lg shadow-sm border p-3">
                  <h3 className="text-xs font-medium text-gray-600 mb-1">{site.name}</h3>
                  <p className={`text-xs font-bold px-2 py-1 rounded ${site.color}`}>
                    {site.count}個
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* 3. 商品データテーブル（表示のみ） */}
          {dataLoaded && (
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-4 border-b">
                <h2 className="text-sm font-semibold text-gray-900">商品別販売実績</h2>
              </div>
              
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {salesData.slice(0, 10).map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-2 py-2">
                          <div>
                            <p className="font-medium text-gray-900 text-xs leading-tight max-w-xs">
                              {item.product_name || '商品名なし'}
                            </p>
                            <p className="text-blue-600 text-xs">{item.series_name || 'シリーズなし'}</p>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-center">¥{(item.price || 0).toLocaleString()}</td>
                        <td className="px-2 py-2 text-center">{item.amazon_count || 0}</td>
                        <td className="px-2 py-2 text-center">{item.rakuten_count || 0}</td>
                        <td className="px-2 py-2 text-center">{item.yahoo_count || 0}</td>
                        <td className="px-2 py-2 text-center">{item.mercari_count || 0}</td>
                        <td className="px-2 py-2 text-center">{item.base_count || 0}</td>
                        <td className="px-2 py-2 text-center">{item.qoo10_count || 0}</td>
                        <td className="px-2 py-2 text-center">{item.floor_count || 0}</td>
                        <td className="px-2 py-2 text-center font-semibold">{getTotalQuantity(item)}</td>
                        <td className="px-2 py-2 text-center font-semibold">¥{getTotalSales(item).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. AI分析（簡易版） */}
          {dataLoaded && (
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">AI分析レポート</h2>
              <div className="bg-blue-50 border border-blue-200 rounded p-4">
                <p className="text-blue-800 text-xs">
                  📊 Amazon ({summary.amazonTotal}個) と楽天 ({summary.rakutenTotal}個) が主力チャネルです。
                  総販売数量: {summary.totalQuantity}個、総売上: ¥{summary.totalSales.toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
