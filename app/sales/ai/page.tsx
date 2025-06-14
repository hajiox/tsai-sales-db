"use client"
import Sidebar from "@/components/sidebar"

export default function SalesAiPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-64 p-8 space-y-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">AI分析</h2>
        <p className="text-sm text-gray-600">AI分析機能は準備中です。</p>
      </div>
    </div>
  )
}
