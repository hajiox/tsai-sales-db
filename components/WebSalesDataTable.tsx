// /components/WebSalesDataTable.tsx ver.13 (広告費対応版)
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

 // 現在の月を取得
 const getCurrentMonth = () => {
   if (month) return `${month}-01`
   const now = new Date()
   const year = now.getFullYear()
   const monthNum = String(now.getMonth() + 1).padStart(2, '0')
   return `${year}-${monthNum}-01`
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
 const fetchSiteTrendData = async (productId: string, site: string) => {
   const key = `${productId}-${site}`
   if (siteTrendData[key] || siteTrendLoading[key]) return

   setSiteTrendLoading(prev => ({ ...prev, [key]: true }))

   try {
     const currentMonth = getCurrentMonth()
     const { data, error } = await supabase.rpc('get_product_site_trend_data', {
       target_month: currentMonth,
       target_product_id: productId,
       target_site: site
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

 const handleProductMouseEnter = (productId: string, event: React.MouseEvent<HTMLDivElement>) => {
   setHoveredProductId(productId)
   setHoveredSiteCell(null)
   fetchTrendData(productId)
   
   const elementRect = event.currentTarget.getBoundingClientRect()
   const containerRect = containerRef.current?.getBoundingClientRect()
   if(containerRect) {
       setTooltipPosition({
           top: elementRect.bottom - containerRect.top + 8,
           left: elementRect.left - containerRect.left,
       })
   }
 }

 const handleSiteMouseEnter = (productId: string, site: string, event: React.MouseEvent<HTMLDivElement>) => {
   const key = `${productId}-${site}`
   setHoveredSiteCell(key)
   setHoveredProductId(null)
   fetchSiteTrendData(productId, site)
   
   const elementRect = event.currentTarget.getBoundingClientRect()
   const containerRect = containerRef.current?.getBoundingClientRect()
   if(containerRect) {
       setTooltipPosition({
           top: elementRect.bottom - containerRect.top + 8,
           left: elementRect.left - containerRect.left,
       })
   }
 }

 const handleMouseLeave = () => {
   setHoveredProductId(null)
   setHoveredSiteCell(null)
 }

 // 🔥 商品追加処理
 const handleAddProduct = async (productData: { 
   productName: string; 
   price: number; 
   seriesNumber: number; 
   productNumber: number; 
   seriesName: string 
 }) => {
   try {
     const response = await fetch('/api/products/add', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         name: productData.productName,
         price: productData.price,
         series_code: productData.seriesNumber,
         product_code: productData.productNumber,
         series: productData.seriesName
       }),
     });
     
     if (!response.ok) throw new Error('商品追加に失敗しました');
     
     setIsAddingProduct(false);
     onRefresh?.();
     alert('商品を追加しました');
   } catch (error) {
     console.error('商品追加エラー:', error);
     alert('商品追加に失敗しました');
   }
 };

 // 🔥 商品編集ボタンクリック処理
 const handleEditProduct = (productId: string) => {
   const product = productMaster.find(p => p.id === productId);
   if (product) {
     setEditingProductData(product);
     setIsEditingProduct(true);
   }
 };

 // 🔥 商品更新処理 (修正済み)
 const handleUpdateProduct = async (productData: {
   id: string;
   name: string;
   price: number;
   profit_rate: number;
   series_code: number;
   product_code: number;
   series: string;
 }) => {
   try {
     // productDataから必要な値を明示的に取り出して新しいオブジェクトを作成
     const { id, name, price, profit_rate, series_code, product_code, series } = productData;

     const response = await fetch('/api/products/update', {
       method: 'PUT',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         id,
         name,
         price,
         profit_rate,
         series_code,
         product_code,
         series,
       }),
     });
     
     if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '商品更新に失敗しました');
     }
     
     setIsEditingProduct(false);
     setEditingProductData(null);
     onRefresh?.();
     alert('商品情報を更新しました');
   } catch (error) {
     console.error('商品更新エラー:', error);
     alert(`商品更新に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
   }
 };

 // 🔥 商品削除処理
 const handleDeleteProduct = async (productId: string, productName: string) => {
   if (!confirm(`商品「${productName}」を削除しますか？\nこの操作は取り消せません。`)) {
     return;
   }

   setIsDeleting(true);
   try {
     const response = await fetch('/api/products/delete', {
       method: 'DELETE',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ id: productId }),
     });

     if (!response.ok) {
       throw new Error('商品削除に失敗しました');
     }

     onRefresh?.();
     alert('商品を削除しました');
   } catch (error) {
     console.error('商品削除エラー:', error);
     alert('商品削除に失敗しました');
   } finally {
     setIsDeleting(false);
   }
 };

 const formatNumber = (n: number) => new Intl.NumberFormat("ja-JP").format(n);

 const siteNames = {
   amazon: 'Amazon',
   rakuten: '楽天',
   yahoo: 'Yahoo',
   mercari: 'メルカリ',
   base: 'BASE',
   qoo10: 'Qoo10'
 };

 return (
   <div className="rounded-lg border bg-white shadow-sm relative" ref={containerRef}>
     <div className="p-3 border-b bg-gray-50 flex justify-between items-center">
       <h3 className="text-lg font-semibold">全商品一覧 ({filteredItems.length}商品)</h3>
       <div className="flex gap-2">
         <button
           onClick={() => setIsAddingProduct(true)}
           className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
         >
           <Plus className="h-4 w-4" />
           商品登録
         </button>
       </div>
     </div>

     <div className="overflow-x-auto">
       <table className="min-w-full">
         <thead className="bg-gray-50">
           <tr>
             <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-52">
               商品名
             </th>
             <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
               Amazon
             </th>
             <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
               楽天
             </th>
             <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
               Yahoo!
             </th>
             <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
               メルカリ
             </th>
             <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
               BASE
             </th>
             <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
               Qoo10
             </th>
             <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
               合計数
             </th>
             <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
               合計金額
             </th>
             <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
               広告費
             </th>
             <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-28">
               利益
             </th>
             <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
               操作
             </th>
           </tr>
         </thead>
         <tbody className="bg-white divide-y divide-gray-200">
           {filteredItems.length === 0 ? (
             <tr>
               <td colSpan={12} className="px-4 py-8 text-center text-gray-500">
                 データがありません
               </td>
             </tr>
           ) : (
             filteredItems.map((row, index) => {
               const productPrice = getProductPrice(row.product_id)
               const profitRate = getProductProfitRate ? getProductProfitRate(row.product_id) : 0
               const priceDiff = getPriceDifferenceInfo(row.product_id)
               const totalCount = [
                 "amazon",
                 "rakuten", 
                 "yahoo",
                 "mercari",
                 "base",
                 "qoo10",
               ].reduce((sum, site) => sum + (row[`${site}_count`] || 0), 0)
               const totalAmount = totalCount * productPrice
               const profitAmount = Math.round(totalAmount * profitRate / 100)
               const adCost = getAdCostForProduct(row.product_id)
               const finalProfit = profitAmount - adCost

               return (
                 <tr 
                   key={row.product_id}
                   className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                 >
                   <td className="px-4 py-4 text-left text-xs">
                     <div 
                       className="cursor-pointer hover:text-blue-600 transition-colors"
                       onMouseEnter={(e) => handleProductMouseEnter(row.product_id, e)}
                       onMouseLeave={handleMouseLeave}
                     >
                       {getProductName(row.product_id)}
                     </div>
                     <div className="text-xs text-gray-500 mt-1">
                       単価: ¥{formatNumber(productPrice)}
                       {profitRate > 0 && (
                         <span className="ml-2 text-green-600">
                           利益率: {profitRate}%
                         </span>
                       )}
                       {isHistoricalMode && priceDiff && priceDiff.difference !== 0 && (
                         <span className={`ml-2 font-semibold ${priceDiff.difference > 0 ? 'text-red-600' : 'text-green-600'}`}>
                           {priceDiff.difference > 0 ? (
                             <>
                               <TrendingUp className="inline h-3 w-3" />
                               +¥{formatNumber(Math.abs(priceDiff.difference))}
                             </>
                           ) : (
                             <>
                               <TrendingDown className="inline h-3 w-3" />
                               -¥{formatNumber(Math.abs(priceDiff.difference))}
                             </>
                           )}
                           ({priceDiff.differencePercent}%)
                         </span>
                       )}
                     </div>
                     {isHistoricalMode && priceDiff && (priceDiff.currentPrice !== priceDiff.historicalPrice || priceDiff.currentProfitRate !== priceDiff.historicalProfitRate) && (
                       <div className="text-xs text-amber-600 mt-0.5">
                         過去: ¥{formatNumber(priceDiff.historicalPrice)} ({priceDiff.historicalProfitRate}%) → 
                         現在: ¥{formatNumber(priceDiff.currentPrice)} ({priceDiff.currentProfitRate}%)
                       </div>
                     )}
                   </td>
                   {(
                     [
                       "amazon",
                       "rakuten",
                       "yahoo", 
                       "mercari",
                       "base",
                       "qoo10",
                     ] as const
                   ).map((site) => {
                     const cellKey = `${row.product_id}-${site}`
                     const count = row[`${site}_count`] || 0
                     const displayValue = `${count}`
                     return (
                       <td key={cellKey} className="px-4 py-4 text-center">
                         <div
                           onClick={() => onEdit(row.product_id, site)}
                           onMouseEnter={(e) => handleSiteMouseEnter(row.product_id, site, e)}
                           onMouseLeave={handleMouseLeave}
                           className={`cursor-pointer hover:bg-gray-100 p-1 rounded ${
                             editMode[cellKey] ? "bg-blue-50" : ""
                           }`}
                         >
                           {editMode[cellKey] ? (
                             <Input
                               autoFocus
                               value={editedValue}
                               onChange={(e) => onEditValueChange(e.target.value)}
                               onBlur={() => onSave(row.product_id, site)}
                               onKeyDown={(e) => {
                                 if (e.key === "Enter") {
                                   onSave(row.product_id, site)
                                 } else if (e.key === "Escape") {
                                   onCancel()
                                 }
                               }}
                               type="number"
                               className="text-center"
                               size="sm"
                             />
                           ) : (
                             displayValue
                           )}
                         </div>
                       </td>
                     )
                   })}
                   <td className="px-4 py-4 text-center font-bold">
                     {formatNumber(totalCount)}
                   </td>
                   <td className={`px-4 py-4 text-center font-bold ${
                     isHistoricalMode && priceDiff && priceDiff.difference !== 0 
                       ? 'bg-amber-50' 
                       : ''
                   }`}>
                     ¥{formatNumber(totalAmount)}
                   </td>
                   <td className="px-4 py-4 text-center text-red-600">
                     ¥{formatNumber(adCost)}
                   </td>
                   <td className="px-4 py-4 text-center font-bold text-green-600">
                     ¥{formatNumber(finalProfit)}
                   </td>
                   <td className="px-4 py-4 text-center">
                     <div className="flex gap-1 justify-center">
                       <button
                         onClick={() => handleEditProduct(row.product_id)}
                         className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                       >
                         <Edit className="h-3 w-3" />
                         変更
                       </button>
                       <button
                         onClick={() => handleDeleteProduct(row.product_id, getProductName(row.product_id))}
                         disabled={isDeleting}
                         className="inline-flex items-center gap-1 px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 disabled:opacity-50"
                       >
                         <Trash2 className="h-3 w-3" />
                         削除
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

     {/* 商品名トレンドツールチップ */}
     {hoveredProductId && trendData[hoveredProductId] && (
       <div 
         className="absolute z-10 bg-white border border-gray-300 rounded-lg shadow-xl p-3"
         style={{
           top: `${tooltipPosition.top}px`,
           left: `${tooltipPosition.left}px`,
           width: '280px',
         }}
       >
         <div className="text-sm font-semibold mb-2 text-gray-800">
           {getProductName(hoveredProductId)} - 過去6ヶ月 売上トレンド
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
                       className="h-full bg-sky-400 transition-all duration-300"
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

     {/* ECサイト別トレンドツールチップ */}
     {hoveredSiteCell && siteTrendData[hoveredSiteCell] && (
       <div 
         className="absolute z-10 bg-white border border-gray-300 rounded-lg shadow-xl p-3"
         style={{
           top: `${tooltipPosition.top}px`,
           left: `${tooltipPosition.left}px`,
           width: '280px',
         }}
       >
         <div className="text-sm font-semibold mb-2 text-gray-800">
           {(() => {
             const [productId, site] = hoveredSiteCell.split('-')
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
