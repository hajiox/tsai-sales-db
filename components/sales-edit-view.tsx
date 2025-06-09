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
import { supabase, type DailySalesReport } from "../lib/supabase"

const salesChannels = [
  { key: "amazon", name: "Amazon" },
  { key: "rakuten", name: "楽天" },
  { key: "yahoo", name: "Yahoo!" },
  { key: "mercari", name: "メルカリ" },
  { key: "base", name: "BASE" },
  { key: "qoo10", name: "Qoo10" },
]

export default function SalesEditView() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [selectedRecord, setSelectedRecord] = useState<DailySalesReport | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [reportData, setReportData] = useState<DailySalesReport | null>(null)
  const [recordNotFound, setRecordNotFound] = useState(false)

  const [formData, setFormData] = useState({
    floor_sales: "",
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

  useEffect(() => {
    const fetchRecord = async () => {
      try {
        const { data, error } = await supabase
          .from("daily_sales_report")
          .select("*")
          .eq("date", selectedDate.toISOString().slice(0, 10))
          .single()

        if (error) {
          if (error.code === "PGRST116") {
            setRecordNotFound(true)
          } else {
            throw error
          }
          setSelectedRecord(null)
          return
        }

        setRecordNotFound(false)

        setSelectedRecord(data)
        setFormData({
          floor_sales: data.floor_sales?.toString() ?? "",
          cash_income: data.cash_income?.toString() ?? "",
          register_count: data.register_count?.toString() ?? "",
          remarks: data.remarks ?? "",
          amazon_count: data.amazon_count?.toString() ?? "",
          amazon_amount: data.amazon_amount?.toString() ?? "",
          rakuten_count: data.rakuten_count?.toString() ?? "",
          rakuten_amount: data.rakuten_amount?.toString() ?? "",
          yahoo_count: data.yahoo_count?.toString() ?? "",
          yahoo_amount: data.yahoo_amount?.toString() ?? "",
          mercari_count: data.mercari_count?.toString() ?? "",
          mercari_amount: data.mercari_amount?.toString() ?? "",
          base_count: data.base_count?.toString() ?? "",
          base_amount: data.base_amount?.toString() ?? "",
          qoo10_count: data.qoo10_count?.toString() ?? "",
          qoo10_amount: data.qoo10_amount?.toString() ?? "",
        })
      } catch (error) {
        console.error("Error searching record:", error)
        alert("データの検索に失敗しました")
      } finally {
        /* noop */
      }
    }

    fetchRecord()
  }, [selectedDate])

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRecord) return

    setIsUpdating(true)

    try {
      const updatedData: Partial<DailySalesReport> = {
        floor_sales: Number.parseInt(formData.floor_sales) || 0,
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

      const { data, error } = await supabase
        .from("daily_sales_report")
        .update(updatedData)
        .eq("id", selectedRecord.id)
        .select()
        .single()

      if (error) throw error

      setReportData(data)
      setSelectedRecord(data)
    } catch (error) {
      console.error("Error updating data:", error)
      alert("データの更新に失敗しました")
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">売上修正</h2>
        <p className="text-sm text-gray-600">過去の売上データを検索・修正できます</p>
      </div>

      {/* Date Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">データ検索</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 w-full">
            <Label className="text-sm font-medium">対象日付</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal text-sm h-9"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formatDateJapanese(selectedDate)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* Edit Form */}
      {recordNotFound && (
        <p className="text-sm text-gray-500">指定された日付のデータは登録されていません。</p>
      )}
      {selectedRecord && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">売上データ修正</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdate} className="space-y-6">
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

              {/* Sales Channels */}
              <div className="space-y-4">
                <h3 className="text-base font-medium text-gray-900">ECサイト売上</h3>
                <div className="grid gap-4">
                  {salesChannels.map((channel) => (
                    <div key={channel.key} className="grid grid-cols-3 gap-4 items-center">
                      <Label className="text-sm font-medium">{channel.name}</Label>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">件数</Label>
                        <Input
                          type="number"
                          value={formData[`${channel.key}_count` as keyof typeof formData]}
                          onChange={(e) => handleInputChange(`${channel.key}_count`, e.target.value)}
                          className="text-sm h-9"
                          placeholder="0"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">売上金額</Label>
                        <Input
                          type="number"
                          value={formData[`${channel.key}_amount` as keyof typeof formData]}
                          onChange={(e) => handleInputChange(`${channel.key}_amount`, e.target.value)}
                          className="text-sm h-9"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  ))}
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

              {/* Update Button */}
              <Button type="submit" disabled={isUpdating} className="w-full text-sm h-10">
                {isUpdating ? "更新中..." : "更新する"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Report Display */}
      {reportData && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <CardTitle className="text-lg text-green-600">更新完了</CardTitle>
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
