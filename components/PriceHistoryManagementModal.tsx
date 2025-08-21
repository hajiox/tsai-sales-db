// /components/PriceHistoryManagementModal.tsx ver.1 (日付単位の価格履歴管理)
"use client"

import React, { useState, useEffect } from "react"
import { X, Trash2, Calendar, Package } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"

interface PriceHistoryManagementModalProps {
  isOpen: boolean
  onClose: () => void
  onRefresh: () => void
}

interface DateHistory {
  change_date: string
  products: {
    product_id: string
    product_name: string
    old_price: number
    new_price: number
    history_id: string
  }[]
}

export default function PriceHistoryManagementModal({
  isOpen,
  onClose,
  onRefresh,
}: PriceHistoryManagementModalProps) {
  const supabase = getSupabaseBrowserClient()
  const [dateHistories, setDateHistories] = useState<DateHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (isOpen) {
      fetchDateHistories()
    }
  }, [isOpen])

  const fetchDateHistories = async () => {
    setLoading(true)
    try {
      // 価格変更履歴を日付でグループ化して取得
      const { data: historyData, error: historyError } = await supabase
        .from('product_price_history')
        .select(`
          id,
          product_id,
          price,
          valid_from,
          valid_to
        `)
        .order('valid_from', { ascending: false })

      if (historyError) throw historyError

      // 商品情報を取得
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, name, price')

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
          // 前の価格を取得（この履歴の前の履歴を探す）
          const previousHistory = historyData.find(h => 
            h.product_id === history.product_id && 
            new Date(h.valid_from) < new Date(history.valid_from)
          )
          
          groupedByDate.get(date)?.push({
            product_id: history.product_id,
            product_name: product.name,
            old_price: previousHistory?.price || history.price,
            new_price: history.price,
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
      // 複数の履歴を一括削除
      const { error } = await supabase
        .from('product_price_history')
        .delete()
        .in('id', historyIds)

      if (error) throw error

      // 成功したらリストから削除
      setDateHistories(prev => prev.filter(h => h.change_date !== date))
      onRefresh()
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            価格変更履歴管理
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded-full transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 8rem)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-500"></div>
              <span className="ml-3 text-gray-500">読み込み中...</span>
            </div>
          ) : dateHistories.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              価格変更履歴がありません
            </div>
          ) : (
            <div className="space-y-4">
              {dateHistories.map((dateHistory) => (
                <div key={dateHistory.change_date} className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-100 p-3 flex justify-between items-center">
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
                          {dateHistory.products.length}商品の価格を変更
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteDate(
                        dateHistory.change_date, 
                        dateHistory.products.map(p => p.history_id)
                      )}
                      disabled={deleting === dateHistory.change_date}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      この日の履歴を削除
                    </button>
                  </div>
                  
                  {expandedDates.has(dateHistory.change_date) && (
                    <div className="p-3 bg-white">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2">商品名</th>
                            <th className="text-right py-2">変更前価格</th>
                            <th className="text-center py-2">→</th>
                            <th className="text-right py-2">変更後価格</th>
                            <th className="text-right py-2">差額</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dateHistory.products.map((product) => {
                            const diff = product.new_price - product.old_price
                            const diffPercent = product.old_price > 0 
                              ? ((diff / product.old_price) * 100).toFixed(1)
                              : '0'
                            
                            return (
                              <tr key={product.history_id} className="border-b">
                                <td className="py-2 flex items-center gap-2">
                                  <Package className="h-4 w-4 text-gray-400" />
                                  {product.product_name}
                                </td>
                                <td className="text-right py-2">
                                  ¥{formatNumber(product.old_price)}
                                </td>
                                <td className="text-center py-2 text-gray-400">
                                  →
                                </td>
                                <td className="text-right py-2 font-semibold">
                                  ¥{formatNumber(product.new_price)}
                                </td>
                                <td className={`text-right py-2 font-semibold ${
                                  diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-600' : 'text-gray-500'
                                }`}>
                                  {diff > 0 ? '+' : ''}{formatNumber(diff)}
                                  <span className="text-xs ml-1">
                                    ({diff > 0 ? '+' : ''}{diffPercent}%)
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              ※ 削除した価格履歴は復元できません
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
