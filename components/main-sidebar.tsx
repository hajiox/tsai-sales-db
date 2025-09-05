// /components/main-sidebar.tsx
"use client"

import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"

export default function MainSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  // ▼ 'kpi' を追加
  const [activeModule, setActiveModule] = useState<
    'sales' | 'kpi' | 'web' | 'wholesale' | 'brand-store' | 'food-store' | 'finance'
  >('sales')

  useEffect(() => {
    if (pathname.startsWith('/kpi')) {
      setActiveModule('kpi')
    } else if (pathname.startsWith('/web-sales')) {
      setActiveModule('web')
    } else if (pathname.startsWith('/wholesale')) {
      setActiveModule('wholesale')
    } else if (pathname.startsWith('/brand-store-analysis')) {
      setActiveModule('brand-store')
    } else if (pathname.startsWith('/food-store-analysis')) {
      setActiveModule('food-store')
    } else if (pathname.startsWith('/finance')) {
      setActiveModule('finance')
    } else {
      setActiveModule('sales')
    }
  }, [pathname])

  // ▼ 'kpi' ルーティングを追加
  const handleModuleChange = (
    module: 'sales' | 'kpi' | 'web' | 'wholesale' | 'brand-store' | 'food-store' | 'finance'
  ) => {
    setActiveModule(module)
    if (module === 'sales') {
      router.push('/sales/dashboard')
    } else if (module === 'kpi') {
      router.push('/kpi')              // ← 追加
    } else if (module === 'web') {
      router.push('/web-sales/dashboard')
    } else if (module === 'wholesale') {
      router.push('/wholesale/dashboard')
    } else if (module === 'brand-store') {
      router.push('/brand-store-analysis')
    } else if (module === 'food-store') {
      router.push('/food-store-analysis')
    } else if (module === 'finance') {
      router.push('/finance/general-ledger')
    }
  }

  return (
    <div className="w-64 bg-slate-800 text-white flex flex-col">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold">TSAシステム</h1>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        <Button
          variant={activeModule === 'sales' ? 'secondary' : 'ghost'}
          className="w-full justify-start text-white hover:bg-slate-700"
          onClick={() => handleModuleChange('sales')}
        >
          売上報告システム
        </Button>

        {/* ▼ 追加：売上KPIダッシュボード（/kpi） */}
        <Button
          variant={activeModule === 'kpi' ? 'secondary' : 'ghost'}
          className="w-full justify-start text-white hover:bg-slate-700"
          onClick={() => handleModuleChange('kpi')}
        >
          売上KPIダッシュボード
        </Button>

        <Button
          variant={activeModule === 'web' ? 'secondary' : 'ghost'}
          className="w-full justify-start text-white hover:bg-slate-700"
          onClick={() => handleModuleChange('web')}
        >
          WEB販売管理システム
        </Button>
        <Button
          variant={activeModule === 'wholesale' ? 'secondary' : 'ghost'}
          className="w-full justify-start text-white hover:bg-slate-700"
          onClick={() => handleModuleChange('wholesale')}
        >
          卸販売管理システム
        </Button>
        <Button
          variant={activeModule === 'brand-store' ? 'secondary' : 'ghost'}
          cl
