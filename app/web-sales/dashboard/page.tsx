"use client"

import { useState } from "react"
import WebSalesDashboard from "@/components/websales-dashboard"
import WebSalesSummaryCards from "@/components/websales-summary-cards"
import WebSalesRankingTable from "@/components/websales-ranking-table"
import CommonDashboard from "@/components/common-dashboard"

// 静的生成を無効化して動的レンダリングを強制
export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * WEB販売管理システムのページ
 * 各コンポーネントを統合し、完全なダッシュボードを構成します。
 * レイアウト（サイドバー等）は main-dashboard.tsx が担当します。
 */
export default function WebSalesDashboardPage() {
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0, 7))

  return (
    <div className="w-full space-y-6">
      {/* ヘッダー部分 - 月選択機能付き */}
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">WEB販売管理</h1>
          <p className="text-gray-500">月次の販売実績を確認・管理します。</p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border rounded-md text-base p-2 bg-white"
        />
      </header>

      {/* サマリーカード */}
      <WebSalesSummaryCards month={month} />

      {/* ランキングテーブル */}
      <WebSalesRankingTable month={month} />

      {/* 共通ダッシュボード */}
      <CommonDashboard />

      {/* メインダッシュボード */}
      <WebSalesDashboard />
    </div>
  )
}
