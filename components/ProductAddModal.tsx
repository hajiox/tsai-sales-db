// /components/ProductAddModal.tsx ver.2 (汎用版)
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
}

interface ProductAddModalProps {
  isOpen: boolean
  unmatchedProduct?: UnmatchedProduct  // 🔥 オプショナルに変更
  onClose: () => void
  onAdd: (productData: NewProduct | { productName: string; price: number }) => void
}

export default function ProductAddModal({ 
  isOpen, 
  unmatchedProduct, 
  onClose, 
  onAdd 
}: ProductAddModalProps) {
  const [productName, setProductName] = useState(unmatchedProduct?.amazonTitle || '')
  const [price, setPrice] = useState<number>(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 🔥 未マッチング商品からの追加か、新規商品マスター追加かを判定
  const isFromUnmatched = !!unmatchedProduct

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!productName || !price) {
      alert('商品名と価格を入力してください')
      return
    }

    setIsSubmitting(true)
    try {
      if (isFromUnmatched) {
        // 未マッチング商品からの追加
        await onAdd({
          amazonTitle: unmatchedProduct!.amazonTitle,
          productName,
          price,
          quantity: unmatchedProduct!.quantity
        })
      } else {
        // 商品マスター直接追加
        await onAdd({
          productName,
          price
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setProductName('')
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
          {/* 🔥 未マッチング商品の場合のみ表示 */}
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
              onClick={handleClose}
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
              {isSubmitting ? '登録中...' : (isFromUnmatched ? '商品を追加' : '商品を登録')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
