"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart3, TrendingUp, Users, JapaneseYenIcon as Yen } from "lucide-react"
import { supabase } from "../lib/supabase"

export default function DashboardView() {
  const [monthlySales, setMonthlySales] = useState<number>(0)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  useEffect(() => {
    async function fetchMonthlySales() {
      try {
        const { data, error } = await supabase
          .from("daily_sales_report")
          .select("floor_sales")
          .gte("date", "2025-06-01")
          .lte("date", "2025-06-30")

        if (error) {
          throw error
        }

        // Sum the floor_sales values
        const totalSales = data?.reduce((sum, record) => sum + (record.floor_sales || 0), 0) || 0
        setMonthlySales(totalSales)
      } catch (error) {
        console.error("Error fetching monthly sales:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchMonthlySales()
  }, [])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("ja-JP").format(amount)
  }

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
            <div className="text-2xl font-bold">{isLoading ? "読込中..." : `¥${formatCurrency(monthlySales)}`}</div>
            <p className="text-xs text-gray-500 mt-1">2025年6月</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">レジ通過人数</CardTitle>
            <Users className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-gray-500 mt-1">今日</p>
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

      {/* AI Summary Boxes */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">AI分析レポート</h3>

        <Card className="bg-gray-50">
          <CardContent className="p-4">
            <h4 className="text-sm font-medium mb-2">
              【AI】2025年6月　前月・前々月との比較分岐と考察（月末に自動更新）
            </h4>
            <p className="text-xs text-gray-600 leading-relaxed">
              2025年6月の売上は前月比で5%増加しています。特に楽天とAmazonでの売上が好調で、前々月と比較すると15%の成長が見られます。
              季節商品の販売開始と夏物需要の高まりが主な要因と考えられます。フロア売上も安定しており、客単価が前月より8%上昇しています。
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardContent className="p-4">
            <h4 className="text-sm font-medium mb-2">【AI】2025年6月　前年同月と比較分析と考察（月末に自動更新）</h4>
            <p className="text-xs text-gray-600 leading-relaxed">
              前年同月と比較すると、総売上は12%増加しています。ECサイト売上が大きく貢献しており、特にYahoo!ショッピングでの売上が前年比30%増となっています。
              新規出店したQoo10も順調に成長しており、海外からの注文も増加傾向にあります。フロア売上は前年比で微増（3%）となっています。
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gray-50">
          <CardContent className="p-4">
            <h4 className="text-sm font-medium mb-2">
              【AI】2025年6月　特に動きのあった日ベスト３のリストアップ（月末に自動更新）
            </h4>
            <p className="text-xs text-gray-600 leading-relaxed">
              1位: 6月15日（土）- 売上: ¥358,500（週末セール実施日）
              <br />
              2位: 6月28日（金）- 売上: ¥325,200（月末特別イベント開催日）
              <br />
              3位: 6月5日（水）- 売上: ¥287,600（新商品発売日）
              <br />
              <br />
              特に6月15日のセールは事前のSNS告知が効果的で、来店客数が平常の2倍となりました。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
