// /components/websales-ranking-table.tsx ver.3 (金額/件数切り替え対応)
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

type SortType = 'count' | 'amount';

export default function WebSalesRankingTable({ month }: Props) {
  const [bestRows, setBestRows] = useState<Row[]>([])
  const [worstRows, setWorstRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortType>('count') // 件数/金額の切り替え用
  const [originalData, setOriginalData] = useState<Row[]>([]) // 元データを保持

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
          setOriginalData([])
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

        // 元データを保存
        setOriginalData(arr)
        
        // ソート（現在の並び順で）
        sortAndSetData(arr, sortBy)
        
      } catch (error) {
        console.error("🚨 ランキング処理エラー:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [month])

  // 並び替え処理を関数化
  const sortAndSetData = (data: Row[], sortType: SortType) => {
    console.log(`🔄 ソート方法: ${sortType === 'count' ? '件数順' : '金額順'}`)
    
    // ソート関数
    const sortFunc = (a: Row, b: Row) => {
      if (sortType === 'count') {
        return b.total_count - a.total_count // 件数で降順
      } else {
        return b.total_amount - a.total_amount // 金額で降順
      }
    }
    
    // 昇順ソート関数
    const sortFuncAsc = (a: Row, b: Row) => {
      if (sortType === 'count') {
        return a.total_count - b.total_count // 件数で昇順
      } else {
        return a.total_amount - b.total_amount // 金額で昇順
      }
    }
    
    // ソート（降順・昇順）
    const desc = [...data].sort(sortFunc)
    const asc = [...data].sort(sortFuncAsc)

    console.log(`🏆 ベスト10 (${sortType === 'count' ? '件数順' : '金額順'}):`, desc.slice(0, 10))
    console.log(`📉 ワースト10 (${sortType === 'count' ? '件数順' : '金額順'}):`, asc.slice(0, 10))

    setBestRows(desc.slice(0, 10))
    setWorstRows(asc.slice(0, 10))
  }

  // ソート方法変更時の処理
  useEffect(() => {
    if (originalData.length > 0) {
      sortAndSetData(originalData, sortBy)
    }
  }, [sortBy, originalData])

  // 並び替えボタンのハンドラ
  const handleSortChange = (type: SortType) => {
    setSortBy(type)
  }

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
    <div className="space-y-4">
      {/* 並び替えボタン */}
      <div className="flex justify-end space-x-2 items-center text-sm">
        <span className="text-gray-600">並び順:</span>
        <button
          onClick={() => handleSortChange('count')}
          className={`px-3 py-1 rounded text-sm ${
            sortBy === 'count' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          件数順
        </button>
        <button
          onClick={() => handleSortChange('amount')}
          className={`px-3 py-1 rounded text-sm ${
            sortBy === 'amount' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          金額順
        </button>
      </div>
      
      <div className="grid grid-cols-2 gap-6">
        {/* ベスト10 */}
        <div>
          <h3 className="font-semibold mb-3 text-green-700">
            🏆 ベスト10 ({sortBy === 'count' ? '件数順' : '金額順'})
          </h3>
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
          <h3 className="font-semibold mb-3 text-red-700">
            📉 ワースト10 ({sortBy === 'count' ? '件数順' : '金額順'})
          </h3>
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
    </div>
  )
}
