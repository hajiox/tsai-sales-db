"use client"

import { useState, useEffect } from "react"
import { usePathname } from 'next/navigation'
import MainSidebar from "@/components/main-sidebar"

// サイドバーを表示しないルートのリスト
const FULL_SCREEN_ROUTES = [
  '/login',
  '/recipe/database/label-import/mobile',
]

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

  // ログインページやモバイル専用ページではサイドバーなしの全画面表示
  const isFullScreen = FULL_SCREEN_ROUTES.some(route => pathname.startsWith(route))

  if (isFullScreen) {
    return <>{children}</>
  }

  return (
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
