// /components/AmazonCsvConfirmModal.tsx ver.1
"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"

interface AmazonImportResult {
  productId: string
  productName: string
  amazonTitle: string
  quantity: number
  matched: boolean
  matchType?: 'exact' | 'learned' | 'high' | 'medium' | 'low'
}

interface AmazonCsvConfirmModalProps {
  isOpen: boolean
  results: AmazonImportResult[]
  productMaster: { id: string; name: string }[]
  month: string
  isSubmitting: boolean
  onClose: () => void
  onConfirm: (updatedResults: AmazonImportResult[]) => void
}

export default function AmazonCsvConfirmModal({
  isOpen,
  results,
  productMaster,
  month,
  isSubmitting,
  onClose,
  onConfirm,
}: AmazonCsvConfirmModalProps) {
  const [editableResults, setEditableResults] = useState<AmazonImportResult[]>(results)
  const router = useRouter()

  // 結果が更新されたら編集可能な結果も更新
  React.useEffect(() => {
    setEditableResults(results)
  }, [results])

  const handleProductChange = (index: number, newProductId: string) => {
    const selectedProduct = productMaster.find(p => p.id === newProductId)
    if (selectedProduct) {
      const updated = [...editableResults]
      updated[index] = {
        ...updated[index],
        productId: newProductId,
        productName: selectedProduct.name,
        matched: true
      }
      setEditableResults(updated)
    }
  }

  const handleQuantityChange = (index: number, newQuantity: number) => {
    const updated = [...editableResults]
    updated[index] = {
      ...updated[index],
      quantity: newQuantity
    }
    setEditableResults(updated)
  }

  const removeResult = (index: number) => {
    const updated = editableResults.filter((_, i) => i !== index)
    setEditableResults(updated)
  }

  const totalQuantity = editableResults.reduce((sum, result) => sum + result.quantity, 0)

  const handleConfirm = () => {
    onConfirm(editableResults)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
        <div className="p-6 border-b bg-gray-50">
          <h3 className="text-lg font-semibold">Amazon CSVインポート確認</h3>
          <p className="text-sm text-gray-600 mt-1">
            {month}月のAmazonデータを確認し、必要に応じて修正してください。
          </p>
          <div className="flex gap-4 mt-2 text-sm">
            <span className="text-blue-600">マッチング済み: {editableResults.length}件</span>
            <span className="text-green-600">合計販売数: {totalQuantity}個</span>
          </div>
        </div>

        <div className="p-4 overflow-y-auto max-h-96">
          {editableResults.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              マッチする商品が見つかりませんでした。
            </p>
          ) : (
            <div className="space-y-3">
              {editableResults.map((result, index) => (
                <div key={index} className="border rounded-lg p-4 bg-gray-50">
                  <div className="grid grid-cols-12 gap-4 items-center">
                    {/* Amazon商品名 */}
                    <div className="col-span-4">
                      <label className="text-xs text-gray-500">Amazon商品名</label>
                      <p className="text-sm font-medium truncate" title={result.amazonTitle}>
                        {result.amazonTitle}
                      </p>
                    </div>

                    {/* マッチした商品選択 */}
                    <div className="col-span-4">
                      <label className="text-xs text-gray-500">マッチ商品</label>
                      <select
                        value={result.productId}
                        onChange={(e) => handleProductChange(index, e.target.value)}
                        className="w-full text-sm border rounded px-2 py-1"
                      >
                        <option value="">商品を選択...</option>
                        {productMaster.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 販売数量 */}
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500">販売数</label>
                      <input
                        type="number"
                        value={result.quantity}
                        onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 0)}
                        className="w-full text-sm border rounded px-2 py-1"
                        min="0"
                      />
                    </div>

                    {/* 削除ボタン */}
                    <div className="col-span-2">
                      <button
                        onClick={() => removeResult(index)}
                        className="text-red-500 hover:text-red-700 text-sm px-2 py-1 border border-red-200 rounded hover:bg-red-50"
                      >
                        削除
                      </button>
                    </div>
                  </div>

                  {/* マッチング品質インジケーター */}
                  <div className="mt-2">
                    <div className={`text-xs px-2 py-1 rounded inline-block ${
                      result.matchType === 'exact' || result.matchType === 'learned' ? 'bg-green-100 text-green-800' :
                      result.matchType === 'high' ? 'bg-blue-100 text-blue-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {result.matchType === 'exact' ? '完全一致' :
                       result.matchType === 'learned' ? '学習済み（高精度）' :
                       result.matchType === 'high' ? '高精度マッチング' :
                       '要確認マッチング（手動選択推奨）'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            インポート後、データは即座に反映されます
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleConfirm}
              disabled={isSubmitting || editableResults.length === 0}
              className={`px-4 py-2 text-sm text-white rounded disabled:opacity-50 ${
                isSubmitting 
                  ? 'bg-blue-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isSubmitting ? '処理中...' : `${editableResults.length}件をインポート`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
