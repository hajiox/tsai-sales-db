"use client"

import { useState, useEffect } from "react"
import { usePathname } from 'next/navigation'
import MainSidebar from "@/components/main-sidebar"
import SalesSidebarMenu from "@/components/sidebar"
import WebSalesSidebarMenu from "@/components/websales/WebSalesSidebarMenu" // 正しいパスに修正

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
        {activeModule === 'web' && <WebSalesSidebarMenu />}
      </MainSidebar>
      
      <main className="flex-grow p-6 overflow-auto">
        {children}
      </main>
    </div>
  )
}
