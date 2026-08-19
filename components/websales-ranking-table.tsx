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
  channel_counts: Record<EcChannel, number>
  channel_amounts: Record<EcChannel, number>
}

type SortType = 'count' | 'amount';
type TrendData = { month_label: string; sales: number; }
const EC_CHANNELS = ['amazon', 'rakuten', 'yahoo', 'mercari', 'base', 'qoo10', 'tiktok'] as const
type EcChannel = typeof EC_CHANNELS[number]
type RankingChannel = 'total' | EcChannel

const CHANNEL_OPTIONS: Array<{ key: RankingChannel; label: string }> = [
  { key: 'total', label: '総合' },
  { key: 'amazon', label: 'Amazon' },
  { key: 'rakuten', label: '楽天' },
  { key: 'yahoo', label: 'Yahoo' },
  { key: 'mercari', label: 'メルカリ' },
  { key: 'base', label: 'BASE' },
  { key: 'qoo10', label: 'Qoo10' },
  { key: 'tiktok', label: 'TikTok' },
]

export default function WebSalesRankingTable({ month }: Props) {
  const supabase = getSupabaseBrowserClient();
  const [bestRows, setBestRows] = useState<Row[]>([])
  const [worstRows, setWorstRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<SortType>('count')
  const [activeChannel, setActiveChannel] = useState<RankingChannel>('total')
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
        const map = new Map<string, {
          id: string
          count: number
          amount: number
          channelCounts: Record<EcChannel, number>
          channelAmounts: Record<EcChannel, number>
        }>()
        const nameToId: Record<string, string> = {}

        data.forEach((row: any) => {
          const name = row.product_name || row.name || ""
          const id = row.product_id || ""
          const price = typeof row.price === 'number' ? row.price :
            (parseFloat(row.price) || 0)

          const channelCounts: Record<EcChannel, number> = {
            amazon: Number(row.amazon_count) || 0,
            rakuten: Number(row.rakuten_count) || 0,
            yahoo: Number(row.yahoo_count) || 0,
            mercari: Number(row.mercari_count) || 0,
            base: Number(row.base_count) || 0,
            qoo10: Number(row.qoo10_count) || 0,
            tiktok: Number(row.tiktok_count) || 0,
          }
          const count = EC_CHANNELS.reduce((sum, channel) => sum + channelCounts[channel], 0)

          if (!map.has(name)) {
            map.set(name, {
              id,
              count: 0,
              amount: 0,
              channelCounts: {
                amazon: 0,
                rakuten: 0,
                yahoo: 0,
                mercari: 0,
                base: 0,
                qoo10: 0,
                tiktok: 0,
              },
              channelAmounts: {
                amazon: 0,
                rakuten: 0,
                yahoo: 0,
                mercari: 0,
                base: 0,
                qoo10: 0,
                tiktok: 0,
              },
            })
          }
          const entry = map.get(name)!
          entry.count += count

          const itemAmount = count * price
          entry.amount += itemAmount
          for (const channel of EC_CHANNELS) {
            entry.channelCounts[channel] += channelCounts[channel]
            entry.channelAmounts[channel] += channelCounts[channel] * price
          }

          if (id) nameToId[name] = id
        })

        setProductNameMap(nameToId)

        const arr: Row[] = Array.from(map.entries()).map(([product_name, v]) => ({
          product_id: v.id,
          product_name,
          total_count: v.count,
          total_amount: v.amount,
          channel_counts: v.channelCounts,
          channel_amounts: v.channelAmounts,
        }))

        setOriginalData(arr)
        sortAndSetData(arr, sortBy, activeChannel)

      } catch (error) {
        console.error("🚨 ランキング処理エラー:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [month])

  const getMetric = (row: Row, channel: RankingChannel, sortType: SortType) => {
    if (channel === 'total') {
      return sortType === 'count' ? row.total_count : row.total_amount
    }
    return sortType === 'count' ? row.channel_counts[channel] : row.channel_amounts[channel]
  }

  const sortAndSetData = (data: Row[], sortType: SortType, channel: RankingChannel) => {
    const desc = [...data]
      .filter(row => getMetric(row, channel, 'count') > 0)
      .sort((a, b) => getMetric(b, channel, sortType) - getMetric(a, channel, sortType))

    const asc = [...data]
      .filter(row => getMetric(row, channel, 'count') > 0)
      .sort((a, b) => getMetric(a, channel, sortType) - getMetric(b, channel, sortType))

    setBestRows(desc.slice(0, 10))
    setWorstRows(asc.slice(0, 10))
  }

  useEffect(() => {
    if (originalData.length > 0) {
      sortAndSetData(originalData, sortBy, activeChannel)
    }
  }, [sortBy, originalData, activeChannel])

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
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
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
    const channel = activeChannel
    const channelLabel = CHANNEL_OPTIONS.find(option => option.key === channel)?.label || '総合'
    const title = isBest ? `${channelLabel} TOP10` : `${channelLabel} ワースト10`
    const titleColor = isBest ? 'text-green-700' : 'text-red-700'
    const headerBg = isBest ? 'bg-green-50' : 'bg-red-50'
    const hoverBg = isBest ? 'hover:bg-green-50' : 'hover:bg-red-50'

    return (
      <div className="min-w-0">
        <h3 className={`font-semibold mb-3 ${titleColor}`}>
          {title} ({sortBy === 'count' ? '件数順' : '金額順'})
        </h3>
        <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full min-w-[620px] border-collapse text-xs">
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
                  <td className="border px-1 py-1 text-xs">
                    {f(channel === 'total' ? r.total_count : r.channel_counts[channel])}
                  </td>
                  <td className="border px-1 py-1 text-xs">
                    ¥{f(Math.round(channel === 'total' ? r.total_amount : r.channel_amounts[channel]))}
                  </td>
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

  return (
    <div className="space-y-4 relative" ref={containerRef}>
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">売上TOP10サマリー</h2>
          <p className="mt-1 text-xs text-slate-500">総合またはEC別の商品ランキング</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600">並び順</span>
          <div className="inline-flex rounded-md border border-slate-200 bg-slate-100 p-1">
            <button
              onClick={() => handleSortChange('count')}
              className={`rounded px-3 py-1 text-sm ${sortBy === 'count'
                  ? 'bg-white font-semibold text-slate-900 shadow-sm'
                  : 'text-gray-600 hover:text-slate-900'
                }`}
            >
              件数順
            </button>
            <button
              onClick={() => handleSortChange('amount')}
              className={`rounded px-3 py-1 text-sm ${sortBy === 'amount'
                  ? 'bg-white font-semibold text-slate-900 shadow-sm'
                  : 'text-gray-600 hover:text-slate-900'
                }`}
            >
              金額順
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto pb-1" role="tablist" aria-label="売上ランキングのEC">
        <div className="inline-flex min-w-max rounded-md border border-slate-200 bg-slate-100 p-1">
          {CHANNEL_OPTIONS.map(option => (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={activeChannel === option.key}
              onClick={() => setActiveChannel(option.key)}
              className={`rounded px-3 py-1.5 text-sm transition ${
                activeChannel === option.key
                  ? 'bg-slate-900 font-semibold text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
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
