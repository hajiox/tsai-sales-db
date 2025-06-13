"use client"

import { useState } from "react"
import Sidebar from "./components/sidebar"
import DashboardView from "./components/dashboard-view"
import SalesInputView from "./components/sales-input-view"
import SalesEditView from "./components/sales-edit-view"
import { useSession, signOut } from "next-auth/react"

type NavigationItem = "dashboard" | "input" | "edit"

export default function AdminDashboard() {
  const [activeView, setActiveView] = useState<NavigationItem>("dashboard")
  const { data: session } = useSession()

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
    <div className="flex h-screen bg-gray-50">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />

      <main className="flex-1 ml-64 overflow-auto">
        <div className="p-8">{renderContent()}</div>
      </main>

      {session && (
        <button
          onClick={() => signOut()}
          className="fixed bottom-4 left-4 text-sm bg-white px-3 py-1 rounded shadow hover:bg-gray-100"
        >
          ログアウト
        </button>
      )}
    </div>
  )
}
