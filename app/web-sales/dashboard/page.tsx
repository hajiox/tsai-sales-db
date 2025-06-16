'use client'

import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import { useState, useEffect } from 'react'
import MainSidebar from '@/components/main-sidebar'
import { Button } from '@/components/ui/button'

export default function WebSalesDashboard() {
  console.log('ページ読み込み開始')
  
  const { data: session, status } = useSession()
  const [salesData, setSalesData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status === 'loading') {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-600">認証を確認中...</div>
    </div>
  }

  if (!session) {
    redirect('/login')
  }

  const fetchSalesData = async () => {
    console.log('データ取得開始')
    try {
      setLoading(true)
      setError(null)
      
      // Supabaseクライアントを動的にインポート
      const { createClient } = await import('@/lib/supabase')
      const supabase = createClient()
      console.log('Supabaseクライアント作成完了')
      
      const { data, error } = await supabase
        .from('web_sales_summary')
        .select('*')
        .eq('report_month', '2025-04-01')
        .limit(3)

      console.log('Supabase応答:', { data, error })

      if (error) {
        console.error('Supabaseエラー:', error)
        setError(`データ取得エラー: ${error.message}`)
        return
      }

      console.log('データ取得成功:', data?.length, '件')
      setSalesData(data || [])
      
    } catch (error: any) {
      console.error('予期しないエラー:', error)
      setError(`予期しないエラー: ${error.message}`)
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

      <main className="flex-1 ml-64 p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900">WEB販売管理ダッシュボード</h1>
          <p className="text-gray-600 mt-2">データベース接続テスト</p>
          
          <div className="mt-6 space-y-4">
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h2 className="text-lg font-semibold mb-2">認証情報</h2>
              <p><strong>ユーザー:</strong> {session?.user?.name || 'Unknown'}</p>
              <p><strong>メール:</strong> {session?.user?.email || 'Unknown'}</p>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">データベーステスト</h2>
                <Button 
                  onClick={fetchSalesData} 
                  disabled={loading}
                  className="ml-4"
                >
                  {loading ? 'データ取得中...' : 'データ取得テスト'}
                </Button>
              </div>
              
              {error && (
                <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
                  <p className="text-red-800 text-sm">{error}</p>
                </div>
              )}

              {loading && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
                  <p className="text-blue-800 text-sm">データを取得中...</p>
                </div>
              )}

              {salesData.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded p-3">
                  <p className="text-green-800 text-sm font-semibold mb-2">
                    ✅ データ取得成功: {salesData.length}件
                  </p>
                  <div className="space-y-2">
                    {salesData.map((item, index) => (
                      <div key={index} className="text-xs bg-white p-2 rounded border">
                        <p><strong>ID:</strong> {item.id}</p>
                        <p><strong>商品名:</strong> {item.product_name}</p>
                        <p><strong>価格:</strong> ¥{item.price?.toLocaleString()}</p>
                        <p><strong>Amazon:</strong> {item.amazon_count}, <strong>楽天:</strong> {item.rakuten_count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h2 className="text-lg font-semibold mb-2">動作確認</h2>
              <p>✅ 最小ページ表示</p>
              <p>✅ 認証システム</p>
              <p>✅ サイドバー表示</p>
              <p>{salesData.length > 0 ? '✅' : '⏳'} データベース接続</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
