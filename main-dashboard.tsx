"use client"

import { useState, useEffect } from "react"
import { usePathname } from 'next/navigation'
import MainSidebar from "@/components/main-sidebar"
import SalesSidebarMenu from "@/components/sidebar"

export default function MainDashboard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [activeModule, setActiveModule] = useState<'sales' | 'web'>('sales')

  useEffect(() => {
    // 現在のURLを見て、どちらのシステムを表示しているか判断します
    if (pathname.startsWith('/web-sales')) {
      setActiveModule('web')
    } else {
      setActiveModule('sales')
    }
  }, [pathname])

  // 「売上報告システム」の時だけサブメニューを表示します
  const showSubMenu = activeModule === 'sales';

  // サブメニューの有無に応じて、メインコンテンツの開始位置を調整します
  // スリムバーのみ: w-24 (96px)
  // スリムバー + サブメニュー: w-64 (256px)
  const mainContentMargin = showSubMenu ? 'ml-64' : 'ml-24';

  return (
    <div className="bg-gray-100">
      {/* スリムになったメインのサイドバーです */}
      <MainSidebar /> 
      
      {/* サブメニューが必要な時だけ、メインサイドバーの右隣に表示します */}
      {showSubMenu && (
        <div className="fixed top-0 left-24 h-full z-10">
           <SalesSidebarMenu />
        </div>
      )}
      
      {/* メインコンテンツです。適切なマージンが設定されます */}
      <main className={`min-h-screen p-6 transition-all duration-200 ${mainContentMargin}`}>
        {children}
      </main>
    </div>
  )
}
