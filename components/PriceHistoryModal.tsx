// /components/PriceHistoryModal.tsx ver.1
"use client"

import React, { useState, useEffect } from "react"
import { X, Trash2, Calendar, DollarSign } from "lucide-react"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"

interface PriceHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  productId: string
  productName: string
  onRefresh: () => void
}

interface PriceHistory {
  id: string
  product_id: string
  price: number
  valid_from: string
  valid_to: string | null
  created_at: string
  note: string | null
}

export default function PriceHistoryModal({
  isOpen,
  onClose,
  productId,
  productName,
  onRefresh,
}: PriceHistoryModalProps) {
  const supabase = getSupabaseBrowserClient();
  const [histories, setHistories] = useState<PriceHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && productId) {
      fetchHistories()
    }
  }, [isOpen, productId])

  const fetchHistories = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('product_price_history')
        .select('*')
        .eq('product_id', productId)
        .order('valid_from', { ascending: false })

      if (error) throw error
      setHistories(data || [])
    } catch (error) {
      console.error('価格履歴の取得に失敗しました:', error)
      alert('価格履歴の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (historyId: string, price: number, validFrom: string) => {
    if (!confirm(`価格 ¥${formatNumber(price)} (${formatDate(validFrom)}) の履歴を削除しますか？`)) {
      return
    }

    setDeleting(historyId)
    try {
      const { error } = await supabase
        .from('product_price_history')
        .delete()
        .eq('id', historyId)

      if (error) throw error

      // 成功したらリストから削除
      setHistories(prev => prev.filter(h => h.id !== historyId))
      onRefresh()
      alert('価格履歴を削除しました')
    } catch (error) {
      console.error('価格履歴の削除に失敗しました:', error)
      alert('価格履歴の削除に失敗しました')
    } finally {
      setDeleting(null)
    }
  }

  const formatNumber = (n: number) => new Intl.NumberFormat("ja-JP").format(n)
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ja-JP', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDateShort = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ja-JP', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit'
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            価格履歴管理 - {productName}
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
          ) : histories.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              価格履歴がありません
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">価格</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">適用開始日</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">適用終了日</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">登録日時</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">備考</th>
                  <th className="px-4 py-2 text-center text-sm font-medium text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {histories.map((history, index) => (
                  <tr key={history.id} className={index === 0 ? 'bg-blue-50' : ''}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold">¥{formatNumber(history.price)}</span>
                        {index === 0 && (
                          <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded">現在</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-1 text-gray-600">
                        <Calendar className="h-4 w-4" />
                        {formatDateShort(history.valid_from)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {history.valid_to ? formatDateShort(history.valid_to) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatDate(history.created_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {history.note || '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {index !== 0 && (
                        <button
                          onClick={() => handleDelete(history.id, history.price, history.valid_from)}
                          disabled={deleting === history.id}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          削除
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              ※ 現在の価格履歴は削除できません
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
