"use client"
export const dynamic = 'force-dynamic'
import Sidebar from "@/components/sidebar"
import WebSalesInputView from "@/components/web-sales-input-view"
export default function WebSalesInputPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-64 p-8">
        <WebSalesInputView />
      </div>
    </div>
  )
}
