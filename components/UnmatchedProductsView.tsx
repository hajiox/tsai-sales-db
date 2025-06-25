// /components/UnmatchedProductsView.tsx ver.1 (未マッチング商品表示専用)
"use client"

import React from "react"

interface UnmatchedProduct {
  amazonTitle: string
  quantity: number
  matched: false
}

interface UnmatchedProductsViewProps {
  unmatchedProducts: UnmatchedProduct[]
  productMaster: { id: string; name: string }[]
  showUnmatched: boolean
  onToggleShow: () => void
  onUnmatchedProductSelect: (unmatchedIndex: number, productId: string) => void
  onOpenAddProductModal: (unmatchedIndex: number) => void
}

export default function UnmatchedProductsView({
  unmatchedProducts,
  productMaster,
  showUnmatched,
  onToggleShow,
  onUnmatchedProductSelect,
  onOpenAddProductModal
}: UnmatchedProductsViewProps) {

  if (unmatchedProducts.length === 0) return null

  return (
    <>
      {/* 未マッチング警告・表示ボタン */}
      <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
        <h4 className="text-orange-800 font-semibold mb-2">⚠️ 未マッチング検出！</h4>
        <p className="text-sm text-orange-700 mb-2">
          <strong>{unmatchedProducts.length}商品（{unmatchedProducts.reduce((sum, u) => sum + u.quantity, 0)}個）</strong>が未マッチングです。手動で商品を選択してください。
        </p>
        <button
          onClick={onToggleShow}
          className="px-4 py-2 bg-orange-600 text-white rounded text-sm hover:bg-orange-700"
        >
          {showUnmatched ? '未マッチング商品を非表示' : '🔍 未マッチング商品を表示・修正'}
        </button>
      </div>

      {/* 未マッチング商品リスト */}
      {showUnmatched && (
        <div className="mt-6">
          <h4 className="text-lg font-semibold mb-4 text-orange-600">
            未マッチング商品一覧 ({unmatchedProducts.length}商品)
          </h4>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {unmatchedProducts.map((unmatched, index) => (
              <div key={index} className="border border-orange-300 rounded-lg p-4 bg-orange-50">
                <div className="mb-3">
                  <label className="text-xs text-gray-500 font-medium">未マッチングCSV商品名</label>
                  <p className="text-sm font-bold text-gray-800 break-words">{unmatched.amazonTitle}</p>
                </div>
                
                <div className="mb-3">
                  <label className="text-xs text-gray-500 font-medium block mb-1">商品マスターを選択</label>
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        onUnmatchedProductSelect(index, e.target.value)
                      }
                    }}
                    className="w-full text-sm border border-orange-300 rounded px-3 py-2 bg-white"
                  >
                    <option value="">商品を選択...</option>
                    {productMaster.map((product) => (
                      <option key={product.id} value={product.id}>{product.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-gray-500">数量: </span>
                    <span className="font-medium text-orange-700">{unmatched.quantity}個</span>
                  </div>
                  <button
                    onClick={() => onOpenAddProductModal(index)}
                    className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    新商品として追加
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
