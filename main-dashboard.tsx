"use client"

import { useState, useEffect } from "react"
import { usePathname } from 'next/navigation'
import MainSidebar from "@/components/main-sidebar"
// import SalesSidebarMenu from "@/components/sidebar" // ← 不要なため削除

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
    <div className="flex h-screen bg-gray-100">
      {/* 広いサイドバー */}
      <MainSidebar />
      
      {/* サブメニューの呼び出しを完全に削除しました */}
      
      {/* メインコンテンツ */}
      <main className="flex-grow p-6 overflow-auto">
        {children}
      </main>
    </div>
  )
}
