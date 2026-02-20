// /components/WebSalesDataTable.tsx ver.15 (新規登録ボタン復活版)
"use client"

import React, { useState, useRef, useEffect } from "react"
import { Input } from "@nextui-org/react"
import { WebSalesData } from "@/types/db"
import { Plus, Trash2, TrendingUp, TrendingDown, Edit } from "lucide-react"
import ProductAddModal from "./ProductAddModal"
import ProductEditModal from "./ProductEditModal"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"

interface WebSalesDataTableProps {
  filteredItems: WebSalesData[]
  editMode: { [key: string]: boolean }
  editedValue: string
  getProductName: (productId: string) => string
  getProductPrice: (productId: string) => number
  getProductProfitRate?: (productId: string) => number
  getProductSeriesCode?: (productId: string) => number
  onEdit: (productId: string, ecSite: string) => void
  onSave: (productId: string, ecSite: string) => void
  onEditValueChange: (value: string) => void
  onCancel: () => void
  productMaster?: any[]
  onRefresh?: () => void
  onChannelDelete?: (channel: string) => void
  isHistoricalMode?: boolean
  historicalPriceData?: any[]
  month?: string
}

type TrendData = { month_label: string; sales: number; }
type SiteTrendData = { month_label: string; count: number; }
type AdCostData = { series_code: number; total_ad_cost: number; }

