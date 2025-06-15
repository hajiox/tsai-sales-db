// sales-report-form.tsx (修正後)

"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon, ClipboardCheck, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase" // `lib/supabase.ts`のパスを正しく指定してください
import { formatDateJST, formatCurrency } from "@/lib/utils" // `lib/utils.ts`のパスを正しく指定してください

// 販売チャネルの定義
const salesChannels = [
  { key: "amazon", name: "Amazon" },
  { key: "rakuten", name: "楽天" },
  { key: "yahoo", name: "Yahoo!" },
  { key: "mercari", name: "メルカリ" },
  { key: "base", name: "BASE" },
  { key: "qoo10", name: "Qoo10" },
]

// フォームデータの型定義
type FormData = {
  floor_sales: string
  cash_income: string
  register_count: string
  remarks: string
  [key: string]: string // 各販売チャネルのamountとcountを許容するため
}

export default function SalesReportForm() {
  const [date, setDate] = useState<Date | undefined>(new Date())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedReport, setGeneratedReport] = useState<string>("")
  const [isCopied, setIsCopied] = useState(false)

  // フォームの初期値
  const initialFormData: FormData = {
    floor_sales: "",
    cash_income: "",
    register_count: "",
    remarks: "",
    ...salesChannels.reduce((acc, channel) => {
      acc[`${channel.key}_count`] = ""
      acc[`${channel.key}_amount`] = ""
      return acc
    }, {} as { [key: string]: string }),
  }
  const [formData, setFormData] = useState<FormData>(initialFormData)

  // 入力ハンドラ
  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  // レポート生成ロジック
  const generateReportText = (data: any): string => {
    // データがない場合は空文字を返す
    if (!data) return ""

    const webSalesText = salesChannels
      .map(
        (channel) =>
          `${channel.name} 売上 / ${data[`d_${channel.key}_count`] || 0}件 ${formatCurrency(
            data[`d_${channel.key}_amount`] || 0
          )}`
      )
      .join("\n")

    const webCumulativeText = salesChannels
      .map(
        (channel) =>
          `${channel.name}累計 / ${formatCurrency(data[`m_${channel.key}_total`] || 0)}`
      )
      .join("\n")

    return `【会津ブランド館売上報告】
${formatDateJST(date || new Date())}
フロア日計 / ${formatCurrency(data.d_floor_sales || 0)}
フロア累計 / ${formatCurrency(data.m_floor_total || 0)}
入　金 / ${formatCurrency(data.d_cash_income || 0)}
レジ通過人数 / ${data.d_register_count || 0} 人
【WEB売上】
${webSalesText}
${webCumulativeText}
WEB売上累計 / ${formatCurrency(data.m_web_total || 0)}
【月内フロア＋WEB累計売上】
${formatCurrency(data.m_grand_total || 0)}`
  }
  
  // フォーム送信ハンドラ
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!date) {
      setError("日付を選択してください。")
      return
    }

    setIsSubmitting(true)
    setError(null)
    setGeneratedReport("")
    setIsCopied(false)

    // DBに保存するデータを作成（文字列を数値に変換）
    const submissionData = {
      date: formatDateJST(date),
      ...Object.entries(formData).reduce((acc, [key, value]) => {
        // remarks以外は数値に変換。空文字はnullにする
        if (key !== 'remarks') {
          acc[key as keyof Omit<FormData, 'remarks'>] = value === '' ? null : Number(value);
        } else {
          acc[key] = value;
        }
        return acc;
      }, {} as any),
    };

    try {
      // 1. 日次データをテーブルに保存 (upsertで同日のデータは上書き)
      const { error: upsertError } = await supabase
        .from("daily_sales_report")
        .upsert(submissionData, { onConflict: 'date' });

      if (upsertError) throw upsertError

      // 2. DB関数を呼び出してレポート用データを取得
      const { data: reportData, error: rpcError } = await supabase.rpc(
        "get_sales_report_data",
        { report_date: formatDateJST(date) }
      )

      if (rpcError) throw rpcError
      if (!reportData || reportData.length === 0) throw new Error("レポートデータの取得に失敗しました。")

      // 3. 取得したデータでレポートを生成
      const reportText = generateReportText(reportData[0]);
      setGeneratedReport(reportText)

    } catch (e: any) {
      console.error("エラーが発生しました:", e)
      setError(`エラー: ${e.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // クリップボードにコピー
  const handleCopyToClipboard = () => {
    if (!generatedReport) return
    navigator.clipboard.writeText(generatedReport)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  return (
    <div className="flex justify-center p-4">
      <div className="w-full max-w-4xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>売上報告フォーム</CardTitle>
            <CardDescription>日次の売上データを入力してください。</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Date Picker */}
              <div className="space-y-2">
                <Label className="font-medium">報告日</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className="w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {date ? formatDateJST(date) : <span>日付を選択</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={setDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Floor Sales */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="floor_sales" className="text-xs font-medium">フロア日計売上</Label>
                  <Input id="floor_sales" type="number" value={formData.floor_sales} onChange={(e) => handleInputChange("floor_sales", e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cash_income" className="text-xs font-medium">入金額</Label>
                  <Input id="cash_income" type="number" value={formData.cash_income} onChange={(e) => handleInputChange("cash_income", e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="register_count" className="text-xs font-medium">レジ通過人数</Label>
                  <Input id="register_count" type="number" value={formData.register_count} onChange={(e) => handleInputChange("register_count", e.target.value)} placeholder="0" />
                </div>
              </div>

              {/* Web Sales */}
              <div>
                <Label className="text-sm font-medium">Web売上</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-2">
                  {salesChannels.map((channel) => (
                    <div key={channel.key} className="p-3 border rounded-md space-y-2">
                      <Label className="text-xs font-semibold">{channel.name}</Label>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">販売件数</Label>
                        <Input type="number" value={formData[`${channel.key}_count`]} onChange={(e) => handleInputChange(`${channel.key}_count`, e.target.value)} className="text-xs h-7" placeholder="0" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-gray-500">売上金額</Label>
                        <Input type="number" value={formData[`${channel.key}_amount`]} onChange={(e) => handleInputChange(`${channel.key}_amount`, e.target.value)} className="text-xs h-7" placeholder="0" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">備考</Label>
                <Textarea value={formData.remarks} onChange={(e) => handleInputChange("remarks", e.target.value)} className="text-xs min-h-[60px]" placeholder="特記事項があれば入力してください" />
              </div>
              
              {/* Submit Button */}
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? "生成中..." : "レポート生成"}
              </Button>
              
              {/* Error Message */}
              {error && <p className="text-sm text-red-500">{error}</p>}
            </form>
          </CardContent>
        </Card>
        
        {/* Generated Report Display */}
        {generatedReport && (
          <Card>
            <CardHeader>
              <CardTitle>生成された売上報告</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Textarea
                  readOnly
                  value={generatedReport}
                  className="text-sm font-mono min-h-[350px] bg-gray-50"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopyToClipboard}
                  className="absolute top-2 right-2"
                >
                  {isCopied ? <ClipboardCheck className="h-4 w-4 text-green-500" /> : "コピー"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

// ユーティリティ関数（例として。lib/utils.ts に配置してください）
/*
// lib/utils.ts
export const formatDateJST = (date: Date): string => {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(date).replace(/\//g, '-');
};

export const formatCurrency = (amount: number | null | undefined): string => {
  if (amount == null) return '0円';
  return `${amount.toLocaleString()}円`;
};
*/
