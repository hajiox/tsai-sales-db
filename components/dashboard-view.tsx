"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart3, TrendingUp, Users, JapaneseYenIcon as Yen } from "lucide-react"
import { supabase } from "../lib/supabase"

export default function DashboardView() {
  const [monthlySales, setMonthlySales] = useState<number | null>(null)
  const [todayRegisterCount, setTodayRegisterCount] = useState<number | null>(
    null
  )

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
        .select(
          "floor_sales, amazon_amount, rakuten_amount, yahoo_amount, mercari_amount, base_amount, qoo10_amount"
        )
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
      const today = new Date()
      const todayStr = today.toISOString().split("T")[0]

      const { data, error } = await supabase
        .from("daily_sales_report")
        .select("register_count")
        .eq("date", todayStr)

      if (error) {
        console.error("Error fetching register count", error)
        return
      }

      const total = (data || []).reduce(
        (sum, row) => sum + (row.register_count || 0),
        0
      )

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
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">ダッシュボード</h2>
        <p className="text-sm text-gray-600">売上データの概要と分析</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">今日の売上</CardTitle>
            <Yen className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥0</div>
            <p className="text-xs text-gray-500 mt-1">データなし</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">月間売上</CardTitle>
            <TrendingUp className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {monthlySales !== null ? formatCurrency(monthlySales) : "¥0"}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {monthlySales !== null ? "今月" : "データなし"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">レジ通過人数</CardTitle>
            <Users className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {todayRegisterCount !== null ? todayRegisterCount : 0}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {todayRegisterCount !== null ? "今日" : "データなし"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">EC売上</CardTitle>
            <BarChart3 className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥0</div>
            <p className="text-xs text-gray-500 mt-1">今日</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">売上推移</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">グラフは今後実装予定</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">ECサイト別売上</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">チャートは今後実装予定</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
