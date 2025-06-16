'use client'

import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'
import MainSidebar from '@/components/main-sidebar'
import { Button } from '@/components/ui/button'

export default function WebSalesDashboard() {
  console.log('ページ読み込み開始')
  
  const { data: session, status } = useSession()

  console.log('認証状態:', { status, hasSession: !!session })

  if (status === 'loading') {
    console.log('認証中...')
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-600">認証を確認中...</div>
    </div>
  }

  if (!session) {
    console.log('未認証のためリダイレクト')
    redirect('/login')
  }

  console.log('認証済み、メイン画面表示')

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
          <p className="text-gray-600 mt-2">認証とサイドバーのテスト</p>
          
          <div className="mt-6 space-y-4">
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h2 className="text-lg font-semibold mb-2">認証情報</h2>
              <p><strong>ユーザー:</strong> {session?.user?.name || 'Unknown'}</p>
              <p><strong>メール:</strong> {session?.user?.email || 'Unknown'}</p>
            </div>
            
            <div className="bg-white rounded-lg shadow-sm border p-4">
              <h2 className="text-lg font-semibold mb-2">動作確認</h2>
              <p>✅ 最小ページ表示</p>
              <p>✅ 認証システム</p>
              <p>✅ サイドバー表示</p>
              <p>⏳ データベース接続（次のステップ）</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
