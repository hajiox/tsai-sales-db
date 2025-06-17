"use client"

import { useState } from "react"
import WebSalesSummaryCards from "@/components/websales-summary-cards"
import WebSalesRankingTable from "@/components/websales-ranking-table"

export const dynamic = 'force-dynamic'

export default function WebSalesDashboardPage() {
  const [month, setMonth] = useState<string>('2025-04')

  return (
    <div className="w-full space-y-6">
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

      <WebSalesSummaryCards month={month} />
      
      <WebSalesRankingTable month={month} />
    </div>
  )
}
