// /components/AmazonCsvConfirmModal.tsx ver.6 (分割版・重複チェック機能付き)
"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import ProductAddModal from "./ProductAddModal"
import DuplicateAlert from "./DuplicateAlert"
import ProductItem from "./ProductItem"
import { useDuplicateChecker } from "@/hooks/useDuplicateChecker"

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
  
  const { cleanResults, duplicates, stats, updateResults } = useDuplicateChecker(results, productMaster)
  const [showUnmatched, setShowUnmatched] = useState(false)
  const [showZeroQuantity, setShowZeroQuantity] = useState(false)
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false)
  const [isAddingProduct, setIsAddingProduct] = useState(false)
  const [selectedUnmatchedIndex, setSelectedUnmatchedIndex] = useState<number | null>(null)
  const [manualSelections, setManualSelections] = useState<{amazonTitle: string, productId: string}[]>([])

  const handleProductChange = (index: number, newProductId: string) => {
    const selectedProduct = productMaster.find(p => p.id === newProductId)
    if (selectedProduct) {
      const updated = [...cleanResults]
      updated[index] = {
        ...updated[index],
        productId: newProductId,
        productName: selectedProduct.name,
        matched: true
      }
      updateResults(updated)

      // 学習データ対象チェック
      if (updated[index].hasData) {
        setManualSelections(prev => [...prev, {
          amazonTitle: updated[index].amazonTitle,
          productId: newProductId
        }])
      }
    }
  }

  const handleQuantityChange = (index: number, newQuantity: number) => {
    const updated = [...cleanResults]
    updated[index] = { ...updated[index], quantity: newQuantity }
    updateResults(updated)
  }

  const removeResult = (index: number) => {
    const updated = [...cleanResults]
    updated[index] = {
      ...updated[index],
      quantity: 0,
      amazonTitle: '',
      hasData: false,
      matchType: 'none',
      isDuplicate: false
    }
    updateResults(updated)
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
      const newResult = {
        productId: newProduct.product.id,
        productName: newProduct.product.name,
        amazonTitle: productData.amazonTitle,
        quantity: productData.quantity,
        matched: true,
        matchType: 'exact' as const,
        hasData: true,
        isDuplicate: false
      }

      updateResults(prev => [...prev, newResult])
      setIsAddingProduct(false)
      setSelectedUnmatchedIndex(null)
      alert('商品を追加しました')
    } catch (error) {
      console.error('商品追加エラー:', error)
      alert('商品追加に失敗しました')
    }
  }

  const handleConfirm = async () => {
    // 重複がある場合は警告
    if (duplicates.length > 0) {
      const duplicateNames = duplicates.map(d => d.productName).join('\n')
      if (!confirm(`🚨 重複が検出されました！\n\n重複商品:\n${duplicateNames}\n\n数量は自動で合計されます。続行しますか？`)) {
        return
      }
    }

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
      } catch (error) {
        console.error('学習データ追加エラー:', error)
      }
    }
    
    // データありの商品のみをconfirmに渡す
    const resultsToConfirm = cleanResults
      .filter(r => r.hasData && r.quantity > 0)
      .map(r => ({
        productId: r.productId,
        productName: r.productName,
        amazonTitle: r.amazonTitle,
        quantity: r.quantity,
        matched: r.matched,
        matchType: r.matchType as any
      }))
    
    onConfirm(resultsToConfirm)
  }

  if (!isOpen) return null

  // 表示用データのフィルタリング
  let displayResults = cleanResults
  if (showDuplicatesOnly) {
    displayResults = cleanResults.filter(r => r.isDuplicate)
  } else if (!showZeroQuantity) {
    displayResults = cleanResults.filter(r => r.hasData && r.quantity > 0)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b bg-gray-50 flex-shrink-0">
          <h3 className="text-lg font-semibold">Amazon CSVインポート確認</h3>
          <p className="text-sm text-gray-600 mt-1">
            {month}月のAmazonデータを確認し、必要に応じて修正してください。
          </p>
          
          <DuplicateAlert duplicates={duplicates} />
          
          {/* 統計情報 */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500">全商品数</div>
              <div className="text-lg font-bold text-blue-600">{stats.total}品種</div>
            </div>
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500">データあり商品</div>
              <div className="text-lg font-bold text-green-600">{stats.withData}品種</div>
            </div>
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500">合計販売数量</div>
              <div className="text-lg font-bold text-green-600">{stats.totalQuantity.toLocaleString()}個</div>
            </div>
            <div className={`bg-white rounded-lg p-3 border ${stats.duplicateCount > 0 ? 'border-red-300 bg-red-50' : ''}`}>
              <div className="text-xs text-gray-500">重複商品</div>
              <div className={`text-lg font-bold ${stats.duplicateCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {stats.duplicateCount}品種
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500">CSV元行数</div>
              <div className="text-lg font-bold text-gray-600">{stats.csvOriginalCount}行</div>
            </div>
          </div>

          {/* 表示切り替えボタン */}
          <div className="mt-4 flex gap-2 flex-wrap">
            <button
              onClick={() => setShowZeroQuantity(!showZeroQuantity)}
              className={`px-4 py-2 rounded-lg text-sm ${
                showZeroQuantity ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {showZeroQuantity ? `データなし商品を非表示` : `すべて表示 (${stats.total}品種)`}
            </button>
            
            {stats.duplicateCount > 0 && (
              <button
                onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
                className={`px-4 py-2 rounded-lg text-sm ${
                  showDuplicatesOnly ? 'bg-red-600 text-white' : 'bg-red-100 text-red-800 hover:bg-red-200'
                }`}
              >
                {showDuplicatesOnly ? '全商品表示' : `重複商品のみ表示 (${stats.duplicateCount}品種)`}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          <h4 className="text-lg font-semibold mb-4 text-blue-600">
            {showDuplicatesOnly ? `重複商品一覧 (${displayResults.length}品種)` : `全商品一覧 (${displayResults.length}品種表示中)`}
          </h4>
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
            <p className="text-sm text-blue-700">
              <strong>💡 数字の流れ:</strong> 
              CSV元データ{stats.csvOriginalCount}行 → 統合後{stats.withData}品種（重複{stats.duplicateCount}件統合済み）
              = 数量{stats.totalQuantity.toLocaleString()}個
            </p>
          </div>
          
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {displayResults.map((result, index) => (
              <ProductItem
                key={`${result.productId}-${index}`}
                result={result}
                index={index}
                productMaster={productMaster}
                onProductChange={handleProductChange}
                onQuantityChange={handleQuantityChange}
                onRemove={removeResult}
              />
            ))}
          </div>
        </div>

        <div className="border-t bg-gray-50 p-6 flex-shrink-0">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              <div>Amazon列のみを更新します（他のECサイトデータは保持）</div>
              <div className="text-xs text-blue-600 mt-1">
                ✅ データあり{stats.withData}品種・{stats.totalQuantity.toLocaleString()}個をDBに保存
                {stats.duplicateCount > 0 && (
                  <span className="text-red-600 ml-2">🚨 重複{stats.duplicateCount}件統合済み</span>
                )}
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
                disabled={isSubmitting || stats.withData === 0}
                className={`px-6 py-2 text-sm text-white rounded disabled:opacity-50 ${
                  stats.duplicateCount > 0 ? 'bg-red-600 hover:bg-red-700' :
                  isSubmitting ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isSubmitting ? '処理中...' : 
                 stats.duplicateCount > 0 ? `重複統合して${stats.withData}品種をDBに反映` :
                 `${stats.withData}品種をDBに反映`}
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
