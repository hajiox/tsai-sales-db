"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { BarChart3 } from "lucide-react"

const salesMenuItems = [
  { label: "ダッシュボード", href: "/sales/dashboard", icon: BarChart3 },
] as const

export default function SalesSidebarMenu() {
  const pathname = usePathname()
  
  return (
    // 幅(w-40)、背景色、パディングなどを追加し、レイアウトを確定させます。
    <aside className="w-40 flex-shrink-0 bg-gray-800 p-4 text-white">
      <div className="space-y-2">
        <h2 className="mb-2 px-2 text-lg font-semibold tracking-tight text-gray-300">
          売上報告
        </h2>
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
                    : "text-gray-400 hover:text-white hover:bg-gray-700"
                }`}
              >
                <Icon className="mr-3 h-4 w-4" />
                {item.label}
              </Button>
            </Link>
          )
        })}
      </div>
    </aside>
  )
}
