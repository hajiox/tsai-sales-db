// /components/AmazonCsvConfirmModal.tsx ver.3
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
  const [showUnmatched, setShowUnmatched] = useState(false)
  const [newProducts, setNewProducts] = useState<NewProduct[]>([])
  const [isAddingProduct, setIsAddingProduct] = useState(false)
  const [selectedUnmatchedIndex, setSelectedUnmatchedIndex] = useState<number | null>(null)
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

  // 商品追加モーダルを開く
  const openAddProductModal = (unmatchedIndex: number) => {
    setSelectedUnmatchedIndex(unmatchedIndex)
    setIsAddingProduct(true)
  }

  // 商品追加処理
  const handleAddProduct = async (productData: NewProduct) => {
    try {
      // API呼び出し（商品マスターに追加）
      const response = await fetch('/api/products/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: productData.productName,
          price: productData.price,
          amazonTitle: productData.amazonTitle
        }),
      })

      if (!response.ok) {
        throw new Error('商品追加に失敗しました')
      }

      const newProduct = await response.json()

      // 新しい商品を結果に追加
      const newResult: AmazonImportResult = {
        productId: newProduct.id,
        productName: newProduct.name,
        amazonTitle: productData.amazonTitle,
        quantity: productData.quantity,
        matched: true,
        matchType: 'exact'
      }

      setEditableResults(prev => [...prev, newResult])
      setIsAddingProduct(false)
      setSelectedUnmatchedIndex(null)

      // 成功メッセージ
      alert('商品を追加しました')
    } catch (error) {
      console.error('商品追加エラー:', error)
      alert('商品追加に失敗しました')
    }
  }

  // 未マッチング商品をスキップ
  const skipUnmatchedProduct = (index: number) => {
    // 特に処理は不要（単に無視）
    console.log(`未マッチング商品をスキップ: ${unmatchedProducts[index]?.amazonTitle}`)
  }

  // 未マッチング商品の手動選択
  const handleUnmatchedProductSelect = async (unmatchedIndex: number, productId: string) => {
    if (!productId) return
    
    const selectedProduct = productMaster.find(p => p.id === productId)
    if (!selectedProduct) return

    const unmatchedProduct = unmatchedProducts[unmatchedIndex]
    
    // 新しい商品結果として追加
    const newResult: AmazonImportResult = {
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      amazonTitle: unmatchedProduct.amazonTitle,
      quantity: unmatchedProduct.quantity,
      matched: true,
      matchType: 'medium' // 手動選択は中精度扱い
    }

    setEditableResults(prev => [...prev, newResult])

    // 学習データに追加（APIコール）
    try {
      await fetch('/api/products/add-learning', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amazonTitle: unmatchedProduct.amazonTitle,
          productId: selectedProduct.id
        }),
      })
      console.log('学習データに追加しました')
    } catch (error) {
      console.error('学習データ追加エラー:', error)
    }

    // 成功メッセージ
    alert(`「${selectedProduct.name}」を選択しました`)
  }

  // 統計計算用の関数
  const getMatchingStats = () => {
    const exact = editableResults.filter(r => r.matchType === 'exact')
    const learned = editableResults.filter(r => r.matchType === 'learned')
    const high = editableResults.filter(r => r.matchType === 'high')
    const medium = editableResults.filter(r => r.matchType === 'medium')
    const low = editableResults.filter(r => r.matchType === 'low')
    const unknown = editableResults.filter(r => !r.matchType)

    const highConfidence = [...exact, ...learned, ...high]
    const lowConfidence = [...medium, ...low, ...unknown]

    return {
      exact,
      learned,
      high,
      medium,
      low,
      unknown,
      highConfidence,
      lowConfidence,
      total: editableResults.length,
      totalQuantity: editableResults.reduce((sum, r) => sum + r.quantity, 0),
      highConfidenceQuantity: highConfidence.reduce((sum, r) => sum + r.quantity, 0),
      lowConfidenceQuantity: lowConfidence.reduce((sum, r) => sum + r.quantity, 0)
    }
  }

  const stats = getMatchingStats()

  const handleConfirm = () => {
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
          
          {/* 詳細統計情報 */}
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
              <div className="text-xs text-gray-500">({stats.highConfidenceQuantity.toLocaleString()}個)</div>
            </div>
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500">未マッチング商品</div>
              <div className="text-lg font-bold text-red-600">{unmatchedProducts.length}品種</div>
              <div className="text-xs text-gray-500">({unmatchedProducts.reduce((sum, p) => sum + p.quantity, 0).toLocaleString()}個)</div>
            </div>
          </div>

          {/* 未マッチング商品表示切り替えボタン */}
          {unmatchedProducts.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowUnmatched(!showUnmatched)}
                className="bg-red-100 text-red-800 px-4 py-2 rounded-lg hover:bg-red-200 transition-colors"
              >
                {showUnmatched ? '未マッチング商品を非表示' : `未マッチング商品を表示 (${unmatchedProducts.length}件)`}
              </button>
            </div>
          )}

          {/* マッチングタイプ別の詳細 */}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {stats.exact.length > 0 && (
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                完全一致: {stats.exact.length}品種 ({stats.exact.reduce((sum, r) => sum + r.quantity, 0)}個)
              </span>
            )}
            {stats.learned.length > 0 && (
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                学習済み: {stats.learned.length}品種 ({stats.learned.reduce((sum, r) => sum + r.quantity, 0)}個)
              </span>
            )}
            {stats.high.length > 0 && (
              <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded">
                高精度: {stats.high.length}品種 ({stats.high.reduce((sum, r) => sum + r.quantity, 0)}個)
              </span>
            )}
            {stats.medium.length > 0 && (
              <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                中精度: {stats.medium.length}品種 ({stats.medium.reduce((sum, r) => sum + r.quantity, 0)}個)
              </span>
            )}
            {stats.low.length > 0 && (
              <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded">
                低精度: {stats.low.length}品種 ({stats.low.reduce((sum, r) => sum + r.quantity, 0)}個)
              </span>
            )}
            {stats.unknown.length > 0 && (
              <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded">
                不明: {stats.unknown.length}品種 ({stats.unknown.reduce((sum, r) => sum + r.quantity, 0)}個)
              </span>
            )}
          </div>
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
                      <p className="text-sm font-medium text-gray-800 leading-relaxed">
                        {product.amazonTitle}
                      </p>
                    </div>
                    <div className="mb-3">
                      <label className="text-xs text-red-600 font-medium">販売数量</label>
                      <p className="text-lg font-bold text-red-600">{product.quantity.toLocaleString()}個</p>
                    </div>
                      {/* 手動商品選択 */}
                    <div className="mb-3">
                      <label className="text-xs text-red-600 font-medium block mb-1">既存商品から選択</label>
                      <select
                        onChange={(e) => handleUnmatchedProductSelect(index, e.target.value)}
                        className="w-full text-sm border border-red-300 rounded px-3 py-2"
                      >
                        <option value="">既存商品から選択...</option>
                        {productMaster.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openAddProductModal(index)}
                        className="flex-1 bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 transition-colors"
                      >
                        新商品追加
                      </button>
                      <button
                        onClick={() => skipUnmatchedProduct(index)}
                        className="flex-1 bg-gray-300 text-gray-700 px-3 py-2 rounded text-sm hover:bg-gray-400 transition-colors"
                      >
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
              <p className="text-sm text-red-600">CSV商品数とマッチング数に大きな差があります。商品マスターの確認が必要です。</p>
            </div>
          ) : (
            <>
              <h4 className="text-lg font-semibold mb-4 text-blue-600">マッチング済み商品一覧</h4>
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
            </>
          )}
        </div>

        <div className="border-t bg-gray-50 p-6 flex-shrink-0">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              <div>Amazon列のみを更新します（他のECサイトデータは保持）</div>
              <div className="text-xs text-red-600 mt-1">
                ⚠️ 未マッチング商品は商品追加後に再度インポートしてください
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="px-6 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleConfirm}
                disabled={isSubmitting || editableResults.length === 0}
                className={`px-6 py-2 text-sm text-white rounded disabled:opacity-50 transition-colors ${
                  isSubmitting 
                    ? 'bg-blue-400 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                    処理中...
                  </span>
                ) : (
                  `${editableResults.length}品種をDBに反映`
                )}
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

// 商品追加モーダルコンポーネント
interface ProductAddModalProps {
  isOpen: boolean
  unmatchedProduct: UnmatchedProduct
  onClose: () => void
  onAdd: (productData: NewProduct) => void
}

function ProductAddModal({ isOpen, unmatchedProduct, onClose, onAdd }: ProductAddModalProps) {
  const [productName, setProductName] = useState(unmatchedProduct?.amazonTitle || '')
  const [price, setPrice] = useState<number>(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!productName || !price) {
      alert('商品名と価格を入力してください')
      return
    }

    setIsSubmitting(true)
    try {
      await onAdd({
        amazonTitle: unmatchedProduct.amazonTitle,
        productName,
        price,
        quantity: unmatchedProduct.quantity
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[99999] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold">新商品追加</h3>
          <p className="text-sm text-gray-600 mt-1">
            未マッチング商品を商品マスターに追加します
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Amazon商品名</label>
            <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded border">
              {unmatchedProduct?.amazonTitle}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">販売数量</label>
            <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded border">
              {unmatchedProduct?.quantity.toLocaleString()}個
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">商品名 *</label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="商品マスターに登録する商品名"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">価格 *</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(parseInt(e.target.value) || 0)}
              className="w-full border rounded px-3 py-2"
              placeholder="商品価格（円）"
              min="0"
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? '追加中...' : '商品を追加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
