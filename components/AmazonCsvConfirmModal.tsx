// /components/AmazonCsvConfirmModal.tsx ver.4 (短縮版)
"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import ProductAddModal from "./ProductAddModal"

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
  unmatchedProducts: UnmatchedProduct[]
  csvSummary: any
  productMaster: { id: string; name: string }[]
  month: string
  isSubmitting: boolean
  onClose: () => void
  onConfirm: (updatedResults: AmazonImportResult[]) => void
}

interface UnmatchedProduct {
  amazonTitle: string
  quantity: number
  matched: false
}

interface NewProduct {
  amazonTitle: string
  productName: string
  price: number
  quantity: number
}

export default function AmazonCsvConfirmModal({
  isOpen,
  results,
  unmatchedProducts = [],
  csvSummary = null,
  productMaster,
  month,
  isSubmitting,
  onClose,
  onConfirm,
}: AmazonCsvConfirmModalProps) {
  const [editableResults, setEditableResults] = useState<AmazonImportResult[]>(results)
  const [originalResults, setOriginalResults] = useState<AmazonImportResult[]>(results)
  const [showUnmatched, setShowUnmatched] = useState(false)
  const [isAddingProduct, setIsAddingProduct] = useState(false)
  const [selectedUnmatchedIndex, setSelectedUnmatchedIndex] = useState<number | null>(null)
  const [manualSelections, setManualSelections] = useState<{amazonTitle: string, productId: string}[]>([])
  const router = useRouter()

  // 結果が更新されたら編集可能な結果も更新
  React.useEffect(() => {
    setEditableResults(results)
    setOriginalResults(results)
  }, [results])

  const handleProductChange = (index: number, newProductId: string) => {
    const selectedProduct = productMaster.find(p => p.id === newProductId)
    if (selectedProduct) {
      const updated = [...editableResults]
      const originalProduct = originalResults[index]
      
      updated[index] = {
        ...updated[index],
        productId: newProductId,
        productName: selectedProduct.name,
        matched: true
      }
      setEditableResults(updated)

      // 元の結果と異なる場合は学習データ対象に追加
      if (originalProduct && originalProduct.productId !== newProductId) {
        const existingSelection = manualSelections.find(s => s.amazonTitle === updated[index].amazonTitle)
        if (existingSelection) {
          setManualSelections(prev => prev.map(s => 
            s.amazonTitle === updated[index].amazonTitle 
              ? { ...s, productId: newProductId }
              : s
          ))
        } else {
          setManualSelections(prev => [...prev, {
            amazonTitle: updated[index].amazonTitle,
            productId: newProductId
          }])
        }
        console.log(`学習対象追加: ${updated[index].amazonTitle} → ${selectedProduct.name}`)
      }
    }
  }

  const handleQuantityChange = (index: number, newQuantity: number) => {
    const updated = [...editableResults]
    updated[index] = { ...updated[index], quantity: newQuantity }
    setEditableResults(updated)
  }

  const removeResult = (index: number) => {
    const updated = editableResults.filter((_, i) => i !== index)
    setEditableResults(updated)
  }

  const openAddProductModal = (unmatchedIndex: number) => {
    setSelectedUnmatchedIndex(unmatchedIndex)
    setIsAddingProduct(true)
  }

  const handleAddProduct = async (productData: NewProduct) => {
    try {
      const response = await fetch('/api/products/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: productData.productName,
          price: productData.price,
          amazonTitle: productData.amazonTitle
        }),
      })

      if (!response.ok) throw new Error('商品追加に失敗しました')

      const newProduct = await response.json()
      const newResult: AmazonImportResult = {
        productId: newProduct.product.id,
        productName: newProduct.product.name,
        amazonTitle: productData.amazonTitle,
        quantity: productData.quantity,
        matched: true,
        matchType: 'exact'
      }

      setEditableResults(prev => [...prev, newResult])
      setIsAddingProduct(false)
      setSelectedUnmatchedIndex(null)
      alert('商品を追加しました')
    } catch (error) {
      console.error('商品追加エラー:', error)
      alert('商品追加に失敗しました')
    }
  }

  const handleUnmatchedProductSelect = (unmatchedIndex: number, productId: string) => {
    if (!productId) return
    
    const selectedProduct = productMaster.find(p => p.id === productId)
    if (!selectedProduct) return

    const unmatchedProduct = unmatchedProducts[unmatchedIndex]
    const newResult: AmazonImportResult = {
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      amazonTitle: unmatchedProduct.amazonTitle,
      quantity: unmatchedProduct.quantity,
      matched: true,
      matchType: 'medium'
    }

    setEditableResults(prev => [...prev, newResult])
    setManualSelections(prev => [...prev, {
      amazonTitle: unmatchedProduct.amazonTitle,
      productId: selectedProduct.id
    }])

    console.log(`商品選択: ${selectedProduct.name}（学習データ登録は確定時）`)
  }

  const getMatchingStats = () => {
    const exact = editableResults.filter(r => r.matchType === 'exact')
    const learned = editableResults.filter(r => r.matchType === 'learned')
    const high = editableResults.filter(r => r.matchType === 'high')
    const medium = editableResults.filter(r => r.matchType === 'medium')
    const low = editableResults.filter(r => r.matchType === 'low')

    const highConfidence = [...exact, ...learned, ...high]
    const lowConfidence = [...medium, ...low]

    return {
      exact, learned, high, medium, low,
      highConfidence, lowConfidence,
      total: editableResults.length,
      totalQuantity: editableResults.reduce((sum, r) => sum + r.quantity, 0),
      highConfidenceQuantity: highConfidence.reduce((sum, r) => sum + r.quantity, 0),
      lowConfidenceQuantity: lowConfidence.reduce((sum, r) => sum + r.quantity, 0)
    }
  }

  const stats = getMatchingStats()

  const handleConfirm = async () => {
    // 学習データ一括登録
    for (const selection of manualSelections) {
      try {
        await fetch('/api/products/add-learning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amazonTitle: selection.amazonTitle,
            productId: selection.productId
          }),
        })
        console.log(`学習データ登録: ${selection.amazonTitle}`)
      } catch (error) {
        console.error('学習データ追加エラー:', error)
      }
    }
    
    onConfirm(editableResults)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b bg-gray-50 flex-shrink-0">
          <h3 className="text-lg font-semibold">Amazon CSVインポート確認</h3>
          <p className="text-sm text-gray-600 mt-1">
            {month}月のAmazonデータを確認し、必要に応じて修正してください。
          </p>
          
          {/* 統計情報 */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500">マッチング済み商品</div>
              <div className="text-lg font-bold text-blue-600">{stats.total}品種</div>
            </div>
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500">合計販売数量</div>
              <div className="text-lg font-bold text-green-600">{stats.totalQuantity.toLocaleString()}個</div>
            </div>
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500">高精度マッチング</div>
              <div className="text-lg font-bold text-emerald-600">{stats.highConfidence.length}品種</div>
            </div>
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500">未マッチング商品</div>
              <div className="text-lg font-bold text-red-600">{unmatchedProducts.length}品種</div>
            </div>
          </div>

          {/* 未マッチング表示切り替え */}
          {unmatchedProducts.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowUnmatched(!showUnmatched)}
                className="bg-red-100 text-red-800 px-4 py-2 rounded-lg hover:bg-red-200"
              >
                {showUnmatched ? '未マッチング商品を非表示' : `未マッチング商品を表示 (${unmatchedProducts.length}件)`}
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          {/* 未マッチング商品セクション */}
          {showUnmatched && unmatchedProducts.length > 0 && (
            <div className="mb-6">
              <h4 className="text-lg font-semibold mb-4 text-red-600">未マッチング商品一覧</h4>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
                {unmatchedProducts.map((product, index) => (
                  <div key={index} className="border-2 border-red-200 rounded-lg p-4 bg-red-50">
                    <div className="mb-3">
                      <label className="text-xs text-red-600 font-medium">Amazon商品名</label>
                      <p className="text-sm font-medium text-gray-800">{product.amazonTitle}</p>
                    </div>
                    <div className="mb-3">
                      <label className="text-xs text-red-600 font-medium">販売数量</label>
                      <p className="text-lg font-bold text-red-600">{product.quantity.toLocaleString()}個</p>
                    </div>
                    <div className="mb-3">
                      <label className="text-xs text-red-600 font-medium block mb-1">既存商品から選択</label>
                      <select
                        onChange={(e) => handleUnmatchedProductSelect(index, e.target.value)}
                        className="w-full text-sm border border-red-300 rounded px-3 py-2"
                      >
                        <option value="">既存商品から選択...</option>
                        {productMaster.map((product) => (
                          <option key={product.id} value={product.id}>{product.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openAddProductModal(index)}
                        className="flex-1 bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700"
                      >
                        新商品追加
                      </button>
                      <button className="flex-1 bg-gray-300 text-gray-700 px-3 py-2 rounded text-sm hover:bg-gray-400">
                        スキップ
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* マッチング済み商品セクション */}
          {editableResults.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 mb-4">マッチする商品が見つかりませんでした。</p>
            </div>
          ) : (
            <>
              <h4 className="text-lg font-semibold mb-4 text-blue-600">マッチング済み商品一覧（全て修正可能）</h4>
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm text-blue-700">
                  <strong>💡 重要:</strong> 高精度・中精度マッチングでも間違いがある場合があります。
                  全ての商品を確認し、必要に応じて修正してください。
                </p>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {editableResults.map((result, index) => (
                  <div key={index} className={`border rounded-lg p-4 ${
                    result.matchType === 'exact' || result.matchType === 'learned' ? 'bg-green-50 border-green-200' :
                    result.matchType === 'high' ? 'bg-blue-50 border-blue-200' :
                    result.matchType === 'medium' ? 'bg-yellow-50 border-yellow-200' :
                    'bg-orange-50 border-orange-200'
                  }`}>
                    <div className="mb-4">
                      <label className="text-xs text-gray-500 font-medium">Amazon商品名</label>
                      <p className="text-sm font-medium text-gray-800">{result.amazonTitle}</p>
                    </div>

                    <div className="mb-4">
                      <label className="text-xs text-gray-500 font-medium block mb-1">
                        マッチ商品（修正可能）
                        <span className="ml-2 text-xs text-blue-600">※要確認</span>
                      </label>
                      <select
                        value={result.productId}
                        onChange={(e) => handleProductChange(index, e.target.value)}
                        className="w-full text-sm border rounded px-3 py-2"
                      >
                        <option value="">商品を選択...</option>
                        {productMaster.map((product) => (
                          <option key={product.id} value={product.id}>{product.name}</option>
                        ))}
                      </select>
                    </div>

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
                          className="text-red-500 hover:text-red-700 text-sm px-3 py-2 border border-red-200 rounded"
                        >
                          削除
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className={`text-xs px-3 py-1 rounded inline-block ${
                        result.matchType === 'exact' || result.matchType === 'learned' ? 'bg-green-100 text-green-800' :
                        result.matchType === 'high' ? 'bg-blue-100 text-blue-800' :
                        result.matchType === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-orange-100 text-orange-800'
                      }`}>
                        {result.matchType === 'exact' ? '完全一致（要確認）' :
                         result.matchType === 'learned' ? '学習済み（要確認）' :
                         result.matchType === 'high' ? '高精度（要確認）' :
                         result.matchType === 'medium' ? '中精度（要確認）' :
                         '低精度（要確認）'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="border-t bg-gray-50 p-6 flex-shrink-0">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              <div>Amazon列のみを更新します（他のECサイトデータは保持）</div>
              <div className="text-xs text-blue-600 mt-1">
                ✅ 全ての修正内容が学習データに反映され、次回の精度が向上します
              </div>
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
                  isSubmitting ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isSubmitting ? '処理中...' : `${editableResults.length}品種をDBに反映`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 商品追加モーダル */}
      {isAddingProduct && selectedUnmatchedIndex !== null && (
        <ProductAddModal
          isOpen={isAddingProduct}
          unmatchedProduct={unmatchedProducts[selectedUnmatchedIndex]}
          onClose={() => {
            setIsAddingProduct(false)
            setSelectedUnmatchedIndex(null)
          }}
          onAdd={handleAddProduct}
        />
      )}
    </div>
  )
}
