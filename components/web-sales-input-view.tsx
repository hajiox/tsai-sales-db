"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

// ---- 型定義 ----
export type Product = {
  id: number
  product_name: string
  series_name: string
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
  floor: number
  total_count: number
  total_sales: number
}

type Row = Product &
  Omit<WebSalesSummary, "product_id" | "report_month"> & { summary_id?: number; editing?: boolean }

type NewProduct = {
  tempId: string
  product_name: string
  series_name: string
  price: number
}

export default function WebSalesInputView() {
  const [reportMonth, setReportMonth] = useState(
    new Date().toISOString().slice(0, 7)
  )
  const [rows, setRows] = useState<Row[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [showProductModal, setShowProductModal] = useState(false)
  const [newProductRows, setNewProductRows] = useState<NewProduct[]>([])

  const loadData = async (month: string = reportMonth) => {
    const { data: prod } = await supabase
      .from("products")
      .select("id, product_name, series_name, price")
      .order("id")
    const prodList = prod || []
    setProducts(prodList)

    const { data: sum } = await supabase
      .from("web_sales_summary")
      .select("*")
      .eq("report_month", month)
    const map: Record<number, any> = {}
    ;(sum || []).forEach((r: any) => {
      map[r.product_id] = r
    })

    setRows(
      prodList.map((p) => {
        const s = map[p.id] || {}
        return {
          ...p,
          summary_id: s.id,
          amazon: s.amazon || 0,
          rakuten: s.rakuten || 0,
          yahoo: s.yahoo || 0,
          mercari: s.mercari || 0,
          base: s.base || 0,
          qoo10: s.qoo10 || 0,
          floor: s.floor || 0,
          total_count: s.total_count || 0,
          total_sales: s.total_sales || 0,
          editing: false,
        }
      })
    )
  }

  useEffect(() => {
    loadData(reportMonth)
  }, [reportMonth])

  const recalc = (row: Row): Row => {
    const total =
      row.amazon +
      row.rakuten +
      row.yahoo +
      row.mercari +
      row.base +
      row.qoo10 +
      row.floor
    return {
      ...row,
      total_count: total,
      total_sales: total * row.price,
    }
  }

  const handleChange = (
    id: number,
    field: keyof WebSalesSummary,
    value: number
  ) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id ? recalc({ ...r, [field]: value }) : r
      )
    )
  }

  const toggleEdit = (id: number) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, editing: !r.editing } : r))
    )
  }

  const handleDelete = async (row: Row) => {
    if (!row.summary_id) return
    if (!confirm("削除しますか？")) return
    await supabase.from("web_sales_summary").delete().eq("id", row.summary_id)
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...recalc({
        ...r,
        amazon: 0,
        rakuten: 0,
        yahoo: 0,
        mercari: 0,
        base: 0,
        qoo10: 0,
        floor: 0,
        summary_id: undefined,
      }) } : r)))
  }

  const addNewProductRow = () => {
    setNewProductRows((prev) => [
      ...prev,
      {
        tempId: Math.random().toString(36).slice(2),
        product_name: "",
        series_name: "",
        price: 0,
      },
    ])
  }

  const handleNewProductChange = (
    tempId: string,
    field: keyof NewProduct,
    value: string | number,
  ) => {
    setNewProductRows((prev) =>
      prev.map((r) => (r.tempId === tempId ? { ...r, [field]: value } : r)),
    )
  }

  const saveNewProduct = async (row: NewProduct) => {
    if (!row.product_name || !row.series_name || !row.price) {
      alert("未入力項目があります")
      return
    }
    const { error } = await supabase.from("products").insert({
      product_name: row.product_name,
      series_name: row.series_name,
      price: row.price,
    })
    if (error) {
      console.error(error)
      alert("保存に失敗しました")
      return
    }
    setNewProductRows((prev) => prev.filter((r) => r.tempId !== row.tempId))
    await loadData(reportMonth)
  }

  const cancelNewProduct = (tempId: string) => {
    setNewProductRows((prev) => prev.filter((r) => r.tempId !== tempId))
  }

  const addProduct = async () => {
    const { data, error } = await supabase
      .from("products")
      .insert({ product_name: "新商品", series_name: "", price: 0 })
      .select()
      .single()
    if (error) {
      console.error(error)
      return
    }
    setRows((prev) => [
      ...prev,
      {
        ...data,
        amazon: 0,
        rakuten: 0,
        yahoo: 0,
        mercari: 0,
        base: 0,
        qoo10: 0,
        floor: 0,
        total_count: 0,
        total_sales: 0,
        editing: true,
      },
    ])
  }

  const save = async () => {
    for (const row of rows) {
      const payload: WebSalesSummary = {
        report_month: reportMonth,
        product_id: row.id,
        amazon: row.amazon,
        rakuten: row.rakuten,
        yahoo: row.yahoo,
        mercari: row.mercari,
        base: row.base,
        qoo10: row.qoo10,
        floor: row.floor,
        total_count: row.total_count,
        total_sales: row.total_sales,
      }
      if (row.summary_id) {
        await supabase
          .from("web_sales_summary")
          .update(payload)
          .eq("id", row.summary_id)
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
  }

  const f = (n: number) => new Intl.NumberFormat("ja-JP").format(n)

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <Card>
        <CardHeader className="pb-2 flex justify-between items-center">
          <CardTitle className="text-base">WEB販売入力</CardTitle>
          <div className="flex items-center gap-2">
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
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowProductModal(true)}
            >
              商品管理
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-auto">
            <table className="min-w-full text-xs border">
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
                  <th className="border px-2 py-1">フロア</th>
                  <th className="border px-2 py-1">合計件数</th>
                  <th className="border px-2 py-1">合計売上</th>
                  <th className="border px-2 py-1"></th>
                  <th className="border px-2 py-1"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="text-center">
                    <td className="border px-2 py-1 text-left text-xs whitespace-nowrap">
                      {r.product_name}
                    </td>
                    <td className="border px-2 py-1 text-left text-xs whitespace-nowrap">
                      {r.series_name}
                    </td>
                    <td className="border px-2 py-1">{f(r.price)}</td>
                    {([
                      "amazon",
                      "rakuten",
                      "yahoo",
                      "mercari",
                      "base",
                      "qoo10",
                      "floor",
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
                    <td className="border px-2 py-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(r)}
                        className="px-1"
                      >
                        🗑
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" onClick={addProduct}>
            ＋商品を追加
          </Button>
          <div className="text-right">
            <Button onClick={save}>保存</Button>
          </div>
        </CardContent>
      </Card>

      {showProductModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded p-4 w-full max-w-md space-y-2 overflow-auto max-h-[80vh]">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-semibold">商品マスタ管理</h2>
              <Button size="sm" variant="ghost" onClick={() => setShowProductModal(false)}>
                ✕
              </Button>
            </div>
            {[...products, ...newProductRows].map((p) => {
              const isNew = (p as any).tempId !== undefined
              const key = isNew ? (p as NewProduct).tempId : (p as Product).id
              return (
                <div key={key} className="grid grid-cols-5 gap-2 items-center">
                  <Input
                  value={p.product_name}
                  onChange={(e) => {
                    const v = e.target.value
                    if (isNew) {
                      handleNewProductChange((p as NewProduct).tempId, "product_name", v)
                    } else {
                      setProducts((prev) => prev.map((r) => (r.id === (p as Product).id ? { ...r, product_name: v } : r)))
                    }
                  }}
                  className="col-span-2"
                />
                <Input
                  value={p.series_name}
                  onChange={(e) => {
                    const v = e.target.value
                    if (isNew) {
                      handleNewProductChange((p as NewProduct).tempId, "series_name", v)
                    } else {
                      setProducts((prev) => prev.map((r) => (r.id === (p as Product).id ? { ...r, series_name: v } : r)))
                    }
                  }}
                />
                <Input
                  type="number"
                  value={p.price}
                  onChange={(e) => {
                    const v = parseInt(e.target.value) || 0
                    if (isNew) {
                      handleNewProductChange((p as NewProduct).tempId, "price", v)
                    } else {
                      setProducts((prev) => prev.map((r) => (r.id === (p as Product).id ? { ...r, price: v } : r)))
                    }
                  }}
                />
                {isNew ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => saveNewProduct(p as NewProduct)}
                      className="px-1"
                    >
                      💾
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => cancelNewProduct((p as NewProduct).tempId)}
                      className="px-1"
                    >
                      🗑
                    </Button>
                  </>
                ) : (
                  <>
                    <div></div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (confirm("削除しますか？")) {
                          await supabase.from("web_sales_summary").delete().eq("product_id", (p as Product).id)
                          await supabase.from("products").delete().eq("id", (p as Product).id)
                          setProducts((prev) => prev.filter((r) => r.id !== (p as Product).id))
                          setRows((prev) => prev.filter((r) => r.id !== (p as Product).id))
                        }
                      }}
                      className="px-1"
                    >
                      🗑
                    </Button>
                  </>
                )}
                </div>
              )
            })}
            <Button
              variant="outline"
              size="sm"
              onClick={addNewProductRow}
            >
              ＋追加
            </Button>
            <div className="text-right">
              <Button
                size="sm"
                onClick={async () => {
                  for (const p of products) {
                    await supabase
                      .from("products")
                      .update({
                        product_name: p.product_name,
                        series_name: p.series_name,
                        price: p.price,
                      })
                      .eq("id", p.id)
                  }
                  setShowProductModal(false)
                }}
              >
                💾
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
