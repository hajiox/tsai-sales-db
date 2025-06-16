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
              <h1 className="text-3xl font-bold text-gray-900">WEB販売管理ダッシュボード</h1>
              <p className="text-gray-600 mt-2">商品別販売実績の管理</p>
            </div>
            <Button onClick={fetchData} disabled={loading}>
              {loading ? 'データ取得中...' : 'データ取得'}
            </Button>
          </div>

          {/* システム状況 */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">システム状況</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="flex items-center">
                <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                <span>認証: 成功</span>
              </div>
              <div className="flex items-center">
                <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                <span>ページ表示: 正常</span>
              </div>
              <div className="flex items-center">
                <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                <span>サイドバー: 正常</span>
              </div>
              <div className="flex items-center">
                <span className={`w-3 h-3 rounded-full mr-2 ${dataLoaded ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                <span>データベース: {dataLoaded ? '接続済み' : '未接続'}</span>
              </div>
            </div>
          </div>

          {/* データ概要 */}
          {dataLoaded && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">データ概要</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">{salesData.length}</p>
                  <p className="text-sm text-gray-600">総商品数</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">
                    {salesData.reduce((sum, item) => sum + (item.amazon_count || 0), 0)}
                  </p>
                  <p className="text-sm text-gray-600">Amazon販売数</p>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">
                    {salesData.reduce((sum, item) => sum + (item.rakuten_count || 0), 0)}
                  </p>
                  <p className="text-sm text-gray-600">楽天販売数</p>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <p className="text-2xl font-bold text-purple-600">
                    {salesData.reduce((sum, item) => 
                      sum + (item.amazon_count || 0) + (item.rakuten_count || 0) + 
                      (item.yahoo_count || 0) + (item.mercari_count || 0) + 
                      (item.base_count || 0) + (item.qoo10_count || 0) + (item.floor_count || 0), 0
                    )}
                  </p>
                  <p className="text-sm text-gray-600">総販売数</p>
                </div>
              </div>
            </div>
          )}

          {/* 商品データサンプル */}
          {dataLoaded && salesData.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">商品データサンプル（最初の5件）</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left">商品名</th>
                      <th className="px-4 py-3 text-center">価格</th>
                      <th className="px-4 py-3 text-center">Amazon</th>
                      <th className="px-4 py-3 text-center">楽天</th>
                      <th className="px-4 py-3 text-center">Yahoo!</th>
                      <th className="px-4 py-3 text-center">メルカリ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {salesData.slice(0, 5).map((item, index) => (
                      <tr key={index}>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium">{item.product_name || '商品名なし'}</p>
                            <p className="text-gray-500 text-xs">{item.series_name || 'シリーズなし'}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">¥{(item.price || 0).toLocaleString()}</td>
                        <td className="px-4 py-3 text-center">{item.amazon_count || 0}</td>
                        <td className="px-4 py-3 text-center">{item.rakuten_count || 0}</td>
                        <td className="px-4 py-3 text-center">{item.yahoo_count || 0}</td>
                        <td className="px-4 py-3 text-center">{item.mercari_count || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 次のステップ */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-blue-900 mb-2">🚀 次のステップ</h2>
            <p className="text-blue-800 mb-3">基本機能が正常に動作しています。今後追加予定：</p>
            <div className="grid grid-cols-2 gap-2 text-sm text-blue-800">
              <div>• 完全な商品データテーブル</div>
              <div>• データ編集機能</div>
              <div>• グラフ・チャート表示</div>
              <div>• AI分析レポート</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
