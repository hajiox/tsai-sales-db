// /components/ProductAddModal.tsx ver.3 (完全版)
"use client"

import React, { useState } from "react"

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
  seriesNumber: number
  productNumber: number
  seriesName: string
}

interface ProductAddModalProps {
  isOpen: boolean
  unmatchedProduct?: UnmatchedProduct
  onClose: () => void
  onAdd: (productData: NewProduct | { productName: string; price: number; seriesNumber: number; productNumber: number; seriesName: string }) => void
  existingProducts?: { seriesNumber: number; productNumber: number; name: string; seriesName: string }[]
}

export default function ProductAddModal({ 
  isOpen, 
  unmatchedProduct, 
  onClose, 
  onAdd,
  existingProducts = []
}: ProductAddModalProps) {
  const [productName, setProductName] = useState(unmatchedProduct?.amazonTitle || '')
  const [seriesNumber, setSeriesNumber] = useState<number | ''>('')
  const [productNumber, setProductNumber] = useState<number | ''>('')
  const [seriesName, setSeriesName] = useState('')
  const [price, setPrice] = useState<number>(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSeriesSuggestions, setShowSeriesSuggestions] = useState(false)

  // 未マッチング商品からの追加か、新規商品マスター追加かを判定
  const isFromUnmatched = !!unmatchedProduct

  // 既存のシリーズ名を取得
  const existingSeriesNames = [...new Set(existingProducts.map(p => p.seriesName))].filter(Boolean)
  
  // シリーズ名の候補をフィルタリング
  const seriesNameSuggestions = existingSeriesNames.filter(name => 
    name.toLowerCase().includes(seriesName.toLowerCase())
  )

  // 重複チェック関数
  const isDuplicate = () => {
    if (!seriesNumber || !productNumber) return false
    return existingProducts.some(p => 
      p.seriesNumber === Number(seriesNumber) && p.productNumber === Number(productNumber)
    )
  }

  // 重複する商品情報を取得
  const duplicateProduct = existingProducts.find(p => 
    p.seriesNumber === Number(seriesNumber) && p.productNumber === Number(productNumber)
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // 重複チェック
    if (isDuplicate()) {
      alert(`エラー: シリーズ番号${seriesNumber}・商品番号${productNumber}は既に存在します。\n既存商品: ${duplicateProduct?.name}`)
      return
    }
    
    if (!productName || !seriesNumber || !productNumber || !seriesName || !price) {
      alert('全ての項目を入力してください')
      return
    }

    setIsSubmitting(true)
    try {
      if (isFromUnmatched) {
        // 未マッチング商品からの追加
        await onAdd({
          amazonTitle: unmatchedProduct!.amazonTitle,
          productName,
          seriesNumber: Number(seriesNumber),
          productNumber: Number(productNumber),
          seriesName,
          price,
          quantity: unmatchedProduct!.quantity
        })
      } else {
        // 商品マスター直接追加
        await onAdd({
          productName,
          seriesNumber: Number(seriesNumber),
          productNumber: Number(productNumber),
          seriesName,
          price
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setProductName('')
    setSeriesNumber('')
    setProductNumber('')
    setSeriesName('')
    setPrice(0)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[99999] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold">
            {isFromUnmatched ? '未マッチング商品の追加' : '商品マスター登録'}
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            {isFromUnmatched 
              ? '未マッチング商品を商品マスターに追加します'
              : '新しい商品を商品マスターに登録します'
            }
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* 未マッチング商品の場合のみ表示 */}
          {isFromUnmatched && (
            <>
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
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">シリーズ番号 *</label>
              <input
                type="number"
                value={seriesNumber}
                onChange={(e) => setSeriesNumber(e.target.value ? Number(e.target.value) : '')}
                className={`w-full border rounded px-3 py-2 ${isDuplicate() ? 'border-red-500 bg-red-50' : ''}`}
                placeholder="例: 1"
                min="1"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">商品番号 *</label>
              <input
                type="number"
                value={productNumber}
                onChange={(e) => setProductNumber(e.target.value ? Number(e.target.value) : '')}
                className={`w-full border rounded px-3 py-2 ${isDuplicate() ? 'border-red-500 bg-red-50' : ''}`}
                placeholder="例: 10"
                min="1"
                required
              />
            </div>
          </div>

          {/* 重複エラー表示 */}
          {isDuplicate() && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">
                ⚠️ <strong>エラー:</strong> シリーズ番号{seriesNumber}・商品番号{productNumber}は既に存在します<br />
                <strong>既存商品:</strong> {duplicateProduct?.name} ({duplicateProduct?.seriesName})
              </p>
            </div>
          )}

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

          <div className="relative">
            <label className="block text-sm font-medium mb-2">シリーズ名 *</label>
            <input
              type="text"
              value={seriesName}
              onChange={(e) => {
                setSeriesName(e.target.value)
                setShowSeriesSuggestions(e.target.value.length > 0)
              }}
              onFocus={() => setShowSeriesSuggestions(seriesName.length > 0)}
              onBlur={() => setTimeout(() => setShowSeriesSuggestions(false), 200)}
              className="w-full border rounded px-3 py-2"
              placeholder="例: チャーシュー焼豚"
              required
            />
            
            {/* シリーズ名候補表示 */}
            {showSeriesSuggestions && seriesNameSuggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-40 overflow-y-auto">
                {seriesNameSuggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => {
                      setSeriesName(suggestion)
                      setShowSeriesSuggestions(false)
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            
            {existingSeriesNames.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                既存シリーズ: {existingSeriesNames.slice(0, 3).join(', ')}
                {existingSeriesNames.length > 3 && ` 他${existingSeriesNames.length - 3}件`}
              </p>
            )}
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
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isDuplicate()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? '登録中...' : (isFromUnmatched ? '商品を追加' : '商品を登録')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
