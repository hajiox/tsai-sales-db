// /components/WebSalesDataTable.tsx ver.18 (商品番号表示＋ドラッグ並び替え)
"use client"

import React, { useState, useRef, useEffect, useMemo } from "react"
import { Input } from "@nextui-org/react"
import { WebSalesData } from "@/types/db"
import { Plus, Trash2, Edit, EyeOff, Link2, ChevronRight, ChevronDown, ChevronsUpDown, GripVertical, Search, X } from "lucide-react"
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
  getProductSeries?: (productId: string) => string
  getProductProductCode?: (productId: string) => number
  onEdit: (productId: string, ecSite: string) => void
  onSave: (productId: string, ecSite: string) => void
  onEditValueChange: (value: string) => void
  onCancel: () => void
  productMaster?: any[]
  onRefresh?: () => void
  onChannelDelete?: (channel: string) => void
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
  getProductSeries,
  getProductProductCode,
  onEdit,
  onSave,
  onEditValueChange,
  onCancel,
  productMaster = [],
  onRefresh,
  onChannelDelete,
  month,
}: WebSalesDataTableProps) {
  const supabase = getSupabaseBrowserClient();
  const [isAddingProduct, setIsAddingProduct] = useState(false)
  const [isEditingProduct, setIsEditingProduct] = useState(false)
  const [editingProductData, setEditingProductData] = useState<any>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // 商品検索
  const [searchQuery, setSearchQuery] = useState('')

  // ドラッグ並び替え用
  const [dragProductId, setDragProductId] = useState<string | null>(null)
  const [dragOverProductId, setDragOverProductId] = useState<string | null>(null)
  const [isDragSaving, setIsDragSaving] = useState(false)

  const handleDragStart = (e: React.DragEvent, productId: string) => {
    setDragProductId(productId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', productId)
  }

  const handleDragOver = (e: React.DragEvent, productId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverProductId(productId)
  }

  const handleDragLeave = () => {
    setDragOverProductId(null)
  }

  const handleDrop = async (e: React.DragEvent, targetProductId: string, seriesItems: WebSalesData[]) => {
    e.preventDefault()
    setDragOverProductId(null)
    const sourceProductId = dragProductId
    setDragProductId(null)

    if (!sourceProductId || sourceProductId === targetProductId) return

    // 並び順を計算（現在のアイテム順序に基づいて）
    const ordered = [...seriesItems]
    const fromIdx = ordered.findIndex(r => r.product_id === sourceProductId)
    const toIdx = ordered.findIndex(r => r.product_id === targetProductId)
    if (fromIdx === -1 || toIdx === -1) return

    // 移動
    const [moved] = ordered.splice(fromIdx, 1)
    ordered.splice(toIdx, 0, moved)

    // product_codeを1から連番で振り直し
    setIsDragSaving(true)
    try {
      const updates = ordered.map((item, idx) => ({
        id: item.product_id,
        product_code: idx + 1,
      }))

      for (const u of updates) {
        await supabase
          .from('products')
          .update({ product_code: u.product_code })
          .eq('id', u.id)
      }

      if (onRefresh) onRefresh()
    } catch (err) {
      console.error('並び替え保存エラー:', err)
      alert('並び替えの保存に失敗しました')
    } finally {
      setIsDragSaving(false)
    }
  }

  const handleDragEnd = () => {
    setDragProductId(null)
    setDragOverProductId(null)
  }

  // シリーズ折りたたみ状態（デフォルト: 全て折りたたみ）
  const [expandedSeries, setExpandedSeries] = useState<Set<number>>(new Set())

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

  // レシピ紐づけデータ
  const [recipeLinks, setRecipeLinks] = useState<Record<string, string>>({})

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

        // シリーズごとの合計広告費を計算（各プラットフォームの実データを合算）
        const adCostBySeriesMap = new Map<number, number>()

        data?.forEach(item => {
          const totalCost = (item.amazon_cost || 0) +
            (item.google_cost || 0) +
            (item.rakuten_cost || 0) +
            (item.yahoo_cost || 0) +
            (item.other_cost || 0)
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

  // レシピ紐づけデータを取得
  useEffect(() => {
    const fetchRecipeLinks = async () => {
      try {
        const { data, error } = await supabase
          .from('recipes')
          .select('id, name, linked_product_id')
          .not('linked_product_id', 'is', null)

        if (error) throw error

        const linkMap: Record<string, string> = {}
        data?.forEach((recipe: { id: string; name: string; linked_product_id: string | null }) => {
          if (recipe.linked_product_id) {
            linkMap[recipe.linked_product_id] = recipe.name
          }
        })
        setRecipeLinks(linkMap)
      } catch (error) {
        console.error('レシピ紐づけデータの取得に失敗しました:', error)
      }
    }

    fetchRecipeLinks()
  }, [filteredItems])

  // シリーズコードから広告費を取得
  const getAdCostForProduct = (productId: string): number => {
    const seriesCode = getProductSeriesCode ? getProductSeriesCode(productId) : 0
    const adCost = adCostData.find(item => item.series_code === seriesCode)
    return adCost?.total_ad_cost || 0
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

  const handleHideProduct = async (productId: string) => {
    const productName = getProductName(productId)

    if (!confirm(`商品「${productName}」を終売（非表示）にしますか？\n\nデータは削除されません。\n終売管理ページから復活できます。`)) {
      return
    }

    try {
      const res = await fetch("/api/products/hide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, isHidden: true }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "非表示に失敗しました")
      }

      // 確実に画面から消すためリロード
      window.location.reload()
    } catch (error: any) {
      console.error('非表示エラー:', error)
      alert(`商品の非表示に失敗しました: ${error.message}`)
    }
  }

  const handleDeleteProduct = async (productId: string) => {
    const productName = getProductName(productId)

    if (!confirm(`商品「${productName}」を削除しますか？\n\n※ 関連するすべての販売データ・マッピングデータも完全に削除されます。\nこの操作は取り消せません。`)) {
      return
    }

    setIsDeleting(true)
    try {
      const res = await fetch('/api/products/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: productId }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || result.details || '削除に失敗しました')
      }

      alert(`商品「${productName}」を削除しました`)
      if (onRefresh) onRefresh()
    } catch (error: any) {
      console.error('削除エラー:', error)
      alert(`商品の削除に失敗しました: ${error.message}`)
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

  // シリーズ別にグループ化（検索フィルタ付き）
  const seriesGroups = useMemo(() => {
    const groups = new Map<number, { seriesName: string; items: WebSalesData[] }>()

    // 検索フィルタ適用
    const query = searchQuery.trim().toLowerCase()
    const itemsToGroup = query
      ? filteredItems.filter(row => {
          const name = (getProductName ? getProductName(row.product_id) : (row.product_name || '')).toLowerCase()
          const series = (getProductSeries ? getProductSeries(row.product_id) : (row.series || '')).toLowerCase()
          return name.includes(query) || series.includes(query)
        })
      : filteredItems

    itemsToGroup.forEach(row => {
      const code = getProductSeriesCode ? getProductSeriesCode(row.product_id) : (row.series_code || 0)
      const name = getProductSeries ? getProductSeries(row.product_id) : (row.series || `シリーズ ${code}`)

      if (!groups.has(code)) {
        groups.set(code, { seriesName: name, items: [] })
      }
      groups.get(code)!.items.push(row)
    })

    // series_codeの昇順で返す
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0])
  }, [filteredItems, getProductSeriesCode, getProductSeries, searchQuery, getProductName])

  const toggleSeries = (seriesCode: number) => {
    setExpandedSeries(prev => {
      const next = new Set(prev)
      if (next.has(seriesCode)) {
        next.delete(seriesCode)
      } else {
        next.add(seriesCode)
      }
      return next
    })
  }

  const toggleAll = () => {
    if (expandedSeries.size === seriesGroups.length) {
      // 全展開中 → 全折りたたみ
      setExpandedSeries(new Set())
    } else {
      // 全展開
      setExpandedSeries(new Set(seriesGroups.map(([code]) => code)))
    }
  }

  // シリーズ別小計を計算
  const getSeriesSubtotals = (items: WebSalesData[]) => {
    const siteCounts: Record<string, number> = {}
    sites.forEach(site => { siteCounts[site.key] = 0 })
    let totalCount = 0
    let totalAmount = 0
    let totalProfit = 0

    // シリーズの広告費は1回だけ取得（商品ごとに加算しない）
    const seriesCode = items.length > 0 && getProductSeriesCode ? getProductSeriesCode(items[0].product_id) : 0
    const seriesAdCost = adCostData.find(item => item.series_code === seriesCode)?.total_ad_cost || 0

    items.forEach(row => {
      const price = getProductPrice(row.product_id)
      const profitRate = getProductProfitRate ? getProductProfitRate(row.product_id) : 0
      let rowTotal = 0

      sites.forEach(site => {
        const count = (row as any)[site.key] || 0
        siteCounts[site.key] += count
        rowTotal += count
      })

      totalCount += rowTotal
      const amount = rowTotal * price
      totalAmount += amount
      const profitAmount = Math.round(amount * (profitRate / 100))
      totalProfit += profitAmount
    })

    return { siteCounts, totalCount, totalAmount, totalAdCost: seriesAdCost, totalProfit: totalProfit - seriesAdCost }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* 検索窓 + ボタン群 */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="商品名・シリーズ名で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-9 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {searchQuery && (
          <span className="text-sm text-gray-500 whitespace-nowrap">
            {seriesGroups.reduce((sum, [, g]) => sum + g.items.length, 0)}件ヒット
          </span>
        )}
        <div className="flex gap-2">
          <button
            onClick={toggleAll}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors border border-gray-300"
            title={expandedSeries.size === seriesGroups.length ? '全て折りたたむ' : '全て展開'}
          >
            <ChevronsUpDown className="h-4 w-4" />
            {expandedSeries.size === seriesGroups.length ? '全て折りたたむ' : '全て展開'}
          </button>
          <button
            onClick={() => setIsAddingProduct(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            新規登録
          </button>
        </div>
      </div>

      <div className="overflow-auto border border-gray-300 rounded-lg">
        <div className="inline-block min-w-full align-middle">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th className="px-1 py-3 text-center text-xs font-semibold text-gray-700 tracking-wider w-[30px]">
                  No.
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 tracking-wider w-[150px]">
                  商品名
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 tracking-wider whitespace-nowrap">
                  価格
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 tracking-wider whitespace-nowrap">
                  利益率
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
                  <td colSpan={sites.length + 8} className="px-6 py-12 text-center text-gray-500">
                    データがありません
                  </td>
                </tr>
              ) : (
                seriesGroups.map(([seriesCode, group]) => {
                  const isExpanded = expandedSeries.has(seriesCode)
                  const subtotals = getSeriesSubtotals(group.items)

                  return (
                    <React.Fragment key={`series-${seriesCode}`}>
                      {/* ===== シリーズヘッダー行 ===== */}
                      <tr
                        className="bg-slate-100 hover:bg-slate-200 cursor-pointer select-none border-t-2 border-slate-300"
                        onClick={() => toggleSeries(seriesCode)}
                      >
                        <td className="px-4 py-3 text-sm font-bold text-slate-800" colSpan={2}>
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-slate-500 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-slate-500 flex-shrink-0" />
                            )}
                            <span>{group.seriesName || `シリーズ ${seriesCode}`}</span>
                            <span className="text-xs font-normal text-slate-500 ml-1">({group.items.length}商品)</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-slate-500">—</td>
                        <td className="px-4 py-3 text-center text-xs text-slate-500">—</td>
                        {sites.map(site => (
                          <td key={site.key} className={`px-4 py-3 text-center text-sm font-semibold text-slate-700 ${site.bgColor} bg-opacity-60`}>
                            {subtotals.siteCounts[site.key] || 0}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-center text-sm font-bold text-slate-800">
                          {subtotals.totalCount}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-slate-800">
                          ¥{formatNumber(subtotals.totalAmount)}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-semibold text-red-600">
                          ¥{formatNumber(subtotals.totalAdCost)}
                        </td>
                        <td className={`px-4 py-3 text-center text-sm font-bold ${subtotals.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ¥{formatNumber(subtotals.totalProfit)}
                        </td>
                        <td className="px-4 py-3"></td>
                      </tr>

                      {/* ===== シリーズ内の個別商品行 ===== */}
                      {isExpanded && group.items.map((row) => {
                        const price = getProductPrice(row.product_id)
                        const profitRate = getProductProfitRate ? getProductProfitRate(row.product_id) : 0
                        const productCode = getProductProductCode ? getProductProductCode(row.product_id) : (row.product_code || 0)

                        const totalCount = sites.reduce((sum, site) => sum + ((row as any)[site.key] || 0), 0)
                        const totalAmount = totalCount * price
                        const profitAmount = Math.round(totalAmount * (profitRate / 100))

                        const isDragTarget = dragOverProductId === row.product_id && dragProductId !== row.product_id

                        return (
                          <tr
                            key={row.product_id}
                            className={`hover:bg-gray-50 bg-white transition-colors ${
                              dragProductId === row.product_id ? 'opacity-40' : ''
                            } ${isDragTarget ? 'border-t-2 border-blue-400' : ''}`}
                            draggable
                            onDragStart={(e) => handleDragStart(e, row.product_id)}
                            onDragOver={(e) => handleDragOver(e, row.product_id)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, row.product_id, group.items)}
                            onDragEnd={handleDragEnd}
                          >
                            <td className="px-1 py-4 text-center text-xs text-gray-400 cursor-grab active:cursor-grabbing select-none w-[30px]">
                              <div className="flex items-center justify-center gap-0.5">
                                <GripVertical className="h-3 w-3 text-gray-300" />
                                <span className="font-mono">{productCode || '—'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-900 pl-6">
                              <div className="flex items-center gap-1">
                                <div
                                  className="font-medium cursor-pointer hover:text-blue-600 hover:underline flex-1"
                                  onMouseEnter={(e) => handleProductNameMouseEnter(row.product_id, e)}
                                  onMouseLeave={handleMouseLeave}
                                >
                                  {getProductName(row.product_id)}
                                </div>
                                {recipeLinks[row.product_id] && (
                                  <span className="relative flex-shrink-0 group/link">
                                    <span className="text-emerald-500 cursor-help">
                                      <Link2 className="h-3.5 w-3.5" />
                                    </span>
                                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg shadow-lg whitespace-nowrap opacity-0 invisible group-hover/link:opacity-100 group-hover/link:visible transition-all duration-200 pointer-events-none z-50">
                                      🔗 {recipeLinks[row.product_id]}
                                      <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800"></span>
                                    </span>
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span>¥{formatNumber(price)}</span>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <span>{profitRate}%</span>
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
                            <td className="px-4 py-4 text-center text-gray-400 text-sm">
                              -
                            </td>
                            <td className={`px-4 py-4 text-center font-semibold ${profitAmount >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                              ¥{formatNumber(profitAmount)}
                            </td>
                            <td className="px-4 py-4 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleEditProduct(row.product_id)}
                                  className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                  title="変更"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleHideProduct(row.product_id)}
                                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                                  title="終売（非表示）"
                                >
                                  <EyeOff className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteProduct(row.product_id)}
                                  disabled={isDeleting}
                                  className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                                  title="削除"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
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
