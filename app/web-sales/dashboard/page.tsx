"use client"

import { useState } from "react"
import WebSalesSummaryCards from "@/components/websales-summary-cards"
import WebSalesRankingTable from "@/components/websales-ranking-table"
import WebSalesEditableTable from "@/components/web-sales-editable-table"
import WebSalesCharts from "@/components/websales-charts"
import WebSalesAiSection from "@/components/web-sales-ai-section"

export const dynamic = 'force-dynamic'

export default function WebSalesDashboardPage() {
  const [month, setMonth] = useState<string>('2025-04')
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0)
  const [viewMode, setViewMode] = useState<'single' | 'period'>('single')
  const [periodMonths, setPeriodMonths] = useState<number>(6)

  const handleDataSaved = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  const handlePeriodSelect = (period: '6months' | '1year') => {
    const currentMonth = new Date(month + '-01')
    let targetDate: Date

    if (period === '6months') {
      // 6ヶ月前の月に移動
      targetDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 6, 1)
    } else {
      // 1年前の月に移動
      targetDate = new Date(currentMonth.getFullYear() - 1, currentMonth.getMonth(), 1)
    }

    const targetMonth = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`
    setMonth(targetMonth)
  }

  return (
    <div className="w-full space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">WEB販売管理システム</h1>
          <p className="text-gray-500">月次の販売実績を確認・管理します。</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handlePeriodSelect('6months')}
            className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
          >
            6ヶ月前
          </button>
          <button
            onClick={() => handlePeriodSelect('1year')}
            className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm hover:bg-green-200"
          >
            1年前
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border rounded-md text-base p-2 bg-white"
          />
        </div>
      </header>

      <WebSalesSummaryCards month={month} refreshTrigger={refreshTrigger} />
      
      <WebSalesCharts month={month} refreshTrigger={refreshTrigger} />
      
      <WebSalesEditableTable month={month} onDataSaved={handleDataSaved} />
      
      <WebSalesRankingTable month={month} />
      
      <WebSalesAiSection month={month} />
    </div>
  )
}
