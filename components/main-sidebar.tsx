// /components/main-sidebar.tsx ver.3 (ブランド館店舗分析追加版)
"use client"

import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useSession, signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"

export default function MainSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()
  const [activeModule, setActiveModule] = useState<'sales' | 'web' | 'wholesale' | 'brand-store'>('sales')

  useEffect(() => {
    if (pathname.startsWith('/web-sales')) {
      setActiveModule('web')
    } else if (pathname.startsWith('/wholesale')) {
      setActiveModule('wholesale')
    } else if (pathname.startsWith('/brand-store-analysis')) {
      setActiveModule('brand-store')
    } else {
      setActiveModule('sales')
    }
  }, [pathname])

  const handleModuleChange = (module: 'sales' | 'web' | 'wholesale' | 'brand-store') => {
    setActiveModule(module)
    if (module === 'sales') {
      router.push('/sales/dashboard')
    } else if (module === 'web') {
      router.push('/web-sales/dashboard')
    } else if (module === 'wholesale') {
      router.push('/wholesale/dashboard')
    } else if (module === 'brand-store') {
      router.push('/brand-store-analysis')
    }
  }

  return (
    <div className="w-64 bg-slate-800 text-white flex flex-col">
      {/* ヘッダー */}
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold">TSAシステム</h1>
      </div>

      {/* メインナビゲーション */}
      <nav className="flex-1 p-4 space-y-2">
        <Button
          variant={activeModule === 'sales' ? 'secondary' : 'ghost'}
          className="w-full justify-start text-white hover:bg-slate-700"
          onClick={() => handleModuleChange('sales')}
        >
          売上報告システム
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
          className="w-full justify-start text-white hover:bg-slate-700"
          onClick={() => handleModuleChange('brand-store')}
        >
          ブランド館店舗分析
        </Button>
      </nav>

      {/* ユーザー情報とログアウト */}
      {session && (
        <div className="p-4 border-t border-slate-700">
          <div className="text-sm text-slate-300 mb-2">
            {session.user?.name}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-slate-300 hover:bg-slate-700"
            onClick={() => signOut()}
          >
            ログアウト
          </Button>
        </div>
      )}
    </div>
  )
}
