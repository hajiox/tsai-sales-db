// components/sales-input-view.tsx ver.2
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
import { ja } from "date-fns/locale"
import { CalendarIcon, CheckCircle } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"
type DailySalesReport = Record<string, any>
import { formatDateJST } from "@/lib/utils"

export default function SalesInputView() {
  const supabase = getSupabaseBrowserClient()
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reportData, setReportData] = useState<DailySalesReport | null>(null)

  const [formData, setFormData] = useState({
    floor_sales: "",
    cash_income: "",
    register_count: "",
    remarks: "",
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
    return `【会津ブランド館売上報告】
${data.date}

フロア日計 / ${formatCurrency(data.floor_sales)}
入　　金 / ${formatCurrency(data.cash_income)}
レジ通過人数 / 　${data.register_count} 人

${data.remarks ? `備考: ${data.remarks}` : ""}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const salesData: Omit<DailySalesReport, "id" | "created_at" | "floor_total"> = {
        date: formatDate(selectedDate),
        floor_sales: Number.parseInt(formData.floor_sales) || 0,
        cash_income: Number.parseInt(formData.cash_income) || 0,
        register_count: Number.parseInt(formData.register_count) || 0,
        remarks: formData.remarks,
      }

      const { data, error } = await supabase.from("daily_sales_report").insert([salesData]).select().single()

      if (error) throw error

      setReportData(data)

      // Reset form after successful submission
      setFormData({
        floor_sales: "",
        cash_income: "",
        register_count: "",
        remarks: "",
      })
    } catch (error) {
      console.error("Error submitting data:", error)
      alert("データの保存に失敗しました")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">売上入力</h2>
        <p className="text-sm text-gray-600">日次売上データを入力してください</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">売上データ入力</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Date Picker */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">日付</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal text-sm h-9">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formatDateJapanese(selectedDate)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    locale={ja}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Floor Sales Section */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">フロア日計</Label>
                <Input
                  type="number"
                  value={formData.floor_sales}
                  onChange={(e) => handleInputChange("floor_sales", e.target.value)}
                  className="text-sm h-9"
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">入金額</Label>
                <Input
                  type="number"
                  value={formData.cash_income}
                  onChange={(e) => handleInputChange("cash_income", e.target.value)}
                  className="text-sm h-9"
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">レジ通過人数</Label>
                <Input
                  type="number"
                  value={formData.register_count}
                  onChange={(e) => handleInputChange("register_count", e.target.value)}
                  className="text-sm h-9"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Remarks */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">備考</Label>
              <Textarea
                value={formData.remarks}
                onChange={(e) => handleInputChange("remarks", e.target.value)}
                className="text-sm min-h-[80px]"
                placeholder="特記事項があれば入力してください"
              />
            </div>

            {/* Submit Button */}
            <Button type="submit" disabled={isSubmitting} className="w-full text-sm h-10">
              {isSubmitting ? "登録中..." : "登録する"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Report Display */}
      {reportData && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <CardTitle className="text-lg text-green-600">登録完了</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <pre className="text-sm font-mono whitespace-pre-wrap text-gray-800 leading-relaxed">
                {generateReport(reportData)}
              </pre>
            </div>
            <Button
              onClick={() => navigator.clipboard.writeText(generateReport(reportData))}
              variant="outline"
              size="sm"
              className="text-sm"
            >
              レポートをコピー
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
