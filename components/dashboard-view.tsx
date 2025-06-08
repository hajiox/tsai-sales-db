"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart3, TrendingUp, Users, JapaneseYenIcon as Yen } from "lucide-react"
import { supabase } from "../lib/supabase"

export default function DashboardView() {
  const [monthlySales, setMonthlySales] = useState<number | null>(null)
  const [todayRegisterCount, setTodayRegisterCount] = useState<number | null>(
    null,
  )
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  )
  const [ecTotalAmount, setEcTotalAmount] = useState<number | null>(null)

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

  useEffect(() => {
    const fetchEcTotal = async () => {
      const { data, error } = await supabase
        .from("daily_sales_report")
        .select(
          "amazon_amount, rakuten_amount, yahoo_amount, mercari_amount, base_amount, qoo10_amount",
        )
        .eq("date", selectedDate)

      if (error) {
        console.error("Error fetching ec total amount", error)
        return
      }

      const total = (data || []).reduce(
        (sum, row) =>
          sum +
          (row.amazon_amount || 0) +
          (row.rakuten_amount || 0) +
          (row.yahoo_amount || 0) +
          (row.mercari_amount || 0) +
          (row.base_amount || 0) +
          (row.qoo10_amount || 0),
        0,
      )

      setEcTotalAmount(total)
    }

    fetchEcTotal()
  }, [selectedDate])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
      currencyDisplay: "symbol",
    }).format(amount)

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">ダッシュボード</h2>
          <p className="text-sm text-gray-600">売上データの概要と分析</p>
        </div>
        <div className="text-right">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border rounded text-xs p-1 mb-1"
          />
          {ecTotalAmount !== null && (
            <div className="text-sm text-right font-semibold text-gray-700 mb-2">
              今日のEC売上合計：{formatCurrency(ecTotalAmount)}
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
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
            <div className="text-2xl font-bold">
              {ecTotalAmount !== null ? formatCurrency(ecTotalAmount) : "¥0"}
            </div>
            <p className="text-xs text-gray-500 mt-1">{selectedDate}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
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

      {/* AI Summary Boxes */}
      <div className="space-y-4 mt-10">
        <h3 className="text-lg font-medium text-gray-900">AI分析レポート</h3>

        <Card className="bg-gray-50">
          <CardContent className="p-4">
            <h4 className="text-sm font-medium mb-2">
              【AI】2025年6月　前月・前々月との比較分岐と考察（月末に自動更新）
            </h4>
            <p className="text-xs text-gray-600 leading-relaxed">
              2025年6月の売上は前月比で5%増加。楽天とAmazonが好調で、夏物需要が要因と考えられる。
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardContent className="p-4">
            <h4 className="text-sm font-medium mb-2">
              【AI】2025年6月　前年同月と比較分析と考察（月末に自動更新）
            </h4>
            <p className="text-xs text-gray-600 leading-relaxed">
              総売上は前年比12%増。特にYahoo!とQoo10が好調。海外需要増も影響。
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardContent className="p-4">
            <h4 className="text-sm font-medium mb-2">
              【AI】2025年6月　特に動きのあった日ベスト３のリストアップ（月末に自動更新）
            </h4>
            <p className="text-xs text-gray-600 leading-relaxed">
              1位: 6月15日（土） - ¥358,500（週末セール）<br />
              2位: 6月28日（金） - ¥325,200（イベント）<br />
              3位: 6月5日（水） - ¥287,600（新商品）
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
