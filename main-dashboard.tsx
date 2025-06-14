"use client"

import { useState } from "react"
import MainSidebar, { ModuleId } from "./components/main-sidebar"
import SalesReportApp from "./sales-report-app"
import WebSalesApp from "./web-sales-app"

export default function MainDashboard() {
  const [module, setModule] = useState<ModuleId>("sales")

  return (
    <div className="flex h-screen bg-gray-50">
      <MainSidebar active={module} onChange={setModule} />
      <main className="flex-1 ml-64 overflow-auto">
        {module === "sales" && <SalesReportApp />}
        {module === "web" && <WebSalesApp />}
      </main>
    </div>
  )
}
