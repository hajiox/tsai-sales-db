"use client"

import { useState, useEffect } from "react"
import { usePathname } from 'next/navigation'
import MainSidebar from "@/components/main-sidebar"

export default function MainDashboard({ children }: { children: React.ReactNode }) {
  // この state は現在レイアウトには直接影響しませんが、
  // サイドバー内のボタンのハイライト表示などに使われるため残します。
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
    // サイドバーとメインコンテンツのみをシンプルに横に並べます。
    <div className="flex h-screen bg-gray-100 print:h-auto print:block">

      <div className="print:hidden">
        <MainSidebar />
      </div>

      <main className="flex-grow p-6 overflow-auto print:p-0 print:overflow-visible">
        {children}
      </main>

    </div>
  )
}
