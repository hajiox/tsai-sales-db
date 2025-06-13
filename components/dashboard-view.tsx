"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart as ReBarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { BarChart3, TrendingUp, Users, JapaneseYenIcon as Yen, Loader2 } from "lucide-react"
import { supabase } from "../lib/supabase"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"

export default function DashboardView() {
  const [monthlySales, setMonthlySales] = useState<number | null>(null)
  const [monthlyFloorSales, setMonthlyFloorSales] = useState<number | null>(null)
  const [monthlyEcTotal, setMonthlyEcTotal] = useState<number | null>(null)
  const [monthlyRegisterCount, setMonthlyRegisterCount] = useState<number | null>(null)
  const [registerCount, setRegisterCount] = useState<number | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [ecTotalAmount, setEcTotalAmount] = useState<number | null>(null)
  const [floorSales, setFloorSales] = useState<number | null>(null)
  const [floorSalesData, setFloorSalesData] = useState<
    {
      date: string
      floor_sales: number
    }[]
  >([])
  const [ecSalesData, setEcSalesData] = useState<
    {
      date: string
      ec_sales: number
    }[]
  >([])
  const [floorSalesYearData, setFloorSalesYearData] = useState<
    {
      month: string
      floor_sales: number
    }[]
  >([])
  const [ecSalesYearData, setEcSalesYearData] = useState<
    {
      month: string
      ec_sales: number
    }[]
  >([])

  const [aiReport, setAiReport] = useState<{
    summary: string
    compare_recent: string
    compare_last_year: string
    top3: string
  } | null>(null)
  const [aiLoading, setAiLoading] = useState<boolean>(true)
  const [aiError, setAiError] = useState<boolean>(false)
  const [compareRecent, setCompareRecent] = useState<string>("")
  const [aiReportLoading, setAiReportLoading] = useState<boolean>(false)
  const [latestAiReport, setLatestAiReport] = useState<string>("")

  useEffect(() => {
    const fetchMonthlyData = async () => {
      const start = new Date(selectedDate)
      start.setDate(1)

      const startDate = start.toISOString().split("T")[0]

      const { data, error } = await supabase
        .from("daily_sales_report")
        .select(
          "date, floor_sales, register_count, amazon_amount, rakuten_amount, yahoo_amount, mercari_amount, base_amount, qoo10_amount",
        )
        .gte("date", startDate)
        .lte("date", selectedDate.toISOString().split("T")[0])
        .order("date", { ascending: true })

      if (error) {
        console.error("Error fetching monthly data", error)
        return
      }

      const floor = (data || []).reduce((sum, row) => sum + (row.floor_sales || 0), 0)
      const register = (data || []).reduce((sum, row) => sum + (row.register_count || 0), 0)
      const ec = (data || []).reduce(
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

      setMonthlyFloorSales(floor)
      setMonthlyRegisterCount(register)
      setMonthlyEcTotal(ec)
      setMonthlySales(floor + ec)
      setFloorSalesData(
        (data || []).map((row) => ({
          date: new Date(row.date).toLocaleDateString("ja-JP", {
            month: "numeric",
            day: "numeric",
          }),
          floor_sales: row.floor_sales || 0,
        })),
      )
      setEcSalesData(
        (data || []).map((row) => ({
          date: new Date(row.date).toLocaleDateString("ja-JP", {
            month: "numeric",
            day: "numeric",
          }),
          ec_sales:
            (row.amazon_amount || 0) +
            (row.rakuten_amount || 0) +
            (row.yahoo_amount || 0) +
            (row.mercari_amount || 0) +
            (row.base_amount || 0) +
            (row.qoo10_amount || 0),
        })),
      )
    }

    fetchMonthlyData()
  }, [selectedDate])

  useEffect(() => {
    const fetchFloorAndRegister = async () => {
      const { data, error } = await supabase
        .from("daily_sales_report")
        .select("floor_sales, register_count")
        .eq("date", selectedDate.toISOString().split("T")[0])

      if (error) {
        console.error("Error fetching floor sales/register count", error)
        return
      }

      const totalFloor = (data || []).reduce((sum, row) => sum + (row.floor_sales || 0), 0)
      const totalRegister = (data || []).reduce((sum, row) => sum + (row.register_count || 0), 0)
      setFloorSales(totalFloor)
      setRegisterCount(totalRegister)
    }

    fetchFloorAndRegister()
  }, [selectedDate])

  useEffect(() => {
    const fetchEcTotal = async () => {
      const { data, error } = await supabase
        .from("daily_sales_report")
        .select("amazon_amount, rakuten_amount, yahoo_amount, mercari_amount, base_amount, qoo10_amount")
        .eq("date", selectedDate.toISOString().split("T")[0])

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

  useEffect(() => {
    const fetchYearlyData = async () => {
      const end = new Date(selectedDate)
      const start = new Date(end)
      start.setDate(1)
      start.setMonth(start.getMonth() - 11)

      const startDate = start.toISOString().split("T")[0]
      const endDate = end.toISOString().split("T")[0]

      const { data, error } = await supabase
        .from("daily_sales_report")
        .select(
          "date, floor_sales, amazon_amount, rakuten_amount, yahoo_amount, mercari_amount, base_amount, qoo10_amount",
        )
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true })

      if (error) {
        console.error("Error fetching yearly data", error)
        return
      }

      const floorMap = new Map<string, number>()
      const ecMap = new Map<string, number>()

      for (let i = 0; i < 12; i++) {
        const d = new Date(start)
        d.setMonth(start.getMonth() + i)
        const key = new Date(d).toISOString().slice(0, 7).replace("-", "/")
        floorMap.set(key, 0)
        ecMap.set(key, 0)
      }
      ;(data || []).forEach((row) => {
        const d = new Date(row.date)
        const key = new Date(d).toISOString().slice(0, 7).replace("-", "/")
        if (floorMap.has(key)) {
          floorMap.set(key, (floorMap.get(key) || 0) + (row.floor_sales || 0))
          ecMap.set(
            key,
            (ecMap.get(key) || 0) +
              (row.amazon_amount || 0) +
              (row.rakuten_amount || 0) +
              (row.yahoo_amount || 0) +
              (row.mercari_amount || 0) +
              (row.base_amount || 0) +
              (row.qoo10_amount || 0),
          )
        }
      })

      setFloorSalesYearData(
        Array.from(floorMap.keys()).map((key) => ({
          month: key,
          floor_sales: floorMap.get(key) || 0,
        })),
      )
      setEcSalesYearData(
        Array.from(ecMap.keys()).map((key) => ({
          month: key,
          ec_sales: ecMap.get(key) || 0,
        })),
      )
    }

    fetchYearlyData()
  }, [selectedDate])

  useEffect(() => {
    const fetchLatestAiReport = async () => {
      try {
        setAiLoading(true)
        const { data, error } = await supabase
          .from("ai_reports")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1)

        if (error) throw error

        if (data && data.length > 0) {
          setLatestAiReport(data[0].content || "")
        }
      } catch (e) {
        console.error("Error fetching latest AI report:", e)
        setAiError(true)
      } finally {
        setAiLoading(false)
      }
    }

    fetchLatestAiReport()
  }, [])

  useEffect(() => {
    const fetchCompare = async () => {
      try {
        const res = await fetch(`/api/compare?date=${selectedDate.toISOString().split("T")[0]}`)
        if (!res.ok) throw new Error("fetch error")
        const text = await res.text()
        setCompareRecent(text)
      } catch (e) {
        console.error(e)
      }
    }

    fetchCompare()
  }, [selectedDate])

  const handleGenerate = async () => {
    const res = await fetch(`/api/report?date=${selectedDate.toISOString().slice(0, 10)}`)
    const txt = await res.text()
    await navigator.clipboard.writeText(txt)
    alert("売上報告をコピーしました")
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: "JPY",
      currencyDisplay: "symbol",
    }).format(amount)

  const handleRunAiAnalysis = async () => {
    try {
      setAiReportLoading(true)

      // Send POST request to /api/analyze
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "summary", payload: null }),
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()

      if (!data.ok) {
        throw new Error(data.error || "Unknown error")
      }

      // Update the UI with the result
      setLatestAiReport(data.result)

      // Insert the result into ai_reports table
      const { error: insertError } = await supabase.from("ai_reports").insert([{ content: data.result }])

      if (insertError) {
        console.error("Error inserting AI report:", insertError)
      }
    } catch (err: any) {
      console.error("AI analysis error:", err)
      toast({
        variant: "destructive",
        title: "分析エラー",
        description: err.message || String(err),
      })
    } finally {
      setAiReportLoading(false)
    }
  }

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
            value={selectedDate.toISOString().slice(0, 10)}
            onChange={(e) => setSelectedDate(new Date(e.target.value))}
            className="border rounded text-xs p-1 mb-1 mr-2"
          />
          <Button onClick={handleGenerate} className="mb-1 text-xs">
            売上報告を生成
          </Button>
          {ecTotalAmount !== null && (
            <div className="text-sm text-right font-semibold text-gray-700 mb-2">
              今日のEC売上合計：{formatCurrency(ecTotalAmount)}
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="space-y-4 mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">フロア売上</CardTitle>
              <Yen className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(floorSales || 0)}</div>
              <p className="text-xs text-gray-500 mt-1">{selectedDate.toISOString().slice(0, 10)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">レジ通過人数</CardTitle>
              <Users className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{registerCount ?? 0}</div>
              <p className="text-xs text-gray-500 mt-1">{selectedDate.toISOString().slice(0, 10)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">EC売上</CardTitle>
              <BarChart3 className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{ecTotalAmount !== null ? formatCurrency(ecTotalAmount) : "¥0"}</div>
              <p className="text-xs text-gray-500 mt-1">{selectedDate.toISOString().slice(0, 10)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">売上日計</CardTitle>
              <TrendingUp className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency((floorSales || 0) + (ecTotalAmount || 0))}</div>
              <p className="text-xs text-gray-500 mt-1">{selectedDate.toISOString().slice(0, 10)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">フロア累計</CardTitle>
              <Yen className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {monthlyFloorSales !== null ? formatCurrency(monthlyFloorSales) : "¥0"}
              </div>
              <p className="text-xs text-gray-500 mt-1">1日〜{selectedDate.toISOString().slice(0, 10)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">EC累計</CardTitle>
              <BarChart3 className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {monthlyEcTotal !== null ? formatCurrency(monthlyEcTotal) : "¥0"}
              </div>
              <p className="text-xs text-gray-500 mt-1">1日〜{selectedDate.toISOString().slice(0, 10)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">レジ累計</CardTitle>
              <Users className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{monthlyRegisterCount ?? 0}</div>
              <p className="text-xs text-gray-500 mt-1">1日〜{selectedDate.toISOString().slice(0, 10)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">売上総計</CardTitle>
              <TrendingUp className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{monthlySales !== null ? formatCurrency(monthlySales) : "¥0"}</div>
              <p className="text-xs text-gray-500 mt-1">1日〜{selectedDate.toISOString().slice(0, 10)}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">フロア売上（月間）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ReBarChart data={floorSalesData} margin={{ left: 10, right: 10 }}>
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="floor_sales" fill="#3b82f6" />
                </ReBarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">EC売上（月間）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ReBarChart data={ecSalesData} margin={{ left: 10, right: 10 }}>
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="ec_sales" fill="#10b981" />
                </ReBarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">フロア売上（年間）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ReBarChart data={floorSalesYearData} margin={{ left: 10, right: 10 }}>
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="floor_sales" fill="#3b82f6" />
                </ReBarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">EC売上（年間）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ReBarChart data={ecSalesYearData} margin={{ left: 10, right: 10 }}>
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="ec_sales" fill="#10b981" />
                </ReBarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Summary Block */}
      <div className="space-y-4 mt-10">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium text-gray-900">AI分析レポート</h3>
          <Button onClick={handleRunAiAnalysis} disabled={aiReportLoading}>
            {aiReportLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                分析中...
              </>
            ) : (
              "AI分析を実行"
            )}
          </Button>
        </div>

        <Card className="bg-gray-50 overflow-visible">
          <CardContent className="p-4 text-sm text-gray-600 whitespace-pre-wrap overflow-visible">
            {aiLoading && <p>読み込み中...</p>}
            {aiError && !aiLoading && <p>取得に失敗しました</p>}
            {!aiLoading && !aiError && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-lg">分析結果</h4>
                  <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed max-w-full overflow-visible">
                    {latestAiReport?.trim()
                      ? latestAiReport
                      : '分析結果がありません。「AI分析を実行」ボタンを押して分析を開始してください。'}
                  </pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
