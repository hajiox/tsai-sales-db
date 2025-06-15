"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, CheckCircle } from "lucide-react"
import { supabase, type DailySalesReport } from "./lib/supabase"
import { formatDateJST } from "@/lib/utils"

const salesChannels = [
  { key: "amazon", name: "Amazon" },
  { key: "rakuten", name: "楽天" },
  { key: "yahoo", name: "Yahoo!" },
  { key: "mercari", name: "メルカリ" },
  { key: "base", name: "BASE" },
  { key: "qoo10", name: "Qoo10" },
]

export default function SalesReportForm() {
  const [date, setDate] = useState<Date>(new Date())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [reportData, setReportData] = useState<DailySalesReport | null>(null)
  const [totalSales, setTotalSales] = useState({
    floor_total: 0,
    amazon_total: 0,
    rakuten_total: 0,
    yahoo_total: 0,
    mercari_total: 0,
    base_total: 0,
    qoo10_total: 0,
    web_total: 0,
    grand_total: 0,
  })

  const [formData, setFormData] = useState({
    floor_sales: "",
    floor_total: "",
    cash_income: "",
    register_count: "",
    remarks: "",
    amazon_count: "",
    amazon_amount: "",
    rakuten_count: "",
    rakuten_amount: "",
    yahoo_count: "",
    yahoo_amount: "",
    mercari_count: "",
    mercari_amount: "",
    base_count: "",
    base_amount: "",
    qoo10_count: "",
    qoo10_amount: "",
  })

  // 月次累計データを取得する関数
  const fetchMonthlySummary = async () => {
    const currentDate = new Date(date)
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth() + 1
    const startOfMonth = new Date(year, month - 1, 1)
    const endOfMonth = new Date(year, month, 0)
    
    const startDate = formatDate(startOfMonth)
    const endDate = formatDate(endOfMonth)
    
    try {
      // 当月のデータを取得
      const { data, error } = await supabase
        .from("daily_sales_report")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate)
        
      if (error) throw error
      
      if (data) {
        // 各チャネルの累計を計算
        const amazon_total = data.reduce((sum, record) => sum + (record.amazon_amount || 0), 0)
        const rakuten_total = data.reduce((sum, record) => sum + (record.rakuten_amount || 0), 0)
        const yahoo_total = data.reduce((sum, record) => sum + (record.yahoo_amount || 0), 0)
        const mercari_total = data.reduce((sum, record) => sum + (record.mercari_amount || 0), 0)
        const base_total = data.reduce((sum, record) => sum + (record.base_amount || 0), 0)
        const qoo10_total = data.reduce((sum, record) => sum + (record.qoo10_amount || 0), 0)
        
        const web_total = amazon_total + rakuten_total + yahoo_total + mercari_total + base_total + qoo10_total
        const floor_total = data.reduce((sum, record) => sum + (record.floor_sales || 0), 0)
        const grand_total = floor_total + web_total
        
        setTotalSales({
          floor_total,
          amazon_total,
          rakuten_total,
          yahoo_total,
          mercari_total,
          base_total,
          qoo10_total,
          web_total,
          grand_total,
        })
        
        // フロア累計をフォームにセット
        setFormData(prev => ({
          ...prev,
          floor_total: floor_total.toString()
        }))
      }
    } catch (error) {
      console.error("月次データの取得に失敗しました:", error)
    }
  }
  
  // 日付が変更されたときに月次データを再取得
  useEffect(() => {
    fetchMonthlySummary()
  }, [date])

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const formatDate = (date: Date) => {
    return formatDateJST(date)
  }

  const formatDateJapanese = (date: Date) => {
    return date
      .toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
      .replace(/\//g, "-")
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("ja-JP").format(amount) + "円"
  }

  const generateReport = (data: DailySalesReport) => {
    const totalEcCount =
      data.amazon_count +
      data.rakuten_count +
      data.yahoo_count +
      data.mercari_count +
      data.base_count +
      data.qoo10_count
    const totalEcAmount =
      data.amazon_amount +
      data.rakuten_amount +
      data.yahoo_amount +
      data.mercari_amount +
      data.base_amount +
      data.qoo10_amount

    return `【会津ブランド館売上報告】
${data.date}

フロア日計 / ${formatCurrency(data.floor_sales)}
フロア累計 / ${formatCurrency(data.floor_total)}
入　金 / ${formatCurrency(data.cash_income)}
レジ通過人数 / 　${data.register_count} 人

【WEB売上】
Amazon 売上 / ${data.amazon_count}件 ${formatCurrency(data.amazon_amount)}
BASE 売上 / ${data.base_count}件 ${formatCurrency(data.base_amount)}
Yahoo! 売上 / ${data.yahoo_count}件 ${formatCurrency(data.yahoo_amount)}
メルカリ 売上 / ${data.mercari_count}件 ${formatCurrency(data.mercari_amount)}
楽天 売上 / ${data.rakuten_count}件 ${formatCurrency(data.rakuten_amount)}
Qoo10 売上 / ${data.qoo10_count}件 ${formatCurrency(data.qoo10_amount)}

Amazon累計 / ${formatCurrency(totalSales.amazon_total)}
BASE累計 / ${formatCurrency(totalSales.base_total)}
Yahoo!累計 / ${formatCurrency(totalSales.yahoo_total)}
メルカリ累計 / ${formatCurrency(totalSales.mercari_total)}
楽天累計 / ${formatCurrency(totalSales.rakuten_total)}
Qoo10累計 / ${formatCurrency(totalSales.qoo10_total)}

WEB売上累計 / ${formatCurrency(totalSales.web_total)}
【月内フロア＋WEB累計売上】
${formatCurrency(totalSales.grand_total)}

${data.remarks ? `備考: ${data.remarks}` : ""}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const salesData: Omit<DailySalesReport, "id" | "created_at"> = {
        date: formatDate(date),
        floor_sales: Number.parseInt(formData.floor_sales) || 0,
        floor_total: Number.parseInt(formData.floor_total) || 0,
        cash_income: Number.parseInt(formData.cash_income) || 0,
        register_count: Number.parseInt(formData.register_count) || 0,
        remarks: formData.remarks,
        amazon_count: Number.parseInt(formData.amazon_count) || 0,
        amazon_amount: Number.parseInt(formData.amazon_amount) || 0,
        rakuten_count: Number.parseInt(formData.rakuten_count) || 0,
        rakuten_amount: Number.parseInt(formData.rakuten_amount) || 0,
        yahoo_count: Number.parseInt(formData.yahoo_count) || 0,
        yahoo_amount: Number.parseInt(formData.yahoo_amount) || 0,
        mercari_count: Number.parseInt(formData.mercari_count) || 0,
        mercari_amount: Number.parseInt(formData.mercari_amount) || 0,
        base_count: Number.parseInt(formData.base_count) || 0,
        base_amount: Number.parseInt(formData.base_amount) || 0,
        qoo10_count: Number.parseInt(formData.qoo10_count) || 0,
        qoo10_amount: Number.parseInt(formData.qoo10_amount) || 0,
      }

      const { data, error } = await supabase.from("daily_sales_report").insert([salesData]).select().single()

      if (error) throw error

      // 送信成功後に月次データを再取得
      await fetchMonthlySummary()
      
      setReportData(data)
      setIsSubmitted(true)
    } catch (error) {
      console.error("Error submitting data:", error)
      alert("データの保存に失敗しました")
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setIsSubmitted(false)
    setReportData(null)
    setFormData({
      floor_sales: "",
      floor_total: totalSales.floor_total.toString(), // 累計はリセット後も保持
      cash_income: "",
      register_count: "",
      remarks: "",
      amazon_count: "",
      amazon_amount: "",
      rakuten_count: "",
      rakuten_amount: "",
      yahoo_count: "",
      yahoo_amount: "",
      mercari_count: "",
      mercari_amount: "",
      base_count: "",
      base_amount: "",
      qoo10_count: "",
      qoo10_amount: "",
    })
  }

  if (isSubmitted && reportData) {
    return (
      <div className="min-h-screen bg-gray-50 p-3">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader className="text-center pb-3">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <CardTitle className="text-base text-green-600">登録完了</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="bg-gray-50 p-3 rounded-lg mb-3">
                <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 leading-relaxed">
                  {generateReport(reportData)}
                </pre>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => navigator.clipboard.writeText(generateReport(reportData))}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                >
                  レポートをコピー
                </Button>
                <Button onClick={resetForm} size="sm" className="text-xs">
                  新しい報告を作成
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">売上報告入力</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Date Picker */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">日付</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal text-xs h-7">
                      <CalendarIcon className="mr-2 h-3 w-3" />
                      {formatDateJapanese(date)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={date} onSelect={(date) => date && setDate(date)} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Floor Sales Section */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">フロア日計</Label>
                  <Input
                    type="number"
                    value={formData.floor_sales}
                    onChange={(e) => handleInputChange("floor_sales", e.target.value)}
                    className="text-xs h-7"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">フロア累計</Label>
                  <Input
                    type="number"
                    value={formData.floor_total}
                    onChange={(e) => handleInputChange("floor_total", e.target.value)}
                    className="text-xs h-7"
                    placeholder="0"
                    readOnly
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">入金額</Label>
                  <Input
                    type="number"
                    value={formData.cash_income}
                    onChange={(e) => handleInputChange("cash_income", e.target.value)}
                    className="text-xs h-7"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">レジ通過人数</Label>
                  <Input
                    type="number"
                    value={formData.register_count}
                    onChange={(e) => handleInputChange("register_count", e.target.value)}
                    className="text-xs h-7"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Sales Channels */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-900">ECサイト売上</h3>
                <div className="grid gap-3">
                  {salesChannels.map((channel) => (
                    <div key={channel.key} className="grid grid-cols-3 gap-3 items-center">
                      <Label className="text-xs font-medium">{channel.name}</Label>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">件数</Label>
                        <Input
                          type="number"
                          value={formData[`${channel.key}_count` as keyof typeof formData]}
                          onChange={(e) => handleInputChange(`${channel.key}_count`, e.target.value)}
                          className="text-xs h-7"
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">売上金額</Label>
                        <Input
                          type="number"
                          value={formData[`${channel.key}_amount` as keyof typeof formData]}
                          onChange={(e) => handleInputChange(`${channel.key}_amount`, e.target.value)}
                          className="text-xs h-7"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">備考</Label>
                <Textarea
                  value={formData.remarks}
                  onChange={(e) => handleInputChange("remarks", e.target.value)}
                  className="text-xs min-h-[60px]"
                  placeholder="特記事項があれば入力してください"
                />
              </div>

              {/* Submit Button */}
              <Button type="submit" disabled={isSubmitting} className="w-full text-xs h-8">
                {isSubmitting ? "登録中..." : "登録する"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
