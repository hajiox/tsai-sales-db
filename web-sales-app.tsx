"use client"

import { useState } from "react"
import WebSalesSidebar from "./components/websales-sidebar"
import WebSalesDashboard from "./components/websales-dashboard"
import WebSalesInputView from "./components/web-sales-input-view"
import WebSalesEdit from "./components/websales-edit"
import WebSalesAnalysis from "./components/websales-analysis"
import CommonDashboard from "./components/common-dashboard"
import WebSalesSummaryCards from "./components/websales-summary-cards"
import WebSalesRankingTable from "./components/websales-ranking-table"

export type WebView = "dashboard" | "input" | "edit" | "analysis"

export default function WebSalesApp() {
  const [activeView, setActiveView] = useState<WebView>("dashboard")
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0, 7))

  const renderContent = () => {
    switch (activeView) {
      case "dashboard":
        return <WebSalesDashboard month={month} />
      case "input":
        return <WebSalesInputView />
      case "edit":
        return <WebSalesEdit month={month} />
      case "analysis":
        return <WebSalesAnalysis month={month} />
      default:
        return <WebSalesDashboard month={month} />
    }
  }

  return (
    <div className="flex h-full">
      <WebSalesSidebar activeView={activeView} onViewChange={setActiveView} />
      <div className="flex-1 ml-64 overflow-auto">
        <div className="p-8 space-y-8">
          <div className="flex justify-end">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border rounded text-sm p-1"
            />
          </div>
          <WebSalesSummaryCards month={month} />
          {activeView === "dashboard" && (
            <WebSalesRankingTable month={month} />
          )}
          <CommonDashboard />
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
