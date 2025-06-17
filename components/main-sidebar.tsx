"use client"

import { signOut, useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { useRouter, usePathname } from "next/navigation"
import { HomeIcon, BarChartIcon, LogOutIcon } from 'lucide-react';

export type ModuleId = "sales" | "web"

const items = [
  { id: "sales" as ModuleId, label: "売上報告", path: "/sales/dashboard", icon: BarChartIcon },
  { id: "web" as ModuleId, label: "WEB販売", path: "/web-sales/dashboard", icon: HomeIcon },
]

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
    // position:fixed を削除し、flexの子要素として振る舞うように変更
    <div className="w-24 bg-gray-900 text-white flex flex-col shadow-lg flex-shrink-0">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-xl font-bold text-center">TSA</h1>
      </div>
      
      <nav className="flex-grow p-2 space-y-2">
        {items.map((item) => (
          <Button
            key={item.id}
            variant="ghost"
            className={`w-full h-auto py-3 flex flex-col items-center justify-center rounded-lg transition-colors duration-200 ${
              activeModule === item.id
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            }`}
            onClick={() => handleNavigation(item.path)}
          >
            <item.icon className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">{item.label}</span>
          </Button>
        ))}
      </nav>

      <div className="p-2 border-t border-gray-800">
        <div className="flex flex-col items-center gap-2 mb-2">
            <img 
              src={session?.user?.image || "https://via.placeholder.com/40"} 
              alt="User" 
              className="w-10 h-10 rounded-full border-2 border-gray-700"
            />
        </div>
        <Button 
          onClick={() => signOut({ callbackUrl: '/' })} 
          variant="ghost"
          className="w-full h-auto py-3 flex flex-col items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800"
        >
            <LogOutIcon className="w-6 h-6 mb-1" />
            <span className="text-xs font-medium">ログアウト</span>
        </Button>
      </div>
    </div>
  )
}
