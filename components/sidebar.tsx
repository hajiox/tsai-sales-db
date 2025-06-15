"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { BarChart3, Plus, Edit, Brain, Upload } from "lucide-react"

// --- 変更点： 「売上報告システム」の項目をダッシュボードのみにする ---
const sections = [
  {
    title: "売上報告システム",
    items: [
      { label: "ダッシュボード", href: "/sales/dashboard", icon: BarChart3 },
      // { label: "入力", href: "/sales/input", icon: Plus }, // 削除
      // { label: "修正", href: "/sales/edit", icon: Edit },   // 削除
    ],
  },
  {
    title: "WEB販売管理システム",
    items: [
      { label: "ダッシュボード", href: "/web-sales/dashboard", icon: BarChart3 },
      { label: "入力", href: "/web-sales/input", icon: Upload },
      { label: "修正", href: "/web-sales/edit", icon: Edit },
    ],
  },
] as const

export default function Sidebar() {
  const pathname = usePathname()
  return (
    <div className="w-64 bg-gray-900 text-white h-screen fixed left-0 top-0 flex flex-col">
      <div className="p-6 border-b border-gray-700">
        <h1 className="text-lg font-semibold">TSAシステム</h1>
      </div>
      <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
        {sections.map((section) => (
          <div key={section.title} className="space-y-2">
            <h2 className="px-2 text-sm font-bold text-gray-300">{section.title}</h2>
            {section.items.map((item) => {
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
        ))}
      </nav>
    </div>
  )
}
