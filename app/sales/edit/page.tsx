"use client"
import Sidebar from "@/components/sidebar"
import SalesEditView from "@/components/sales-edit-view"

export default function SalesEditPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-64 p-8 space-y-8">
        <SalesEditView />
      </div>
    </div>
  )
}
