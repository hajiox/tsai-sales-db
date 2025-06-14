"use client"

import { useState } from "react"
import Sidebar from "./components/sidebar"
import DashboardView from "./components/dashboard-view"
import SalesInputView from "./components/sales-input-view"
import SalesEditView from "./components/sales-edit-view"

type NavigationItem = "dashboard" | "input" | "edit"

export default function SalesReportApp() {
  const [activeView, setActiveView] = useState<NavigationItem>("dashboard")

  const renderContent = () => {
    switch (activeView) {
      case "dashboard":
        return <DashboardView />
      case "input":
        return <SalesInputView />
      case "edit":
        return <SalesEditView />
      default:
        return <DashboardView />
    }
  }

  return (
    <div className="flex h-full">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />

      <div className="flex-1 ml-64 overflow-auto">
        <div className="p-8 space-y-8">{renderContent()}</div>
      </div>
    </div>
  )
}
