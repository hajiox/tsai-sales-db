"use client"

import { Button } from "@/components/ui/button"
import { BarChart3, Edit, Plus } from "lucide-react"

type NavigationItem = "dashboard" | "input" | "edit"

interface SidebarProps {
  activeView: NavigationItem
  onViewChange: (view: NavigationItem) => void
}

export default function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const navigationItems = [
    {
      id: "dashboard" as NavigationItem,
      label: "ダッシュボード",
      icon: BarChart3,
    },
    {
      id: "input" as NavigationItem,
      label: "売上入力",
      icon: Plus,
    },
    {
      id: "edit" as NavigationItem,
      label: "売上修正",
      icon: Edit,
    },
  ]

  return (
    <div className="w-64 bg-gray-900 text-white h-screen fixed left-0 top-0 flex flex-col">
      <div className="p-6 border-b border-gray-700">
        <h1 className="text-lg font-semibold">売上報告システム</h1>
      </div>

      <nav className="flex-1 p-4">
        <div className="space-y-2">
          {navigationItems.map((item) => {
            const Icon = item.icon
            return (
              <Button
                key={item.id}
                variant={activeView === item.id ? "secondary" : "ghost"}
                className={`w-full justify-start text-sm h-10 ${
                  activeView === item.id ? "bg-gray-700 text-white" : "text-gray-300 hover:text-white hover:bg-gray-800"
                }`}
                onClick={() => onViewChange(item.id)}
              >
                <Icon className="mr-3 h-4 w-4" />
                {item.label}
              </Button>
            )
          })}
        </div>
      </nav>

      <div className="p-4 border-t border-gray-700">
        <p className="text-xs text-gray-400">会津ブランド館</p>
      </div>
    </div>
  )
}
