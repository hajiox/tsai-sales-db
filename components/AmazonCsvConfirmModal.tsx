// /components/AmazonCsvConfirmModal.tsx ver.2
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
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden mx-4">
        <div className="p-6 border-b bg-gray-50">
          <h3 className="text-lg font-semibold">Amazon CSVインポート確認</h3>
          <p className="text-sm text-gray-600 mt-1">
            {month}月のAmazonデータを確認し、必要に応じて修正してください。
          </p>
          
          {/* 詳細統計情報 */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500">マッチング済み商品</div>
              <div className="text-lg font-bold text-blue-600">{editableResults.length}品種</div>
            </div>
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500">合計販売数量</div>
              <div className="text-lg font-bold text-green-600">{totalQuantity.toLocaleString()}個</div>
            </div>
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500">高精度マッチング</div>
              <div className="text-lg font-bold text-emerald-600">
                {editableResults.filter(r => r.matchType === 'exact' || r.matchType === 'learned' || r.matchType === 'high').length}品種
              </div>
              <div className="text-xs text-gray-500">
                ({editableResults.filter(r => r.matchType === 'exact' || r.matchType === 'learned' || r.matchType === 'high')
                  .reduce((sum, r) => sum + r.quantity, 0).toLocaleString()}個)
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500">要確認マッチング</div>
              <div className="text-lg font-bold text-yellow-600">
                {editableResults.filter(r => r.matchType === 'medium' || r.matchType === 'low' || !r.matchType).length}品種
              </div>
              <div className="text-xs text-gray-500">
                ({editableResults.filter(r => r.matchType === 'medium' || r.matchType === 'low' || !r.matchType)
                  .reduce((sum, r) => sum + r.quantity, 0).toLocaleString()}個)
              </div>
            </div>
          </div>

          {/* マッチングタイプ別の詳細 */}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {editableResults.filter(r => r.matchType === 'exact').length > 0 && (
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                完全一致: {editableResults.filter(r => r.matchType === 'exact').length}品種
              </span>
            )}
            {editableResults.filter(r => r.matchType === 'learned').length > 0 && (
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                学習済み: {editableResults.filter(r => r.matchType === 'learned').length}品種
              </span>
            )}
            {editableResults.filter(r => r.matchType === 'high').length > 0 && (
              <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded">
                高精度: {editableResults.filter(r => r.matchType === 'high').length}品種
              </span>
            )}
            {editableResults.filter(r => r.matchType === 'medium' || r.matchType === 'low' || !r.matchType).length > 0 && (
              <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                要確認: {editableResults.filter(r => r.matchType === 'medium' || r.matchType === 'low' || !r.matchType).length}品種
              </span>
            )}
          </div>
        </div>

        <div className="p-4 overflow-y-auto max-h-[70vh]">
          {editableResults.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              マッチする商品が見つかりませんでした。
            </p>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {editableResults.map((result, index) => (
                <div key={index} className="border rounded-lg p-4 bg-gray-50">
                  {/* Amazon商品名 - 全文表示 */}
                  <div className="mb-4">
                    <label className="text-xs text-gray-500 font-medium">Amazon商品名</label>
                    <p className="text-sm font-medium text-gray-800 leading-relaxed">
                      {result.amazonTitle}
                    </p>
                  </div>

                  {/* マッチした商品選択 */}
                  <div className="mb-4">
                    <label className="text-xs text-gray-500 font-medium block mb-1">マッチ商品</label>
                    <select
                      value={result.productId}
                      onChange={(e) => handleProductChange(index, e.target.value)}
                      className="w-full text-sm border rounded px-3 py-2"
                    >
                      <option value="">商品を選択...</option>
                      {productMaster.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 販売数量と削除ボタン */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 font-medium block mb-1">販売数</label>
                      <input
                        type="number"
                        value={result.quantity}
                        onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 0)}
                        className="w-full text-sm border rounded px-3 py-2"
                        min="0"
                      />
                    </div>
                    <div className="pt-6">
                      <button
                        onClick={() => removeResult(index)}
                        className="text-red-500 hover:text-red-700 text-sm px-3 py-2 border border-red-200 rounded hover:bg-red-50"
                      >
                        削除
                      </button>
                    </div>
                  </div>

                  {/* マッチング品質インジケーター */}
                  <div>
                    <div className={`text-xs px-3 py-1 rounded inline-block ${
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
              className="px-6 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              onClick={handleConfirm}
              disabled={isSubmitting || editableResults.length === 0}
              className={`px-6 py-2 text-sm text-white rounded disabled:opacity-50 ${
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
