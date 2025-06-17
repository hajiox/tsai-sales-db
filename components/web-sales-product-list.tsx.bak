"use client"

import { useState } from "react"
import WebSalesProductList from "@/components/web-sales-product-list"
import WebSalesSummaryCards from "@/components/websales-summary-cards"
import WebSalesRankingTable from "@/components/websales-ranking-table"

// 静的生成を無効化して動的レンダリングを強制
export const dynamic = 'force-dynamic'

/**
 * WEB販売管理システムのページ
 * Excelファイルと同じ形式の商品一覧を表示します。
 * レイアウト（サイドバー等）は main-dashboard.tsx が担当します。
 */
export default function WebSalesDashboardPage() {
  const [month, setMonth] = useState<string>('2025-04')

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

      {/* サマリーカード（修正予定） */}
      <WebSalesSummaryCards month={month} />

      {/* メイン商品一覧 - Excelファイルと同じ形式 */}
      <WebSalesProductList month={month} />

      {/* ランキングテーブル（修正予定） */}
      <WebSalesRankingTable month={month} />
    </div>
  )
}