export default function WebSalesDataTable({
  filteredItems,
  editMode,
  editedValue,
  getProductName,
  getProductPrice,
  getProductProfitRate,
  getProductSeriesCode,
  onEdit,
  onSave,
  onEditValueChange,
  onCancel,
  productMaster = [],
  onRefresh,
  onChannelDelete,
  isHistoricalMode = false,
  historicalPriceData = [],
  month,
}: WebSalesDataTableProps) {
  const supabase = getSupabaseBrowserClient();
  const [isAddingProduct, setIsAddingProduct] = useState(false)
  const [isEditingProduct, setIsEditingProduct] = useState(false)
  const [editingProductData, setEditingProductData] = useState<any>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // 商品名トレンド表示関連のState
  const [hoveredProductId, setHoveredProductId] = useState<string | null>(null)
  const [trendData, setTrendData] = useState<Record<string, TrendData[]>>({})
  const [trendLoading, setTrendLoading] = useState<Record<string, boolean>>({})

  // ECサイト別トレンド表示関連のState
  const [hoveredSiteCell, setHoveredSiteCell] = useState<string | null>(null)
  const [siteTrendData, setSiteTrendData] = useState<Record<string, SiteTrendData[]>>({})
  const [siteTrendLoading, setSiteTrendLoading] = useState<Record<string, boolean>>({})

  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // 広告費データ
  const [adCostData, setAdCostData] = useState<AdCostData[]>([])

  // 広告費データを取得
  useEffect(() => {
    const fetchAdCostData = async () => {
      if (!month) return

      try {
        const { data, error } = await supabase
          .from('advertising_costs')
          .select('series_code, amazon_cost, google_cost, other_cost, rakuten_cost, yahoo_cost')
          .eq('report_month', `${month}-01`)

        if (error) throw error

        // 楽天・Yahoo広告費の均等配分を計算
        const seriesCount = new Set(productMaster.map(p => p.series_code)).size || 1
        const totalRakutenCost = data?.reduce((sum, item) => sum + (item.rakuten_cost || 0), 0) || 0
        const totalYahooCost = data?.reduce((sum, item) => sum + (item.yahoo_cost || 0), 0) || 0
        const rakutenPerSeries = Math.round(totalRakutenCost / seriesCount)
        const yahooPerSeries = Math.round(totalYahooCost / seriesCount)

        // シリーズごとの合計広告費を計算
        const adCostBySeriesMap = new Map<number, number>()

        data?.forEach(item => {
          const totalCost = (item.amazon_cost || 0) +
            (item.google_cost || 0) +
            (item.other_cost || 0) +
            rakutenPerSeries +
            yahooPerSeries
          adCostBySeriesMap.set(item.series_code, totalCost)
        })

        const formattedData: AdCostData[] = Array.from(adCostBySeriesMap.entries()).map(([series_code, total_ad_cost]) => ({
          series_code,
          total_ad_cost
        }))

        setAdCostData(formattedData)
      } catch (error) {
        console.error('広告費データの取得に失敗しました:', error)
      }
    }

    fetchAdCostData()
  }, [month, productMaster])

  // シリーズコードから広告費を取得
  const getAdCostForProduct = (productId: string): number => {
    const seriesCode = getProductSeriesCode ? getProductSeriesCode(productId) : 0
    const adCost = adCostData.find(item => item.series_code === seriesCode)
    return adCost?.total_ad_cost || 0
  }

  // 過去価格データから価格差情報を取得
  const getPriceDifferenceInfo = (productId: string) => {
    if (!isHistoricalMode || !historicalPriceData) return null
    const data = historicalPriceData.find(item => item.product_id === productId)
    if (!data) return null

    return {
      currentPrice: data.current_price,
      historicalPrice: data.historical_price,
      currentProfitRate: data.current_profit_rate,
      historicalProfitRate: data.historical_profit_rate,
      difference: data.price_difference,
      differencePercent: data.current_price > 0
        ? ((data.current_price - data.historical_price) / data.current_price * 100).toFixed(1)
        : '0'
    }
  }

  // 現在の月を取得（"YYYY-MM" 形式）
  const getCurrentMonth = () => {
    if (month) return month
    const now = new Date()
    const year = now.getFullYear()
    const monthNum = String(now.getMonth() + 1).padStart(2, '0')
    return `${year}-${monthNum}`
  }

  // 商品トレンドデータを取得する関数
  const fetchTrendData = async (productId: string) => {
    if (trendData[productId] || trendLoading[productId]) return

    setTrendLoading(prev => ({ ...prev, [productId]: true }))

    try {
      const currentMonth = getCurrentMonth()
      const { data, error } = await supabase.rpc('get_product_trend_data', {
        target_month: currentMonth,
        target_product_id: productId
      })

      if (error) {
        throw error
      }

      setTrendData(prev => ({ ...prev, [productId]: data || [] }))

    } catch (error) {
      console.error(`商品トレンドデータの取得に失敗しました (${productId}):`, error)
      setTrendData(prev => ({ ...prev, [productId]: [] }))
    } finally {
      setTrendLoading(prev => ({ ...prev, [productId]: false }))
    }
  }

  // ECサイト別トレンドデータを取得する関数
  const fetchSiteTrendData = async (productId: string, siteKey: string) => {
    // siteKey は "amazon_count" 形式。hoveredSiteCell と同じキー形式で統一
    const key = `${productId}-${siteKey}`
    if (siteTrendData[key] || siteTrendLoading[key]) return

    setSiteTrendLoading(prev => ({ ...prev, [key]: true }))

    try {
      // DB関数は内部で target_site || '_count' するため、"YYYY-MM" 形式 + サイト名のみ渡す
      const targetMonth = month || (() => {
        const now = new Date()
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      })()
      const rpcSiteName = siteKey.replace('_count', '')
      const { data, error } = await supabase.rpc('get_product_site_trend_data', {
        target_month: targetMonth,
        target_product_id: productId,
        target_site: rpcSiteName
      })

      if (error) {
        throw error
      }

      setSiteTrendData(prev => ({ ...prev, [key]: data || [] }))

    } catch (error) {
      console.error(`ECサイト別トレンドデータの取得に失敗しました (${key}):`, error)
      setSiteTrendData(prev => ({ ...prev, [key]: [] }))
    } finally {
      setSiteTrendLoading(prev => ({ ...prev, [key]: false }))
    }
  }

  // マウスホバー処理（商品名）
  const handleProductNameMouseEnter = (productId: string, event: React.MouseEvent) => {
    setHoveredProductId(productId)
    fetchTrendData(productId)
    updateTooltipPosition(event)
  }

  // マウスホバー処理（ECサイトセル）
  const handleSiteMouseEnter = (productId: string, siteKey: string, event: React.MouseEvent) => {
    const key = `${productId}-${siteKey}`
    setHoveredSiteCell(key)
    fetchSiteTrendData(productId, siteKey)
    updateTooltipPosition(event)
  }

  // マウスリーブ処理
  const handleMouseLeave = () => {
    setHoveredProductId(null)
    setHoveredSiteCell(null)
  }

  // ツールチップの位置を更新
  const updateTooltipPosition = (event: React.MouseEvent) => {
    if (!containerRef.current) return

    const containerRect = containerRef.current.getBoundingClientRect()
    const relativeX = event.clientX - containerRect.left
    const relativeY = event.clientY - containerRect.top

    setTooltipPosition({
      top: relativeY + 15,
      left: relativeX - 140
    })
  }

  const formatNumber = (num: number) => {
    return num.toLocaleString('ja-JP')
  }

  const handleAddProduct = async (productData: { productName: string; price: number; seriesNumber: number; productNumber: number; seriesName: string; profitRate: number }) => {
    try {
      const { data, error } = await supabase
        .from('products')
        .insert({
          name: productData.productName,
          price: productData.price,
          series_code: productData.seriesNumber,
          product_code: productData.productNumber,
          series: productData.seriesName,
          profit_rate: productData.profitRate,
        })
        .select()

      if (error) throw error

      alert('商品を追加しました')
      setIsAddingProduct(false)
      if (onRefresh) onRefresh()
    } catch (error) {
      console.error('商品追加エラー:', error)
      alert('商品の追加に失敗しました')
    }
  }

  const handleEditProduct = async (productId: string) => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single()

      if (error) throw error

      setEditingProductData(data)
      setIsEditingProduct(true)
    } catch (error) {
      console.error('商品データ取得エラー:', error)
      alert('商品データの取得に失敗しました')
    }
  }

  const handleUpdateProduct = async (updatedProduct: {
    id: string
    name: string
    price: number
    profit_rate: number
    series_code: number
    product_code: number
    series: string
  }) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({
          name: updatedProduct.name,
          price: updatedProduct.price,
          series: updatedProduct.series,
          series_code: updatedProduct.series_code,
          product_code: updatedProduct.product_code,
          profit_rate: updatedProduct.profit_rate,
        })
        .eq('id', updatedProduct.id)

      if (error) throw error

      alert('商品情報を更新しました')
      setIsEditingProduct(false)
      setEditingProductData(null)
      if (onRefresh) onRefresh()
    } catch (error) {
      console.error('商品更新エラー:', error)
      alert('商品情報の更新に失敗しました')
    }
  }

  const handleDeleteProduct = async (productId: string) => {
    const productName = getProductName(productId)

    if (!confirm(`商品「${productName}」を削除しますか？\n\n※ 関連するすべての販売データも削除されます`)) {
      return
    }

    setIsDeleting(true)
    try {
      const { error: productError } = await supabase
        .from('products')
        .delete()
        .eq('id', productId)

      if (productError) throw productError

      alert(`商品「${productName}」を削除しました`)
      if (onRefresh) onRefresh()
    } catch (error) {
      console.error('削除エラー:', error)
      alert('商品の削除に失敗しました')
    } finally {
      setIsDeleting(false)
    }
  }

  const sites = [
    { key: 'amazon_count', label: 'Amazon', bgColor: 'bg-orange-100' },
    { key: 'rakuten_count', label: '楽天', bgColor: 'bg-red-100' },
    { key: 'yahoo_count', label: 'Yahoo', bgColor: 'bg-purple-100' },
    { key: 'mercari_count', label: 'メルカリ', bgColor: 'bg-sky-100' },
    { key: 'base_count', label: 'BASE', bgColor: 'bg-green-100' },
    { key: 'qoo10_count', label: 'Qoo10', bgColor: 'bg-pink-100' },
    { key: 'tiktok_count', label: 'TikTok', bgColor: 'bg-teal-100' },
  ]

  const siteNames: Record<string, string> = {
    'amazon_count': 'Amazon',
    'rakuten_count': '楽天',
    'yahoo_count': 'Yahoo',
    'mercari_count': 'メルカリ',
    'base_count': 'BASE',
    'qoo10_count': 'Qoo10',
    'tiktok_count': 'TikTok',
  }

  return (
    <div ref={containerRef} className="relative">
      {/* 🆕 新規登録ボタンを追加 */}
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setIsAddingProduct(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          新規登録
        </button>
      </div>

      <div className="overflow-auto border border-gray-300 rounded-lg">
        <div className="inline-block min-w-full align-middle">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 tracking-wider w-[150px]">
                  商品名
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 tracking-wider whitespace-nowrap">
                  価格<br />
                  {isHistoricalMode && <span className="text-amber-600 text-[10px]">(過去価格)</span>}
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 tracking-wider whitespace-nowrap">
                  利益率<br />
                  {isHistoricalMode && <span className="text-amber-600 text-[10px]">(過去)</span>}
                </th>
                {sites.map(site => (
                  <th key={site.key} className={`px-4 py-3 text-center text-xs font-semibold text-gray-700 tracking-wider whitespace-nowrap ${site.bgColor}`}>
                    {site.label}
                  </th>
                ))}
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 tracking-wider whitespace-nowrap">
                  合計
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 tracking-wider whitespace-nowrap">
                  売上金額
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 tracking-wider whitespace-nowrap">
                  広告費
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 tracking-wider whitespace-nowrap">
                  最終利益
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 tracking-wider whitespace-nowrap">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={sites.length + 7} className="px-6 py-12 text-center text-gray-500">
                    データがありません
                  </td>
                </tr>
              ) : (
                filteredItems.map((row) => {
                  const price = getProductPrice(row.product_id)
                  const profitRate = getProductProfitRate ? getProductProfitRate(row.product_id) : 0
                  const priceDiff = getPriceDifferenceInfo(row.product_id)

                  const totalCount = sites.reduce((sum, site) => sum + ((row as any)[site.key] || 0), 0)
                  const totalAmount = totalCount * price
                  const profitAmount = Math.round(totalAmount * (profitRate / 100))
                  const adCost = getAdCostForProduct(row.product_id)
                  const finalProfit = profitAmount - adCost

                  return (
                    <tr key={row.product_id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 text-sm text-gray-900">
                        <div
                          className="font-medium cursor-pointer hover:text-blue-600 hover:underline"
                          onMouseEnter={(e) => handleProductNameMouseEnter(row.product_id, e)}
                          onMouseLeave={handleMouseLeave}
                        >
                          {getProductName(row.product_id)}
                        </div>
                      </td>
                      <td className={`px-4 py-4 text-center ${isHistoricalMode && priceDiff && priceDiff.difference !== 0
                        ? 'bg-amber-50'
                        : ''
                        }`}>
                        <div className="flex flex-col items-center">
                          <span>¥{formatNumber(price)}</span>
                          {isHistoricalMode && priceDiff && priceDiff.difference !== 0 && (
                            <div className="flex items-center gap-1 text-xs mt-1">
                              {priceDiff.difference > 0 ? (
                                <>
                                  <TrendingUp className="h-3 w-3 text-green-600" />
                                  <span className="text-green-600">
                                    +¥{formatNumber(priceDiff.difference)} ({priceDiff.differencePercent}%)
                                  </span>
                                </>
                              ) : (
                                <>
                                  <TrendingDown className="h-3 w-3 text-red-600" />
                                  <span className="text-red-600">
                                    ¥{formatNumber(priceDiff.difference)} ({priceDiff.differencePercent}%)
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className={`px-4 py-4 text-center ${isHistoricalMode && priceDiff &&
                        priceDiff.currentProfitRate !== priceDiff.historicalProfitRate
                        ? 'bg-amber-50'
                        : ''
                        }`}>
                        <div className="flex flex-col items-center">
                          <span>{profitRate}%</span>
                          {isHistoricalMode && priceDiff &&
                            priceDiff.currentProfitRate !== priceDiff.historicalProfitRate && (
                              <div className="flex items-center gap-1 text-xs mt-1">
                                {(priceDiff.currentProfitRate || 0) > (priceDiff.historicalProfitRate || 0) ? (
                                  <>
                                    <TrendingUp className="h-3 w-3 text-green-600" />
                                    <span className="text-green-600">
                                      +{((priceDiff.currentProfitRate || 0) - (priceDiff.historicalProfitRate || 0)).toFixed(1)}%
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <TrendingDown className="h-3 w-3 text-red-600" />
                                    <span className="text-red-600">
                                      {((priceDiff.currentProfitRate || 0) - (priceDiff.historicalProfitRate || 0)).toFixed(1)}%
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                        </div>
                      </td>
                      {sites.map(site => {
                        const count = (row as any)[site.key] || 0
                        const cellKey = `${row.product_id}-${site.key}`

                        return (
                          <td
                            key={site.key}
                            className={`px-4 py-4 text-center ${site.bgColor} cursor-pointer hover:opacity-80`}
                            onMouseEnter={(e) => handleSiteMouseEnter(row.product_id, site.key, e)}
                            onMouseLeave={handleMouseLeave}
                          >
                            {editMode[cellKey] ? (
                              <div className="flex items-center justify-center gap-1">
                                <Input
                                  type="number"
                                  value={editedValue}
                                  onChange={(e) => onEditValueChange(e.target.value)}
                                  className="w-16 h-8 text-center"
                                  size="sm"
                                  autoFocus
                                />
                                <button onClick={() => onSave(row.product_id, site.key)} className="text-green-600 hover:text-green-800 text-sm">
                                  ✓
                                </button>
                                <button onClick={onCancel} className="text-red-600 hover:text-red-800 text-sm">
                                  ✗
                                </button>
                              </div>
                            ) : (
                              <span onClick={() => onEdit(row.product_id, site.key)}>
                                {count}
                              </span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-4 py-4 text-center font-semibold">
                        {totalCount}
                      </td>
                      <td className="px-4 py-4 text-center font-semibold">
                        ¥{formatNumber(totalAmount)}
                      </td>
                      <td className="px-4 py-4 text-center text-red-600 font-semibold">
                        ¥{formatNumber(adCost)}
                      </td>
                      <td className={`px-4 py-4 text-center font-semibold ${finalProfit >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                        ¥{formatNumber(finalProfit)}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleEditProduct(row.product_id)}
                            className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                            title="変更"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(row.product_id)}
                            disabled={isDeleting}
                            className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                            title="削除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 商品名ホバー時のツールチップ */}
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
            {getProductName(hoveredProductId)} - 過去6ヶ月 売上推移
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
                      ¥{formatNumber(trend.sales)}
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

      {/* ECサイト別ホバー時のツールチップ */}
      {hoveredSiteCell && (
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
              const lastDash = hoveredSiteCell.lastIndexOf('-')
              const productId = hoveredSiteCell.substring(0, lastDash)
              const site = hoveredSiteCell.substring(lastDash + 1)
              const siteName = siteNames[site as keyof typeof siteNames]
              return `${getProductName(productId)} - ${siteName} 過去6ヶ月 販売個数`
            })()}
          </div>

          {siteTrendLoading[hoveredSiteCell] ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-500"></div>
              <span className="ml-3 text-sm text-gray-500">トレンド読込中...</span>
            </div>
          ) : siteTrendData[hoveredSiteCell] && siteTrendData[hoveredSiteCell].length > 0 ? (
            <div className="space-y-1.5">
              {siteTrendData[hoveredSiteCell].map((trend, index) => {
                const maxCount = Math.max(...siteTrendData[hoveredSiteCell].map(t => t.count))
                const barWidth = maxCount > 0 ? (trend.count / maxCount) * 100 : 0

                return (
                  <div key={index} className="flex items-center justify-between text-xs">
                    <span className="w-16 text-gray-600 text-left">{trend.month_label}</span>
                    <div className="flex-1 mx-2 h-4 bg-gray-100 rounded-sm overflow-hidden border border-gray-200">
                      <div
                        className="h-full bg-green-400 transition-all duration-300"
                        style={{ width: `${barWidth}%` }}
                      ></div>
                    </div>
                    <span className="w-20 text-right text-gray-800 font-mono">
                      {formatNumber(trend.count)}個
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

      {/* 🔥 商品追加モーダル */}
      {isAddingProduct && (
        <ProductAddModal
          isOpen={isAddingProduct}
          onClose={() => setIsAddingProduct(false)}
          onAdd={handleAddProduct}
          existingProducts={productMaster.map(p => ({
            seriesNumber: p.series_code,
            productNumber: p.product_code,
            name: p.name,
            seriesName: p.series
          }))}
        />
      )}

      {/* 🔥 商品編集モーダル */}
      {isEditingProduct && editingProductData && (
        <ProductEditModal
          isOpen={isEditingProduct}
          onClose={() => {
            setIsEditingProduct(false)
            setEditingProductData(null)
          }}
          onUpdate={handleUpdateProduct}
          product={editingProductData}
        />
      )}
    </div>
  )
}
