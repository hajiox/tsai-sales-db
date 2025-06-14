"use client"
import { useState } from "react"
import Sidebar from "@/components/sidebar"
import WebSalesDashboard from "@/components/websales-dashboard"
import WebSalesSummaryCards from "@/components/websales-summary-cards"
import WebSalesRankingTable from "@/components/websales-ranking-table"
import CommonDashboard from "@/components/common-dashboard"

export default function WebSalesDashboardPage() {
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0, 7))
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-64 overflow-auto p-8 space-y-8">
        <div className="flex justify-end">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border rounded text-sm p-1"
          />
        </div>
        <WebSalesSummaryCards month={month} />
        <WebSalesRankingTable month={month} />
        <CommonDashboard />
        <WebSalesDashboard month={month} />
      </div>
    </div>
  )
}
