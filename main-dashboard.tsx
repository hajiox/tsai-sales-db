"use client"

import { useState } from "react"
import MainSidebar from "@/components/main-sidebar" // 正しいパスを指定
import SalesSidebarMenu from "@/components/sidebar" // 名前をSalesSidebarMenuに変更したsidebar.tsx
// import WebSalesSidebarMenu from "@/components/websales-sidebar" // Web販売管理のサブメニューも同様に作成する

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
        {/* {activeModule === "web" && <WebSalesSidebarMenu />} */}
      </MainSidebar>
      
      {/* メインコンテンツは、サイドバーの幅(w-64)だけ左にマージンをとる */}
      <main className="ml-64 p-6">
        {children}
      </main>
    </div>
  )
}
