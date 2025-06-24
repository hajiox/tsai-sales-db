// /components/ProductListView.tsx ver.1 (商品リスト表示専用)
"use client"

import React from "react"

interface AllProductResult {
  productId: string
  productName: string
  amazonTitle: string
  quantity: number
  matched: boolean
  matchType?: 'exact' | 'learned' | 'high' | 'medium' | 'low' | 'none'
  hasData: boolean
  isDuplicate?: boolean
  duplicateInfo?: DuplicateInfo
}

interface DuplicateInfo {
  count: number
  amazonTitles: string[]
  totalQuantity: number
  originalQuantities: number[]
}

interface ProductListViewProps {
  displayResults: AllProductResult[]
  productMaster: { id: string; name: string }[]
  showDuplicatesOnly: boolean
  onProductChange: (index: number, newProductId: string) => void
  onQuantityChange: (index: number, newQuantity: number) => void
  onRemoveResult: (index: number) => void
  onShowDuplicateResolver: () => void
}

export default function ProductListView({
  displayResults,
  productMaster,
  showDuplicatesOnly,
  onProductChange,
  onQuantityChange,
  onRemoveResult,
  onShowDuplicateResolver
}: ProductListViewProps) {

  return (
    <>
      <h4 className="text-lg font-semibold mb-4 text-blue-600">
        {showDuplicatesOnly ? `重複商品一覧 (${displayResults.length}品種)` : `商品一覧 (${displayResults.length}品種表示中)`}
      </h4>
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {displayResults.map((result, index) => (
          <div key={`${result.productId}-${index}`} className={`border rounded-lg p-4 ${
            result.isDuplicate ? 'bg-red-50 border-red-300' :
            !result.hasData ? 'bg-gray-50 border-gray-200' :
            result.matchType === 'exact' || result.matchType === 'learned' ? 'bg-green-50 border-green-200' :
            'bg-blue-50 border-blue-200'
          }`}>
            
            {/* 重複警告 */}
            {result.isDuplicate && result.duplicateInfo && (
              <div className="mb-4 p-2 bg-red-100 border border-red-200 rounded">
                <div className="text-xs text-red-700 font-semibold">🚨 重複検出</div>
                <div className="text-xs text-red-600 mt-1">
                  {result.duplicateInfo.count}件のCSV商品が統合済み
                </div>
                <button
                  onClick={onShowDuplicateResolver}
                  className="mt-2 text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  個別修正
                </button>
              </div>
            )}

            {/* 商品名 */}
            <div className="mb-3">
              <label className="text-xs text-gray-500 font-medium">商品名</label>
              <p className="text-sm font-bold text-gray-800">{result.productName}</p>
            </div>

            {/* Amazon商品名 */}
            {result.hasData && (
              <div className="mb-3">
                <label className="text-xs text-gray-500 font-medium">Amazon商品名</label>
                <p className="text-sm text-gray-700 break-words">{result.amazonTitle}</p>
              </div>
            )}

            {/* 商品選択・数量・削除 */}
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 font-medium block mb-1">商品選択</label>
                <select
                  value={result.productId}
                  onChange={(e) => onProductChange(index, e.target.value)}
                  className="w-full text-sm border rounded px-3 py-2"
                  disabled={!result.hasData}
                >
                  <option value="">商品を選択...</option>
                  {productMaster.map((product) => (
                    <option key={product.id} value={product.id}>{product.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 font-medium block mb-1">販売数</label>
                  <input
                    type="number"
                    value={result.quantity}
                    onChange={(e) => onQuantityChange(index, parseInt(e.target.value) || 0)}
                    className="w-full text-sm border rounded px-3 py-2"
                    min="0"
                    disabled={!result.hasData}
                  />
                </div>
                {result.hasData && (
                  <div className="pt-6">
                    <button
                      onClick={() => onRemoveResult(index)}
                      className="text-red-500 hover:text-red-700 text-sm px-3 py-2 border border-red-200 rounded"
                    >
                      削除
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ステータス表示 */}
            <div className="mt-3">
              <div className={`text-xs px-3 py-1 rounded inline-block ${
                result.isDuplicate ? 'bg-red-100 text-red-800' :
                !result.hasData ? 'bg-gray-100 text-gray-600' :
                result.matchType === 'exact' || result.matchType === 'learned' ? 'bg-green-100 text-green-800' :
                'bg-blue-100 text-blue-800'
              }`}>
                {result.isDuplicate ? `重複統合 (${result.duplicateInfo?.count}件)` :
                 !result.hasData ? 'データなし' :
                 result.matchType === 'exact' ? '完全一致' :
                 result.matchType === 'learned' ? '学習済み' :
                 '要確認'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
