"use client"

import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

interface Props {
  month: string
}

interface Row {
  product_name: string
  total_count: number
  total_amount: number
}

export default function WebSalesRankingTable({ month }: Props) {
  const [bestRows, setBestRows] = useState<Row[]>([])
  const [worstRows, setWorstRows] = useState<Row[]>([])

  useEffect(() => {
    const fetchData = async () => {
      const start = `${month}-01`
      const next = new Date(start)
      next.setMonth(next.getMonth() + 1)
      const end = next.toISOString().slice(0, 10)

      const { data, error } = await supabase
        .from("web_sales")
        .select(
          "product_name, price, amazon, rakuten, yahoo, mercari, base, qoo10"
        )
        .gte("created_at", start)
        .lt("created_at", end)

      if (error) {
        console.error("fetch_error", error)
        return
      }

      const map = new Map<string, { count: number; amount: number }>()

      ;(data || []).forEach((row: any) => {
        const name = row.product_name || ""
        const price = row.price ?? 0
        const count =
          (row.amazon ?? 0) +
          (row.rakuten ?? 0) +
          (row.yahoo ?? 0) +
          (row.mercari ?? 0) +
          (row.base ?? 0) +
          (row.qoo10 ?? 0)

        if (!map.has(name)) {
          map.set(name, { count: 0, amount: 0 })
        }
        const entry = map.get(name)!
        entry.count += count
        entry.amount += count * price
      })

      const arr: Row[] = Array.from(map.entries()).map(([product_name, v]) => ({
        product_name,
        total_count: v.count,
        total_amount: v.amount,
      }))

      const desc = [...arr].sort((a, b) => b.total_count - a.total_count)
      const asc = [...arr].sort((a, b) => a.total_count - b.total_count)
      setBestRows(desc.slice(0, 10))
      setWorstRows(asc.slice(0, 10))
    }

    fetchData()
  }, [month])

  const f = (n: number) => new Intl.NumberFormat("ja-JP").format(n)

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* ベスト10 */}
      <div>
        <h3 className="font-semibold mb-3 text-green-700">🏆 ベスト10</h3>
        <table className="min-w-full text-xs border">
          <thead className="bg-green-50">
            <tr>
              <th className="border px-1 py-1 w-12">順位</th>
              <th className="border px-2 py-1">商品名</th>
              <th className="border px-1 py-1 w-16">件数</th>
              <th className="border px-1 py-1 w-20">売上金額</th>
            </tr>
          </thead>
          <tbody>
            {bestRows.map((r, i) => (
              <tr key={r.product_name} className="text-center hover:bg-green-50">
                <td className="border px-1 py-1 font-medium">{i + 1}</td>
                <td className="border px-2 py-1 text-left text-xs">{r.product_name}</td>
                <td className="border px-1 py-1 text-xs">{f(r.total_count)}</td>
                <td className="border px-1 py-1 text-xs">¥{f(r.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ワースト10 */}
      <div>
        <h3 className="font-semibold mb-3 text-red-700">📉 ワースト10</h3>
        <table className="min-w-full text-xs border">
          <thead className="bg-red-50">
            <tr>
              <th className="border px-1 py-1 w-12">順位</th>
              <th className="border px-2 py-1">商品名</th>
              <th className="border px-1 py-1 w-16">件数</th>
              <th className="border px-1 py-1 w-20">売上金額</th>
            </tr>
          </thead>
          <tbody>
            {worstRows.map((r, i) => (
              <tr key={r.product_name} className="text-center hover:bg-red-50">
                <td className="border px-1 py-1 font-medium">{i + 1}</td>
                <td className="border px-2 py-1 text-left text-xs">{r.product_name}</td>
                <td className="border px-1 py-1 text-xs">{f(r.total_count)}</td>
                <td className="border px-1 py-1 text-xs">¥{f(r.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
