"use client"

import { Button } from "@/components/ui/button"
import { BarChart3, Upload, Trash2, Brain } from "lucide-react"

export type WebView = "dashboard" | "input" | "edit" | "analysis"

interface Props {
  activeView: WebView
  onViewChange: (v: WebView) => void
}

const items = [
  { id: "dashboard" as WebView, label: "ダッシュボード", icon: BarChart3 },
  { id: "input" as WebView, label: "入力", icon: Upload },
  { id: "edit" as WebView, label: "修正", icon: Trash2 },
  { id: "analysis" as WebView, label: "AI分析", icon: Brain },
]

export default function WebSalesSidebar({ activeView, onViewChange }: Props) {
  return (
    <div className="w-64 bg-gray-900 text-white h-full fixed left-64 top-0 flex flex-col">
      <div className="p-6 border-b border-gray-700">
        <h1 className="text-lg font-semibold">WEB販売管理</h1>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {items.map((item) => {
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
      </nav>
    </div>
  )
}
