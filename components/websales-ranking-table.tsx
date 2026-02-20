// /components/websales-ranking-table.tsx ver.5 (ホバートレンド対応版)
"use client"

import { useEffect, useState, useRef } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"

interface Props {
  month: string
}

interface Row {
  product_id: string
  product_name: string
  total_count: number
  total_amount: number
}

type SortType = 'count' | 'amount';
type TrendData = { month_label: string; sales: number; }

export default function WebSalesRankingTable({ month }: Props) {
  const supabase = getSupabaseBrowserClient();
  const [bestRows, setBestRows] = useState<Row[]>([])
  const [worstRows, setWorstRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortType>('count')
  const [originalData, setOriginalData] = useState<Row[]>([])

  // ホバートレンド関連
  const [hoveredProductId, setHoveredProductId] = useState<string | null>(null)
  const [trendData, setTrendData] = useState<Record<string, TrendData[]>>({})
  const [trendLoading, setTrendLoading] = useState<Record<string, boolean>>({})
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // 商品名からIDを引けるようにするマップ
  const [productNameMap, setProductNameMap] = useState<Record<string, string>>({})

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)

      try {
        const { data, error } = await supabase.rpc("web_sales_full_month", {
          target_month: month
        })

        if (error) {
          console.error("🚨 ランキングデータ取得エラー:", error)
          return
        }

        if (!data || data.length === 0) {
          setOriginalData([])
          setBestRows([])
          setWorstRows([])
          return
        }

        // 商品ごとに集計（product_idも保持）
        const map = new Map<string, { id: string; count: number; amount: number }>()
        const nameToId: Record<string, string> = {}

        data.forEach((row: any) => {
          const name = row.product_name || row.name || ""
          const id = row.product_id || ""
          const price = typeof row.price === 'number' ? row.price :
            (parseFloat(row.price) || 0)

          const count =
            (row.amazon_count || 0) +
            (row.rakuten_count || 0) +
            (row.yahoo_count || 0) +
            (row.mercari_count || 0) +
            (row.base_count || 0) +
            (row.qoo10_count || 0) +
            (row.tiktok_count || 0)

          if (!map.has(name)) {
            map.set(name, { id, count: 0, amount: 0 })
          }
          const entry = map.get(name)!
          entry.count += count

          const itemAmount = count * price
          entry.amount += itemAmount

          if (id) nameToId[name] = id
        })

        setProductNameMap(nameToId)

        const arr: Row[] = Array.from(map.entries()).map(([product_name, v]) => ({
          product_id: v.id,
          product_name,
          total_count: v.count,
          total_amount: v.amount,
        }))

        setOriginalData(arr)
        sortAndSetData(arr, sortBy)

      } catch (error) {
        console.error("🚨 ランキング処理エラー:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [month])

  const sortAndSetData = (data: Row[], sortType: SortType) => {
    const sortFunc = (a: Row, b: Row) => {
      if (sortType === 'count') {
        return b.total_count - a.total_count
      } else {
        return b.total_amount - a.total_amount
      }
    }

    const sortFuncAsc = (a: Row, b: Row) => {
      if (sortType === 'count') {
        if (a.total_count === 0) return 1;
        if (b.total_count === 0) return -1;
        return a.total_count - b.total_count
      } else {
        if (a.total_amount === 0) return 1;
        if (b.total_amount === 0) return -1;
        return a.total_amount - b.total_amount
      }
    }

    const desc = [...data].sort(sortFunc)
    const asc = [...data].sort(sortFuncAsc)
      .filter(row => sortType === 'count' ? row.total_count > 0 : row.total_amount > 0);

    setBestRows(desc.slice(0, 10))
    setWorstRows(asc.slice(0, 10))
  }

  useEffect(() => {
    if (originalData.length > 0) {
      sortAndSetData(originalData, sortBy)
    }
  }, [sortBy, originalData])

  const handleSortChange = (type: SortType) => {
    setSortBy(type)
  }

  // トレンドデータ取得
  const fetchTrendData = async (productId: string) => {
    if (trendData[productId] || trendLoading[productId]) return

    setTrendLoading(prev => ({ ...prev, [productId]: true }))

    try {
      const targetMonth = month ? `${month}-01` : (() => {
        const now = new Date()
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      })()

      const { data, error } = await supabase.rpc('get_product_trend_data', {
        target_month: targetMonth,
        target_product_id: productId
      })

      if (error) throw error
      setTrendData(prev => ({ ...prev, [productId]: data || [] }))
    } catch (error) {
      console.error(`トレンドデータの取得に失敗しました (${productId}):`, error)
      setTrendData(prev => ({ ...prev, [productId]: [] }))
    } finally {
      setTrendLoading(prev => ({ ...prev, [productId]: false }))
    }
  }

  // マウスホバー処理
  const handleMouseEnter = (productId: string, event: React.MouseEvent) => {
    if (!productId) return
    setHoveredProductId(productId)
    fetchTrendData(productId)

    if (containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect()
      const relativeX = event.clientX - containerRect.left
      const relativeY = event.clientY - containerRect.top

      setTooltipPosition({
        top: relativeY + 15,
        left: Math.min(relativeX - 50, containerRect.width - 320)
      })
    }
  }

  const handleMouseLeave = () => {
    setHoveredProductId(null)
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

  const renderTable = (rows: Row[], type: 'best' | 'worst') => {
    const isBest = type === 'best'
    const title = isBest ? '🏆 ベスト10' : '📉 ワースト10'
    const titleColor = isBest ? 'text-green-700' : 'text-red-700'
    const headerBg = isBest ? 'bg-green-50' : 'bg-red-50'
    const hoverBg = isBest ? 'hover:bg-green-50' : 'hover:bg-red-50'

    return (
      <div>
        <h3 className={`font-semibold mb-3 ${titleColor}`}>
          {title} ({sortBy === 'count' ? '件数順' : '金額順'})
        </h3>
        <table className="min-w-full text-xs border">
          <thead className={headerBg}>
            <tr>
              <th className="border px-1 py-1 w-12">順位</th>
              <th className="border px-2 py-1">商品名</th>
              <th className="border px-1 py-1 w-16">件数</th>
              <th className="border px-1 py-1 w-20">売上金額</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((r, i) => (
                <tr key={`${type}-${i}-${r.product_name}`} className={`text-center ${hoverBg}`}>
                  <td className="border px-1 py-1 font-medium">{i + 1}</td>
                  <td
                    className="border px-2 py-1 text-left text-xs cursor-pointer hover:text-blue-600 hover:underline"
                    onMouseEnter={(e) => handleMouseEnter(r.product_id, e)}
                    onMouseLeave={handleMouseLeave}
                  >
                    {r.product_name}
                  </td>
                  <td className="border px-1 py-1 text-xs">{f(r.total_count)}</td>
                  <td className="border px-1 py-1 text-xs">¥{f(Math.round(r.total_amount))}</td>
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
    )
  }

  return (
    <div className="space-y-4 relative" ref={containerRef}>
      {/* 並び替えボタン */}
      <div className="flex justify-end space-x-2 items-center text-sm">
        <span className="text-gray-600">並び順:</span>
        <button
          onClick={() => handleSortChange('count')}
          className={`px-3 py-1 rounded text-sm ${sortBy === 'count'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
        >
          件数順
        </button>
        <button
          onClick={() => handleSortChange('amount')}
          className={`px-3 py-1 rounded text-sm ${sortBy === 'amount'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
        >
          金額順
        </button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {renderTable(bestRows, 'best')}
        {renderTable(worstRows, 'worst')}
      </div>

      {/* ホバー時のトレンドツールチップ */}
      {hoveredProductId && (
        <div
          className="absolute z-50 bg-white border-2 border-gray-300 rounded-lg shadow-xl p-4 w-72"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            pointerEvents: 'none',
          }}
        >
          <div className="text-sm font-semibold mb-2 text-gray-800">
            {(() => {
              const row = [...bestRows, ...worstRows].find(r => r.product_id === hoveredProductId)
              return row?.product_name || ''
            })()} - 過去6ヶ月 売上推移
          </div>

          {trendLoading[hoveredProductId] ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-500"></div>
              <span className="ml-3 text-sm text-gray-500">トレンド読込中...</span>
            </div>
          ) : trendData[hoveredProductId] && trendData[hoveredProductId].length > 0 ? (
            <div className="space-y-1.5">
              {trendData[hoveredProductId].map((trend, index) => {
                const maxSales = Math.max(...trendData[hoveredProductId].map(t => t.sales))
                const barWidth = maxSales > 0 ? (trend.sales / maxSales) * 100 : 0

                return (
                  <div key={index} className="flex items-center justify-between text-xs">
                    <span className="w-16 text-gray-600 text-left">{trend.month_label}</span>
                    <div className="flex-1 mx-2 h-4 bg-gray-100 rounded-sm overflow-hidden border border-gray-200">
                      <div
                        className="h-full bg-blue-400 transition-all duration-300"
                        style={{ width: `${barWidth}%` }}
                      ></div>
                    </div>
                    <span className="w-20 text-right text-gray-800 font-mono">
                      ¥{f(trend.sales)}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-sm text-gray-500 text-center h-24 flex items-center justify-center">
              トレンドデータがありません
            </div>
          )}
        </div>
      )}
    </div>
  )
}
