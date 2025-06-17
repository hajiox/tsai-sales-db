"use client"

import { useState, useEffect } from "react"
import { usePathname } from 'next/navigation'
import MainSidebar from "@/components/main-sidebar"
import SalesSidebarMenu from "@/components/sidebar"

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
  
  return (
    // 全体をflexboxで管理し、マージン計算を不要にします
    <div className="flex h-screen bg-gray-100">
      <MainSidebar />
      
      {/* 売上報告システムの時だけサブメニューを表示 */}
      {activeModule === 'sales' && <SalesSidebarMenu />}
      
      {/* メインコンテンツは残りのスペースを全て使います */}
      <main className="flex-grow p-6 overflow-auto">
        {children}
      </main>
    </div>
  )
}
