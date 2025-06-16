"use client"

import { signOut, useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { useRouter, usePathname } from "next/navigation"
import React from "react"

export type ModuleId = "sales" | "web"

interface Props {
  children?: React.ReactNode
}

const items = [
  { id: "sales" as ModuleId, label: "売上報告システム", path: "/sales/dashboard" },
  { id: "web" as ModuleId, label: "WEB販売管理システム", path: "/web-sales" },
]

export default function MainSidebar({ children }: Props) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  // 現在のパスから active なシステムを判定
  const getActiveModule = (): ModuleId | null => {
    if (pathname.startsWith('/sales')) return 'sales';
    if (pathname.startsWith('/web-sales')) return 'web';
    return null;
  };

  const activeModule = getActiveModule();

  const handleNavigation = (path: string) => {
    router.push(path);
  };

  return (
    <div className="w-64 bg-gray-800 text-white h-screen fixed left-0 top-0 flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-semibold">TSAシステム</h1>
      </div>
      <div className="p-4 space-y-2 border-b border-gray-700">
        {/* システム切替ボタン */}
        {items.map((item) => (
          <Button
            key={item.id}
            variant={activeModule === item.id ? "secondary" : "ghost"}
            className={`w-full justify-start text-sm h-10 ${
              activeModule === item.id ? "bg-gray-700 text-white" : "text-gray-300 hover:text-white hover:bg-gray-800"
            }`}
            onClick={() => handleNavigation(item.path)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      
      {/* メインナビゲーション - flex-1で残りスペースを占有 */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {children}
      </nav>

      {/* ユーザー情報とログアウト - 最下部に固定 */}
      <div className="mt-auto p-4 border-t border-gray-700">
        <div className="flex items-center gap-3 mb-3">
          {/* Googleアイコン */}
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
            <img 
              src={session?.user?.image || "https://via.placeholder.com/32"} 
              alt="User" 
              className="w-7 h-7 rounded-full"
            />
          </div>
          {/* アカウント名 */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {session?.user?.name || "Guest"}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {session?.user?.email || ""}
            </p>
          </div>
        </div>
        {/* 小さなログアウトボタン */}
        <Button 
          onClick={() => signOut({ callbackUrl: '/' })} 
          variant="outline"
          size="sm"
          className="w-full text-xs h-8 bg-transparent border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
        >
          ログアウト
        </Button>
      </div>
    </div>
  )
}
