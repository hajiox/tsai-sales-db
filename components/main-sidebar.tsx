"use client"

import { signOut, useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { useRouter, usePathname } from "next/navigation"

export type ModuleId = "sales" | "web"

const items = [
  { id: "sales" as ModuleId, label: "売上報告システム", path: "/sales/dashboard" },
  { id: "web" as ModuleId, label: "WEB販売管理システム", path: "/web-sales/dashboard" },
]

// children を受け取らないシンプルなサイドバーに変更
export default function MainSidebar() { 
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();

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
    // position:fixed を削除し、flex-shrink-0 を追加。w-64は維持します。
    <div className="w-64 bg-gray-800 text-white h-screen flex flex-col flex-shrink-0">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-semibold">TSAシステム</h1>
      </div>
      
      {/* システム選択エリアが主要なスペースを占めるようにします */}
      <div className="p-4 space-y-2 flex-grow">
        {items.map((item) => (
          <Button
            key={item.id}
            variant="ghost"
            className={`w-full justify-start text-base p-6 ${ // 文字サイズとパディングを調整
              activeModule === item.id
                ? "bg-gray-700 text-white"
                : "text-gray-300 hover:text-white hover:bg-gray-800"
            }`}
            onClick={() => handleNavigation(item.path)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      
      {/* サブメニューを表示していた <nav> タグは完全に削除しました */}

      {/* ユーザー情報とログアウト */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
            <img 
              src={session?.user?.image || "https://via.placeholder.com/32"} 
              alt="User" 
              className="w-7 h-7 rounded-full"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {session?.user?.name || "Guest"}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {session?.user?.email || ""}
            </p>
          </div>
        </div>
        <Button 
          onClick={() => signOut({ callbackUrl: '/' })} 
          variant="outline"
          className="w-full border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
        >
          ログアウト
        </Button>
      </div>
    </div>
  )
}
