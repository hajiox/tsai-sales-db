"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from "../lib/supabase"

const SITES = [
  { key: "amazon", name: "Amazon" },
  { key: "rakuten", name: "楽天" },
  { key: "yahoo", name: "Yahoo" },
  { key: "mercari", name: "メルカリ" },
  { key: "base", name: "BASE" },
  { key: "qoo10", name: "Qoo10" },
]

type Totals = Record<string, { count: number; amount: number }>

export default function WebSalesSummaryCards({ month }: { month: string }) {
  const [totals, setTotals] = useState<Totals | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      const start = `${month}-01`
      const next = new Date(start)
      next.setMonth(next.getMonth() + 1)
      const end = next.toISOString().slice(0, 10)

      const { data, error } = await supabase
        .from("web_sales")
        .select(
          "created_at, price, amazon, rakuten, yahoo, mercari, base, qoo10"
        )
        .gte("created_at", start)
        .lt("created_at", end)

      if (error) {
        console.error("fetch_error", error)
        return
      }

      const init: Totals = {}
      SITES.forEach((s) => {
        init[s.key] = { count: 0, amount: 0 }
      })

      ;(data || []).forEach((row: any) => {
        SITES.forEach((s) => {
          const qty = row[s.key] ?? 0
          const price = row.price ?? 0
          init[s.key].count += qty
          init[s.key].amount += qty * price
        })
      })

      setTotals(init)
    }

    fetchData()
  }, [month])

  const f = (n: number) => new Intl.NumberFormat("ja-JP").format(n)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {SITES.map((s) => (
        <Card key={s.key}>
          <CardHeader>
            <CardTitle className="text-sm">{s.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-xl font-bold">
              {totals ? f(totals[s.key].count) : "-"} 件
            </div>
            <div className="text-sm text-gray-500">
              ¥{totals ? f(totals[s.key].amount) : "-"}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

