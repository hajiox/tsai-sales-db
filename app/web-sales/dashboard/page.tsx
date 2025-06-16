'use client'

import { useSession } from 'next-auth/react'
import { redirect } from 'next/navigation'

export default function WebSalesDashboard() {
  const { data: session, status } = useSession()

  if (status === 'loading') {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-600">読み込み中...</div>
    </div>
  }

  if (!session) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">WEB販売管理ダッシュボード</h1>
        
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">システム状況</h2>
          <div className="space-y-2">
            <p>✅ 認証: 成功</p>
            <p>✅ ページ表示: 正常</p>
            <p>✅ ユーザー: {session.user?.name}</p>
            <p>⏳ データベース接続: 準備中</p>
          </div>
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">開発状況</h3>
          <p className="text-blue-800 text-sm">
            基本的なページ表示が確認できました。次のステップで機能を追加していきます。
          </p>
        </div>
      </div>
    </div>
  )
}
