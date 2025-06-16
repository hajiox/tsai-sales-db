"use client"

import { useState, useEffect } from "react"
import { usePathname } from 'next/navigation'
import MainSidebar from "@/components/main-sidebar"
import SalesSidebarMenu from "@/components/sidebar"
// import WebSalesSidebarMenu from "@/components/websales/WebSalesSidebarMenu" // ファイルが見つからないため、一時的にコメントアウト

export default function MainDashboard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [activeModule, setActiveModule] = useState<'sales' | 'web'>('sales')

  useEffect(() => {
    if (pathname.startsWith('/web-sales')) {
      setActiveModule('web')
    } else {
      setActiveModule('sales')
    }
  }, [pathname])

  const handleModuleChange = (moduleId: "sales" | "web") => {
    setActiveModule(moduleId)
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      <MainSidebar active={activeModule} onChange={handleModuleChange}>
        {activeModule === 'sales' && <SalesSidebarMenu />}
        {/* {activeModule === 'web' && <WebSalesSidebarMenu />} // 対応するコンポーネントを後ほど作成します */}
      </MainSidebar>
      
      <main className="flex-grow p-6 overflow-auto">
        {children}
      </main>
    </div>
  )
}
