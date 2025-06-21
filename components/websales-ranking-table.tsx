// /components/websales-ranking-table.tsx ver.2
"use client"

import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

interface Props {
  month: string
}

interface Row {
  product_name: string
  total_count: number
  total_amount: number
}

export default function WebSalesRankingTable({ month }: Props) {
  const [bestRows, setBestRows] = useState<Row[]>([])
  const [worstRows, setWorstRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      console.log('🏆 ランキング取得開始:', { month })
      setLoading(true)
      
      try {
        // web_sales_full_month DB関数を使用
        const { data, error } = await supabase.rpc("web_sales_full_month", { 
          target_month: month 
        })

        if (error) {
          console.error("🚨 ランキングデータ取得エラー:", error)
          return
        }

        console.log('📊 取得データ:', { dataLength: data?.length })

        if (!data || data.length === 0) {
          setBestRows([])
          setWorstRows([])
          return
        }

        // 商品ごとに集計
        const map = new Map<string, { count: number; amount: number }>()

        data.forEach((row: any) => {
          const name = row.product_name || row.name || ""
          const price = row.price || 0
          
          // 各ECサイトの販売数を合計
          const count = 
            (row.amazon_count || 0) +
            (row.rakuten_count || 0) +
            (row.yahoo_count || 0) +
            (row.mercari_count || 0) +
            (row.base_count || 0) +
            (row.qoo10_count || 0)

          // if (count > 0) { // ← この条件を削除
            if (!map.has(name)) {
              map.set(name, { count: 0, amount: 0 })
            }
            const entry = map.get(name)!
            entry.count += count
            entry.amount += count * price
          // } // ← この行も削除
        })

        console.log('📈 集計結果:', { productCount: map.size })

        // 配列に変換
        const arr: Row[] = Array.from(map.entries()).map(([product_name, v]) => ({
          product_name,
          total_count: v.count,
          total_amount: v.amount,
        }))

        // ソート（件数順）
        const desc = [...arr].sort((a, b) => b.total_count - a.total_count)
        const asc = [...arr]
          .sort((a, b) => a.total_count - b.total_count)

        console.log('🏆 ベスト10:', desc.slice(0, 10))
        console.log('📉 ワースト10:', asc.slice(0, 10))

        setBestRows(desc.slice(0, 10))
        setWorstRows(asc.slice(0, 10))
        
      } catch (error) {
        console.error("🚨 ランキング処理エラー:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [month])

  const f = (n: number) => new Intl.NumberFormat("ja-JP").format(n)

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded mb-3 w-24"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded mb-3 w-24"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* ベスト10 */}
      <div>
        <h3 className="font-semibold mb-3 text-green-700">🏆 ベスト10</h3>
        <table className="min-w-full text-xs border">
          <thead className="bg-green-50">
            <tr>
              <th className="border px-1 py-1 w-12">順位</th>
              <th className="border px-2 py-1">商品名</th>
              <th className="border px-1 py-1 w-16">件数</th>
              <th className="border px-1 py-1 w-20">売上金額</th>
            </tr>
          </thead>
          <tbody>
            {bestRows.length > 0 ? (
              bestRows.map((r, i) => (
                <tr key={r.product_name} className="text-center hover:bg-green-50">
                  <td className="border px-1 py-1 font-medium">{i + 1}</td>
                  <td className="border px-2 py-1 text-left text-xs">{r.product_name}</td>
                  <td className="border px-1 py-1 text-xs">{f(r.total_count)}</td>
                  <td className="border px-1 py-1 text-xs">¥{f(r.total_amount)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="border px-2 py-4 text-center text-gray-500">
                  データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ワースト10 */}
      <div>
        <h3 className="font-semibold mb-3 text-red-700">📉 ワースト10</h3>
        <table className="min-w-full text-xs border">
          <thead className="bg-red-50">
            <tr>
              <th className="border px-1 py-1 w-12">順位</th>
              <th className="border px-2 py-1">商品名</th>
              <th className="border px-1 py-1 w-16">件数</th>
              <th className="border px-1 py-1 w-20">売上金額</th>
            </tr>
          </thead>
          <tbody>
            {worstRows.length > 0 ? (
              worstRows.map((r, i) => (
                <tr key={r.product_name} className="text-center hover:bg-red-50">
                  <td className="border px-1 py-1 font-medium">{i + 1}</td>
                  <td className="border px-2 py-1 text-left text-xs">{r.product_name}</td>
                  <td className="border px-1 py-1 text-xs">{f(r.total_count)}</td>
                  <td className="border px-1 py-1 text-xs">¥{f(r.total_amount)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="border px-2 py-4 text-center text-gray-500">
                  データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
