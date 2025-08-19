// /app/wholesale/price-history/page.tsx ver.3 (2025-08-19 JST)
"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from 'next/navigation'
import { X, Trash2, Calendar, Package, ChevronLeft, TrendingUp } from "lucide-react"
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface DateHistory {
  change_date: string
  products: {
    product_id: string
    product_name: string
    old_price: number
    new_price: number
    old_profit_rate: number | null
    new_profit_rate: number | null
    history_id: string
  }[]
}

export default function WholesalePriceHistory() {
  const router = useRouter()
  const [dateHistories, setDateHistories] = useState<DateHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchDateHistories()
  }, [])

  const fetchDateHistories = async () => {
    setLoading(true)
    try {
      const supabase = getSupabaseBrowserClient()
      // 価格変更履歴を日付でグループ化して取得
      const { data: historyData, error: historyError } = await supabase
        .from('wholesale_product_price_history')
        .select(`
          id,
          product_id,
          price,
          profit_rate,
          valid_from,
          valid_to
        `)
        .order('valid_from', { ascending: false })

      if (historyError) throw historyError

      // 商品情報を取得
      const { data: productsData, error: productsError } = await supabase
        .from('wholesale_products')
        .select('id, product_name, price, profit_rate')

      if (productsError) throw productsError

      // 日付ごとにグループ化
      const groupedByDate = new Map<string, any[]>()
      
      historyData?.forEach(history => {
        const date = new Date(history.valid_from).toISOString().split('T')[0]
        if (!groupedByDate.has(date)) {
          groupedByDate.set(date, [])
        }
        
        const product = productsData?.find(p => p.id === history.product_id)
        if (product) {
          // 前の価格と利益率を取得（この履歴の前の履歴を探す）
          const previousHistory = historyData.find(h => 
            h.product_id === history.product_id && 
            new Date(h.valid_from) < new Date(history.valid_from)
          )
          
          groupedByDate.get(date)?.push({
            product_id: history.product_id,
            product_name: product.product_name,
            old_price: previousHistory?.price || history.price,
            new_price: history.price,
            old_profit_rate: previousHistory?.profit_rate || history.profit_rate,
            new_profit_rate: history.profit_rate,
            history_id: history.id
          })
        }
      })

      // DateHistory形式に変換
      const dateHistoriesArray: DateHistory[] = Array.from(groupedByDate.entries())
        .map(([date, products]) => ({
          change_date: date,
          products
        }))
        .sort((a, b) => b.change_date.localeCompare(a.change_date))

      setDateHistories(dateHistoriesArray)
    } catch (error) {
      console.error('価格履歴の取得に失敗しました:', error)
      alert('価格履歴の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteDate = async (date: string, historyIds: string[]) => {
    const productCount = historyIds.length
    if (!confirm(`${formatDate(date)}の価格変更履歴（${productCount}商品）を削除しますか？\nこの操作は取り消せません。`)) {
      return
    }

    setDeleting(date)
    try {
      const supabase = getSupabase()
      // 複数の履歴を一括削除
      const { error } = await supabase
        .from('wholesale_product_price_history')
        .delete()
        .in('id', historyIds)

      if (error) throw error

      // 成功したらリストから削除
      setDateHistories(prev => prev.filter(h => h.change_date !== date))
      alert(`${formatDate(date)}の価格履歴を削除しました`)
    } catch (error) {
      console.error('価格履歴の削除に失敗しました:', error)
      alert('価格履歴の削除に失敗しました')
    } finally {
      setDeleting(null)
    }
  }

  const toggleDateExpansion = (date: string) => {
    const newExpanded = new Set(expandedDates)
    if (newExpanded.has(date)) {
      newExpanded.delete(date)
    } else {
      newExpanded.add(date)
    }
    setExpandedDates(newExpanded)
  }

  const formatNumber = (n: number) => new Intl.NumberFormat("ja-JP").format(n)
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="flex items-center gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              戻る
            </Button>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              卸商品価格変更履歴管理
            </h1>
          </div>
        </div>
      </header>

      <main className="p-4">
        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500"></div>
              <span className="ml-3 text-gray-500">読み込み中...</span>
            </CardContent>
          </Card>
        ) : dateHistories.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8 text-gray-500">
              価格変更履歴がありません
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {dateHistories.map((dateHistory) => (
              <Card key={dateHistory.change_date} className="overflow-hidden">
                <CardHeader className="bg-gray-100 py-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleDateExpansion(dateHistory.change_date)}
                        className="text-gray-600 hover:text-gray-800"
                      >
                        {expandedDates.has(dateHistory.change_date) ? '▼' : '▶'}
                      </button>
                      <div>
                        <div className="font-semibold text-lg">
                          {formatDate(dateHistory.change_date)}
                        </div>
                        <div className="text-sm text-gray-600">
                          {dateHistory.products.length}商品の価格・利益率を変更
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteDate(
                        dateHistory.change_date, 
                        dateHistory.products.map(p => p.history_id)
                      )}
                      disabled={deleting === dateHistory.change_date}
                      className="flex items-center gap-1"
                    >
                      <Trash2 className="h-4 w-4" />
                      この日の履歴を削除
                    </Button>
                  </div>
                </CardHeader>
                
                {expandedDates.has(dateHistory.change_date) && (
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left py-2 px-4">商品名</th>
                          <th className="text-right py-2 px-4">変更前価格</th>
                          <th className="text-center py-2 px-4">→</th>
                          <th className="text-right py-2 px-4">変更後価格</th>
                          <th className="text-right py-2 px-4">差額</th>
                          <th className="text-right py-2 px-4">変更前利益率</th>
                          <th className="text-center py-2 px-4">→</th>
                          <th className="text-right py-2 px-4">変更後利益率</th>
                          <th className="text-right py-2 px-4">差</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dateHistory.products.map((product) => {
                          const priceDiff = product.new_price - product.old_price
                          const priceDiffPercent = product.old_price > 0 
                            ? ((priceDiff / product.old_price) * 100).toFixed(1)
                            : '0'
                          const profitDiff = (product.new_profit_rate || 0) - (product.old_profit_rate || 0)
                          
                          return (
                            <tr key={product.history_id} className="border-b hover:bg-gray-50">
                              <td className="py-2 px-4 flex items-center gap-2">
                                <Package className="h-4 w-4 text-gray-400" />
                                {product.product_name}
                              </td>
                              <td className="text-right py-2 px-4">
                                ¥{formatNumber(product.old_price)}
                              </td>
                              <td className="text-center py-2 px-4 text-gray-400">
                                →
                              </td>
                              <td className="text-right py-2 px-4 font-semibold">
                                ¥{formatNumber(product.new_price)}
                              </td>
                              <td className={`text-right py-2 px-4 font-semibold ${
                                priceDiff > 0 ? 'text-red-600' : priceDiff < 0 ? 'text-green-600' : 'text-gray-500'
                              }`}>
                                {priceDiff > 0 ? '+' : ''}{formatNumber(priceDiff)}
                                <span className="text-xs ml-1">
                                  ({priceDiff > 0 ? '+' : ''}{priceDiffPercent}%)
                                </span>
                              </td>
                              <td className="text-right py-2 px-4">
                                <span className="flex items-center justify-end gap-1">
                                  <TrendingUp className="h-3 w-3 text-gray-400" />
                                  {product.old_profit_rate?.toFixed(2) || '0.00'}%
                                </span>
                              </td>
                              <td className="text-center py-2 px-4 text-gray-400">
                                →
                              </td>
                              <td className="text-right py-2 px-4 font-semibold">
                                <span className="flex items-center justify-end gap-1">
                                  <TrendingUp className="h-3 w-3 text-gray-400" />
                                  {product.new_profit_rate?.toFixed(2) || '0.00'}%
                                </span>
                              </td>
                              <td className={`text-right py-2 px-4 font-semibold ${
                                profitDiff > 0 ? 'text-green-600' : profitDiff < 0 ? 'text-red-600' : 'text-gray-500'
                              }`}>
                                {profitDiff > 0 ? '+' : ''}{profitDiff.toFixed(2)}%
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}

        <div className="mt-6 text-sm text-gray-600 text-center">
          ※ 削除した価格履歴は復元できません
        </div>
      </main>
    </div>
  )
}
