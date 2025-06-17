"use client"

import { useState, useEffect } from "react"
import { usePathname } from 'next/navigation'
import MainSidebar from "@/components/main-sidebar"

export default function MainDashboard({ children }: { children: React.ReactNode }) {
  // このファイル内での activeModule の役割はサイドバーへのprops渡しでしたが、
  // サイドバーが自律的にアクティブ状態を判断するようになったため、
  // この state は現在使われていません。しかし、将来的な利用のため残しておきます。
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
    // これが最終的なレイアウト構成です。
    // サイドバーとメインコンテンツのみをシンプルに配置します。
    <div className="flex h-screen bg-gray-100">
      
      <MainSidebar />
      
      <main className="flex-grow p-6 overflow-auto">
        {children}
      </main>
      
    </div>
  )
}
