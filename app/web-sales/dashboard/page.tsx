// /app/web-sales/dashboard/page.tsx
// ver5 (デバッグ用簡素版)
"use client"

import { useState } from "react"

export const dynamic = 'force-dynamic'

export default function WebSalesDashboardPage() {
  const [month, setMonth] = useState<string>('2025-06');

  return (
    <div className="w-full space-y-6">
      <header className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">WEB販売管理システム</h1>
          <p className="text-gray-500">デバッグ中...</p>
        </div>
        <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border rounded-md text-base p-2 bg-white"
            />
          </div>
        </div>
      </header>
      
      <div className="p-4 bg-white border rounded-lg">
        <p>基本的なページ表示テスト</p>
        <p>選択月: {month}</p>
      </div>
    </div>
  );
}
