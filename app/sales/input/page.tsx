"use client"
import Sidebar from "@/components/sidebar"
import SalesInputView from "@/components/sales-input-view"

export default function SalesInputPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-64 p-8 space-y-8">
        <SalesInputView />
      </div>
    </div>
  )
}
