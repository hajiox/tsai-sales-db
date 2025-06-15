"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { BarChart3 } from "lucide-react"

// このコンポーネント専用のメニュー項目
const salesMenuItems = [
  { label: "ダッシュボード", href: "/sales/dashboard", icon: BarChart3 },
] as const

export default function SalesSidebarMenu() {
  const pathname = usePathname()
  
  // 親のdivコンテナは削除し、メニュー項目のリストだけを返す
  return (
    <div className="space-y-2">
      <h2 className="px-2 text-sm font-bold text-gray-300">売上報告システム</h2>
      {salesMenuItems.map((item) => {
        const active = pathname === item.href
        const Icon = item.icon
        return (
          <Link key={item.href} href={item.href} className="block">
            <Button
              variant={active ? "secondary" : "ghost"}
              className={`w-full justify-start text-sm h-10 ${
                active
                  ? "bg-gray-700 text-white"
                  : "text-gray-300 hover:text-white hover:bg-gray-800"
              }`}
            >
              <Icon className="mr-3 h-4 w-4" />
              {item.label}
            </Button>
          </Link>
        )
      })}
    </div>
  )
}
