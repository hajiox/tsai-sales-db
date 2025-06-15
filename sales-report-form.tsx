"use client"

import type React from "react"

import { useState } from "react"
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

【ECサイト売上】
Amazon: ${data.amazon_count}件 / ${formatCurrency(data.amazon_amount)}
楽天: ${data.rakuten_count}件 / ${formatCurrency(data.rakuten_amount)}
Yahoo!: ${data.yahoo_count}件 / ${formatCurrency(data.yahoo_amount)}
メルカリ: ${data.mercari_count}件 / ${formatCurrency(data.mercari_amount)}
BASE: ${data.base_count}件 / ${formatCurrency(data.base_amount)}
Qoo10: ${data.qoo10_count}件 / ${formatCurrency(data.qoo10_amount)}

EC合計: ${totalEcCount}件 / ${formatCurrency(totalEcAmount)}
総売上: ${formatCurrency(data.floor_sales + totalEcAmount)}

${data.remarks ? `備考: ${data.remarks}` : ""}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    // Reset existing report state before generating a new one
    setIsSubmitted(false)
    setReportData(null)

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
