"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"

export type Product = {
  id: number
  name: string
  series: string
  price: number
}

export type WebSalesSummary = {
  id?: number
  report_month: string
  product_id: number
  amazon: number
  rakuten: number
  yahoo: number
  mercari: number
  base: number
  qoo10: number
  total_count: number
  total_sales: number
}

type Row = Product &
  Omit<WebSalesSummary, "product_id" | "report_month"> & {
    summary_id?: number
    editing?: boolean
  }

export default function WebSalesInputView() {
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7))
  const [rows, setRows] = useState<Row[]>([])

  const recalc = (row: Row): Row => {
    const total =
      row.amazon +
      row.rakuten +
      row.yahoo +
      row.mercari +
      row.base +
      row.qoo10
    return {
      ...row,
      total_count: total,
      total_sales: total * row.price,
    }
  }

  const loadData = async (month: string = reportMonth) => {
    // Always sort by numeric series_code first then product_code so that
    // "series_code=1" products appear at the top.
    const { data: products } = await supabase
      .from("products")
      .select('*')
      .order('series_code', { ascending: true })
      .order('product_code', { ascending: true })
    const { data: summary } = await supabase
      .from("web_sales_summary")
      .select("*")
      .eq("report_month", `${month}-01`)

    const map: Record<number, any> = {}
    ;(summary || []).forEach((s) => {
      map[s.product_id] = s
    })

    setRows(
      (products || []).map((p) => {
        const s = map[p.id] || {}
        return recalc({
          ...p,
          summary_id: s.id,
          amazon: s.amazon || 0,
          rakuten: s.rakuten || 0,
          yahoo: s.yahoo || 0,
          mercari: s.mercari || 0,
          base: s.base || 0,
          qoo10: s.qoo10 || 0,
          total_count: s.total_count || 0,
          total_sales: s.total_sales || 0,
          editing: false,
        })
      })
    )
  }

  useEffect(() => {
    loadData(reportMonth)
  }, [reportMonth])

  const handleChange = (id: number, field: keyof WebSalesSummary, value: number) => {
    setRows((prev) => prev.map((r) => (r.id === id ? recalc({ ...r, [field]: value }) : r)))
  }

  const toggleEdit = (id: number) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, editing: !r.editing } : r)))
  }

  const handleDelete = async (row: Row) => {
    if (!row.summary_id) return
    if (!confirm("削除しますか？")) return
    await supabase.from("web_sales_summary").delete().eq("id", row.summary_id)
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? recalc({
              ...r,
              amazon: 0,
              rakuten: 0,
              yahoo: 0,
              mercari: 0,
              base: 0,
              qoo10: 0,
              summary_id: undefined,
            })
          : r
      )
    )
  }

  const save = async () => {
    for (const row of rows) {
      const payload: WebSalesSummary = {
        report_month: `${reportMonth}-01`,
        product_id: row.id,
        amazon: row.amazon,
        rakuten: row.rakuten,
        yahoo: row.yahoo,
        mercari: row.mercari,
        base: row.base,
        qoo10: row.qoo10,
        total_count: row.total_count,
        total_sales: row.total_sales,
      }
      if (row.summary_id) {
        await supabase.from("web_sales_summary").update(payload).eq("id", row.summary_id)
      } else {
        const { data } = await supabase
          .from("web_sales_summary")
          .insert(payload)
          .select()
          .single()
        row.summary_id = data?.id
      }
    }
    alert("保存しました")
    setRows((prev) => prev.map((r) => ({ ...r, editing: false })))
    loadData(reportMonth)
  }

  const f = (n: number) => new Intl.NumberFormat("ja-JP").format(n)

  return (
    <div className="min-h-screen bg-gray-50 p-4 space-y-2">
      <div className="flex justify-end">
        <select
          value={reportMonth}
          onChange={(e) => setReportMonth(e.target.value)}
          className="border rounded text-sm p-1"
        >
          {Array.from({ length: 12 }).map((_, i) => {
            const d = new Date()
            d.setMonth(d.getMonth() - i)
            const v = d.toISOString().slice(0, 7)
            return (
              <option key={v} value={v}>
                {v}
              </option>
            )
          })}
        </select>
      </div>
      <div className="overflow-auto border">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-2 py-1">商品名</th>
              <th className="border px-2 py-1">シリーズ名</th>
              <th className="border px-2 py-1">単価</th>
              <th className="border px-2 py-1">Amazon</th>
              <th className="border px-2 py-1">楽天</th>
              <th className="border px-2 py-1">Yahoo</th>
              <th className="border px-2 py-1">メルカリ</th>
              <th className="border px-2 py-1">BASE</th>
              <th className="border px-2 py-1">Qoo10</th>
              <th className="border px-2 py-1">合計件数</th>
              <th className="border px-2 py-1">合計売上</th>
              <th className="border px-2 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="border px-2 py-4 text-center">
                  商品がありません
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="text-center">
                  <td className="border px-2 py-1 text-left whitespace-nowrap">
                    {r.name}
                  </td>
                  <td className="border px-2 py-1 text-left whitespace-nowrap">
                    {r.series}
                  </td>
                  <td className="border px-2 py-1">{f(r.price)}</td>
                  {([
                    "amazon",
                    "rakuten",
                    "yahoo",
                    "mercari",
                    "base",
                    "qoo10",
                  ] as (keyof WebSalesSummary)[]).map((key) => (
                    <td key={key} className="border px-2 py-1">
                      <Input
                        type="number"
                        value={r[key]}
                        disabled={!r.editing}
                        onChange={(e) =>
                          handleChange(r.id, key, parseInt(e.target.value) || 0)
                        }
                        className="w-20"
                      />
                    </td>
                  ))}
                  <td className="border px-2 py-1">{f(r.total_count)}</td>
                  <td className="border px-2 py-1">¥{f(r.total_sales)}</td>
                  <td className="border px-2 py-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleEdit(r.id)}
                      className="px-1"
                    >
                      ✏️
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="text-right">
        <Button onClick={save}>保存</Button>
      </div>
    </div>
  )
}

