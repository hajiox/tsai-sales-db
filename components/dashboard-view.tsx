"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart3, TrendingUp, Users, JapaneseYenIcon as Yen } from "lucide-react"
import { supabase } from "../lib/supabase"

export default function DashboardView() {
  const [monthlySales, setMonthlySales] = useState<number | null>(null)
  const [todayRegisterCount, setTodayRegisterCount] = useState<number | null>(null)

  useEffect(() => {
    const fetchMonthlySales = async () => {
      const start = new Date()
      start.setDate(1)
      const end = new Date(start)
      end.setMonth(end.getMonth() + 1)

      const startDate = start.toISOString().split("T")[0]
      const endDate = end.toISOString().split("T")[0]

      const { data, error } = await supabase
        .from("daily_sales_report")
        .select("floor_sales, amazon_amount, rakuten_amount, yahoo_amount, mercari_amount, base_amount, qoo10_amount")
        .gte("date", startDate)
        .lt("date", endDate)

      if (error) {
        console.error("Error fetching monthly sales", error)
        return
      }

      const total = (data || []).reduce((sum, row) => {
        const ecAmount =
          row.amazon_amount +
          row.rakuten_amount +
          row.yahoo_amount +
          row.mercari_amount +
          row.base_amount +
          row.qoo10_amount
        return sum + row.floor_sales + ecAmount
      }, 0)

      setMonthlySales(total)
    }

    fetchMonthlySales()
  }, [])

  useEffect(() => {
    const fetchRegisterCount = async () => {
      const today = new Date().toISOString().split("T")[0]

      const { data, error } = await supabase
        .from("daily_sales_report")
        .select("register_count")
        .eq("date", today)

      if (error) {
        console.error("Error fetching register count", error)
        return
      }

      const total = (data || []).reduce((sum, row) => sum + (row.register_count || 0), 0)
      setTodayRegisterCount(total)
    }

    fetchRegisterCount()
  }, [])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
      currencyDisplay: "symbol",
    }).format(amount)

  return (
    <div className="text-sm text-gray-700">
      {/* この中にUI本体を戻せばOK */}
      ダッシュボードロジック統合済（月間売上・レジ通過人数）
    </div>
  )
}
