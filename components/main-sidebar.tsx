"use client"

import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"

export type ModuleId = "sales" | "web"

interface Props {
  active: ModuleId
  onChange: (m: ModuleId) => void
}

const items = [
  { id: "sales" as ModuleId, label: "売上報告システム" },
  { id: "web" as ModuleId, label: "WEB販売管理システム" },
]

export default function MainSidebar({ active, onChange }: Props) {
  return (
    <div className="w-64 bg-gray-800 text-white h-screen fixed left-0 top-0 flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-lg font-semibold">TSAシステム</h1>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {items.map((item) => (
          <Button
            key={item.id}
            variant={active === item.id ? "secondary" : "ghost"}
            className={`w-full justify-start text-sm h-10 ${
              active === item.id ? "bg-gray-700 text-white" : "text-gray-300 hover:text-white hover:bg-gray-800"
            }`}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-700">
        <Button onClick={() => signOut({ callbackUrl: '/' })} className="w-full justify-center text-sm">
          ログアウト
        </Button>
      </div>
    </div>
  )
}
