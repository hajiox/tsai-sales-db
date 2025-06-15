"use client"

import { useState } from "react"
import MainSidebar from "@/components/main-sidebar"
import SalesSidebarMenu from "@/components/sidebar"
// import WebSalesSidebarMenu from "@/components/websales-sidebar" // こちらは次のステップで対応します

export default function MainDashboard({ children }: { children: React.ReactNode }) {
  const [activeModule, setActiveModule] = useState<"sales" | "web">("sales")

  const handleModuleChange = (moduleId: "sales" | "web") => {
    setActiveModule(moduleId)
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <MainSidebar active={activeModule} onChange={handleModuleChange}>
        {/* MainSidebarの子として、アクティブなモジュールのサブメニューを渡す */}
        {activeModule === "sales" && <SalesSidebarMenu />}
        {/* {activeModule === "web" && <WebSalesSidebarMenu />} // WEB販売管理はまだコメントのまま */}
      </MainSidebar>
      
      {/* メインコンテンツは、サイドバーの幅(w-64)だけ左にマージンをとる */}
      <main className="ml-64 p-6">
        {children}
      </main>
    </div>
  )
}
