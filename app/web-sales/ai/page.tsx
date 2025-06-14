"use client"
import { useState } from "react"
import Sidebar from "@/components/sidebar"
import WebSalesAnalysis from "@/components/websales-analysis"

export default function WebSalesAiPage() {
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0, 7))
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-64 p-8 space-y-8">
        <div className="flex justify-end">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="border rounded text-sm p-1"
          />
        </div>
        <WebSalesAnalysis month={month} />
      </div>
    </div>
  )
}
