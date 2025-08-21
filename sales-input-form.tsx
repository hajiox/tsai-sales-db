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
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"

type SalesData = Record<string, any>

const salesChannels = [
  { key: "amazon", name: "Amazon" },
  { key: "rakuten", name: "楽天" },
  { key: "yahoo", name: "Yahoo" },
  { key: "mercari", name: "メルカリ" },
  { key: "base", name: "BASE" },
  { key: "qoo10", name: "Qoo10" },
]

export default function SalesInputForm() {
  const supabase = getSupabaseBrowserClient()
  const [date, setDate] = useState<Date>(new Date())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [reportData, setReportData] = useState<SalesData | null>(null)

  const [formData, setFormData] = useState({
    floor_sales: "",
    floor_total: "",
    cash_income: "",
    register_count: "",
    remarks: "",
    amazon_sales: "",
    amazon_total: "",
    rakuten_sales: "",
    rakuten_total: "",
    yahoo_sales: "",
    yahoo_total: "",
    mercari_sales: "",
    mercari_total: "",
    base_sales: "",
    base_total: "",
    qoo10_sales: "",
    qoo10_total: "",
  })

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const formatDate = (date: Date) => {
    return date
      .toLocaleDateString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
      .replace(/\//g, "-")
  }

  const formatDateDisplay = (date: Date) => {
    return date.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("ja-JP").format(amount) + "円"
  }

  const generateReport = (data: SalesData) => {
    const totalEcommerce =
      data.amazon_total +
      data.rakuten_total +
      data.yahoo_total +
      data.mercari_total +
      data.base_total +
      data.qoo10_total

    return `【会津ブランド館売上報告】
${data.date}

フロア日計 / ${formatCurrency(data.floor_total)}
現金収入 / ${formatCurrency(data.cash_income)}
レジ回数 / ${data.register_count}回

【ECサイト売上】
Amazon: ${data.amazon_sales}件 / ${formatCurrency(data.amazon_total)}
楽天: ${data.rakuten_sales}件 / ${formatCurrency(data.rakuten_total)}
Yahoo: ${data.yahoo_sales}件 / ${formatCurrency(data.yahoo_total)}
メルカリ: ${data.mercari_sales}件 / ${formatCurrency(data.mercari_total)}
BASE: ${data.base_sales}件 / ${formatCurrency(data.base_total)}
Qoo10: ${data.qoo10_sales}件 / ${formatCurrency(data.qoo10_total)}

EC合計: ${formatCurrency(totalEcommerce)}
総売上: ${formatCurrency(data.floor_total + totalEcommerce)}

${data.remarks ? `備考: ${data.remarks}` : ""}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const salesData: Omit<SalesData, "id" | "created_at"> = {
        date: formatDate(date),
        floor_sales: Number.parseInt(formData.floor_sales) || 0,
        floor_total: Number.parseInt(formData.floor_total) || 0,
        cash_income: Number.parseInt(formData.cash_income) || 0,
        register_count: Number.parseInt(formData.register_count) || 0,
        remarks: formData.remarks,
        amazon_sales: Number.parseInt(formData.amazon_sales) || 0,
        amazon_total: Number.parseInt(formData.amazon_total) || 0,
        rakuten_sales: Number.parseInt(formData.rakuten_sales) || 0,
        rakuten_total: Number.parseInt(formData.rakuten_total) || 0,
        yahoo_sales: Number.parseInt(formData.yahoo_sales) || 0,
        yahoo_total: Number.parseInt(formData.yahoo_total) || 0,
        mercari_sales: Number.parseInt(formData.mercari_sales) || 0,
        mercari_total: Number.parseInt(formData.mercari_total) || 0,
        base_sales: Number.parseInt(formData.base_sales) || 0,
        base_total: Number.parseInt(formData.base_total) || 0,
        qoo10_sales: Number.parseInt(formData.qoo10_sales) || 0,
        qoo10_total: Number.parseInt(formData.qoo10_total) || 0,
      }

      const { data, error } = await supabase.from("sales_reports").insert([salesData]).select().single()

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
      amazon_sales: "",
      amazon_total: "",
      rakuten_sales: "",
      rakuten_total: "",
      yahoo_sales: "",
      yahoo_total: "",
      mercari_sales: "",
      mercari_total: "",
      base_sales: "",
      base_total: "",
      qoo10_sales: "",
      qoo10_total: "",
    })
  }

  if (isSubmitted && reportData) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CheckCircle className="h-6 w-6 text-green-600" />
                <CardTitle className="text-lg text-green-600">送信完了</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800">{generateReport(reportData)}</pre>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => navigator.clipboard.writeText(generateReport(reportData))}
                  variant="outline"
                  className="text-xs"
                >
                  レポートをコピー
                </Button>
                <Button onClick={resetForm} className="text-xs">
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
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium">売上報告入力</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Date Picker */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">日付</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal text-xs h-8">
                      <CalendarIcon className="mr-2 h-3 w-3" />
                      {formatDateDisplay(date)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={date} onSelect={(date) => date && setDate(date)} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Floor Sales Section */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">フロア売上件数</Label>
                  <Input
                    type="number"
                    value={formData.floor_sales}
                    onChange={(e) => handleInputChange("floor_sales", e.target.value)}
                    className="text-xs h-8"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">フロア売上合計</Label>
                  <Input
                    type="number"
                    value={formData.floor_total}
                    onChange={(e) => handleInputChange("floor_total", e.target.value)}
                    className="text-xs h-8"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">現金収入</Label>
                  <Input
                    type="number"
                    value={formData.cash_income}
                    onChange={(e) => handleInputChange("cash_income", e.target.value)}
                    className="text-xs h-8"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-medium">レジ回数</Label>
                  <Input
                    type="number"
                    value={formData.register_count}
                    onChange={(e) => handleInputChange("register_count", e.target.value)}
                    className="text-xs h-8"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Sales Channels */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-900">ECサイト売上</h3>
                <div className="grid gap-4">
                  {salesChannels.map((channel) => (
                    <div key={channel.key} className="grid grid-cols-3 gap-4 items-center">
                      <Label className="text-xs font-medium">{channel.name}</Label>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">件数</Label>
                        <Input
                          type="number"
                          value={formData[`${channel.key}_sales` as keyof typeof formData]}
                          onChange={(e) => handleInputChange(`${channel.key}_sales`, e.target.value)}
                          className="text-xs h-8"
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">金額</Label>
                        <Input
                          type="number"
                          value={formData[`${channel.key}_total` as keyof typeof formData]}
                          onChange={(e) => handleInputChange(`${channel.key}_total`, e.target.value)}
                          className="text-xs h-8"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">備考</Label>
                <Textarea
                  value={formData.remarks}
                  onChange={(e) => handleInputChange("remarks", e.target.value)}
                  className="text-xs min-h-[80px]"
                  placeholder="特記事項があれば入力してください"
                />
              </div>

              {/* Submit Button */}
              <Button type="submit" disabled={isSubmitting} className="w-full text-xs h-9">
                {isSubmitting ? "送信中..." : "送信"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
