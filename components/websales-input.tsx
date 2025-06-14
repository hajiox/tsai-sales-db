"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"

export default function WebSalesInput({ month }: { month: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<{ product: string; qty: number; site: string }[]>([])

  const handleAnalyze = () => {
    if (file) {
      setRows([{ product: "サンプル", qty: 10, site: "Amazon" }])
    }
  }

  return (
    <div className="space-y-4">
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <Button onClick={handleAnalyze}>AIで解析してDB登録</Button>
      {rows.length > 0 && (
        <table className="min-w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-2 py-1 border">商品</th>
              <th className="px-2 py-1 border">個数</th>
              <th className="px-2 py-1 border">サイト</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="text-center">
                <td className="border px-2 py-1">{r.product}</td>
                <td className="border px-2 py-1">{r.qty}</td>
                <td className="border px-2 py-1">{r.site}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
