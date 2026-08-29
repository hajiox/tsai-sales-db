"use client"

import { useState, useEffect, useRef } from "react"
import { usePathname } from 'next/navigation'
import MainSidebar from "@/components/main-sidebar"
import MobileNavigation from "@/components/mobile-navigation"

// PC版の全画面表示を維持するルート。
const FULL_SCREEN_ROUTES = [
  '/login',
  '/mobile',
  '/recipe/database/label-import/mobile',
  '/recipe/photo/mobile',
  '/kpi',
  '/wholesale/sales-input',
  '/wholesale/delivery-notes',
  '/wholesale/inventory',
  '/brand-store-analysis/inventory',
  '/recipe/inventory',
  '/system/label-check/check',
]

// 専用スマホ画面は自身のヘッダー・戻る導線を持つため、共通ナビを重ねない。
const DEDICATED_MOBILE_ROUTES = [
  '/login',
  '/mobile',
  '/recipe/database/label-import/mobile',
  '/recipe/photo/mobile',
  '/recipe/char-siu-production/scan',
  '/system/label-check/check',
]

export default function MainDashboard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [activeModule, setActiveModule] = useState<'sales' | 'web'>('sales')
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (pathname.startsWith('/web-sales')) {
      setActiveModule('web')
    } else {
      setActiveModule('sales')
    }
  }, [pathname])

  // ページ遷移時にmainコンテナのスクロールをトップに戻す
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0
    }
  }, [pathname])

  // ログインページやモバイル専用ページではサイドバーなしの全画面表示
  const isFullScreen = FULL_SCREEN_ROUTES.some(route => pathname.startsWith(route))
  const isDedicatedMobile = DEDICATED_MOBILE_ROUTES.some(route => pathname.startsWith(route))

  if (isDedicatedMobile) {
    return <>{children}</>
  }

  if (isFullScreen) {
    return (
      <div className="min-h-[100dvh] bg-gray-100 lg:contents">
        <MobileNavigation />
        <div className="tsa-mobile-content tsa-mobile-standalone min-h-[100dvh] pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[calc(4rem+env(safe-area-inset-bottom))] lg:contents">
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] min-w-0 bg-gray-100 lg:flex lg:h-screen lg:min-h-0 lg:overflow-hidden print:h-auto print:block print:overflow-visible">

      <MobileNavigation />

      <div className="hidden lg:h-full lg:min-h-0 lg:shrink-0 lg:block print:hidden">
        <MainSidebar />
      </div>

      <main
        ref={mainRef}
        className="tsa-mobile-content min-w-0 w-full overflow-x-auto px-3 pt-[calc(4.25rem+env(safe-area-inset-top))] pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:px-4 lg:h-full lg:min-h-0 lg:flex-grow lg:overflow-auto lg:p-6 print:h-auto print:p-0 print:overflow-visible"
      >
        {children}
      </main>

    </div>
  )
}

