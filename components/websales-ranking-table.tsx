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
  const [rows, setRows] = useState<Row[]>([])

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

      arr.sort((a, b) => b.total_count - a.total_count)
      setRows(arr.slice(0, 10))
    }

    fetchData()
  }, [month])

  const f = (n: number) => new Intl.NumberFormat("ja-JP").format(n)

  return (
    <div>
      <table className="min-w-full text-sm border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1">順位</th>
            <th className="border px-2 py-1">商品名</th>
            <th className="border px-2 py-1">件数</th>
            <th className="border px-2 py-1">売上</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.product_name} className="text-center">
              <td className="border px-2 py-1">{i + 1}位</td>
              <td className="border px-2 py-1 text-left">{r.product_name}</td>
              <td className="border px-2 py-1">{f(r.total_count)}</td>
              <td className="border px-2 py-1">¥{f(r.total_amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

