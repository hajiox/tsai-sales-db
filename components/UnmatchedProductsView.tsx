// /components/UnmatchedProductsView.tsx ver.4
"use client"

import React from "react"
import { CheckCircle2, AlertCircle, Plus, Save } from "lucide-react"

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
  manualSelections?: { amazonTitle: string; productId: string }[]
  onLearnMapping?: (amazonTitle: string, productId: string) => void
}

export default function UnmatchedProductsView({
  unmatchedProducts,
  productMaster,
  showUnmatched,
  onToggleShow,
  onUnmatchedProductSelect,
  onOpenAddProductModal,
  manualSelections = [],
  onLearnMapping
}: UnmatchedProductsViewProps) {
  
  console.log('UnmatchedProductsView - onLearnMapping:', !!onLearnMapping)
  
  if (unmatchedProducts.length === 0) return null

  // 修正済みかどうかを判定
  const isResolved = (amazonTitle: string) => {
    return manualSelections.some(selection => selection.amazonTitle === amazonTitle)
  }

  // 統計情報を計算
  const stats = {
    total: unmatchedProducts.length,
    resolved: unmatchedProducts.filter(p => isResolved(p.amazonTitle)).length,
    unresolved: unmatchedProducts.filter(p => !isResolved(p.amazonTitle)).length,
    totalQuantity: unmatchedProducts.reduce((sum, p) => sum + p.quantity, 0),
    resolvedQuantity: unmatchedProducts
      .filter(p => isResolved(p.amazonTitle))
      .reduce((sum, p) => sum + p.quantity, 0),
    unresolvedQuantity: unmatchedProducts
      .filter(p => !isResolved(p.amazonTitle))
      .reduce((sum, p) => sum + p.quantity, 0)
  }

  return (
    <div className="mt-4">
      <div className={`p-4 border rounded-lg ${stats.unresolved > 0 ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
        <div className="flex items-center justify-between mb-3">
          <h4 className={`font-semibold flex items-center gap-2 ${stats.unresolved > 0 ? 'text-orange-800' : 'text-green-800'}`}>
            {stats.unresolved > 0 ? (
              <>
                <AlertCircle className="h-5 w-5" />
                未マッチング商品あり
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5" />
                すべて修正済み！
              </>
            )}
          </h4>
          <button
            onClick={onToggleShow}
            className={`text-sm px-3 py-1 rounded ${
              stats.unresolved > 0 
                ? 'bg-orange-600 text-white hover:bg-orange-700' 
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {showUnmatched ? '詳細を隠す' : '詳細を表示'}
          </button>
        </div>

        {/* 修正進捗サマリー */}
        <div className="grid grid-cols-2 gap-4 mb-3">
          <div className="bg-white p-3 rounded border border-gray-200">
            <div className="text-sm text-gray-600">商品数</div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-green-600">{stats.resolved}</span>
              <span className="text-sm text-gray-500">/</span>
              <span className="text-lg font-bold">{stats.total}</span>
              <span className="text-xs text-gray-500">修正済み</span>
            </div>
            {stats.unresolved > 0 && (
              <div className="text-xs text-orange-600 mt-1">
                残り{stats.unresolved}商品の修正が必要
              </div>
            )}
          </div>
          
          <div className="bg-white p-3 rounded border border-gray-200">
            <div className="text-sm text-gray-600">数量</div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-green-600">{stats.resolvedQuantity}</span>
              <span className="text-sm text-gray-500">/</span>
              <span className="text-lg font-bold">{stats.totalQuantity}</span>
              <span className="text-xs text-gray-500">個</span>
            </div>
            {stats.unresolvedQuantity > 0 && (
              <div className="text-xs text-orange-600 mt-1">
                {stats.unresolvedQuantity}個が未処理
              </div>
            )}
          </div>
        </div>

        {/* プログレスバー */}
        <div className="mb-3">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(stats.resolved / stats.total) * 100}%` }}
            />
          </div>
          <div className="text-xs text-gray-600 mt-1 text-center">
            修正進捗: {Math.round((stats.resolved / stats.total) * 100)}%
          </div>
        </div>

        {showUnmatched && (
          <div className="space-y-2 mt-4 max-h-96 overflow-y-auto">
            {unmatchedProducts.map((unmatched, index) => {
              const resolved = isResolved(unmatched.amazonTitle)
              const selectedProductId = manualSelections.find(s => s.amazonTitle === unmatched.amazonTitle)?.productId
              const selectedProduct = productMaster.find(p => p.id === selectedProductId)
              
              return (
                <div 
                  key={index} 
                  className={`p-3 rounded-lg border ${
                    resolved 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-white border-orange-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {resolved && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                      <span className={`text-sm font-medium ${resolved ? 'text-green-800' : 'text-gray-800'}`}>
                        {unmatched.amazonTitle}
                      </span>
                    </div>
                    <span className={`text-sm font-bold ${resolved ? 'text-green-600' : 'text-orange-600'}`}>
                      {unmatched.quantity}個
                    </span>
                  </div>
                  
                  {resolved ? (
                    <div className="text-sm text-green-700 bg-green-100 px-3 py-1 rounded">
                      ✓ 修正済み → {selectedProduct?.name || '商品選択済み'}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <select
                          id={`unmatched-select-${index}`}
                          className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value) {
                              onUnmatchedProductSelect(index, e.target.value)
                              // 学習ボタンの表示制御を削除（常に表示）
                            }
                          }}
                        >
                          <option value="">商品を選択してください...</option>
                          {productMaster.map(product => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => onOpenAddProductModal(index)}
                          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 flex items-center gap-1"
                        >
                          <Plus className="h-3 w-3" />
                          新規追加
                        </button>
                      </div>
                      
                      {/* 学習ボタン（商品が選択されている場合のみ表示） */}
                      {onLearnMapping && (
                        <button
                          id={`learn-btn-${index}`}
                          onClick={() => {
                            const select = document.getElementById(`unmatched-select-${index}`) as HTMLSelectElement
                            if (select?.value) {
                              console.log('学習ボタンクリック:', unmatched.amazonTitle, select.value)
                              onLearnMapping(unmatched.amazonTitle, select.value)
                              alert('学習処理を実行しました')
                            } else {
                              alert('商品を選択してください')
                            }
                          }}
                          className="w-full px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 flex items-center justify-center gap-1"
                        >
                          <Save className="h-4 w-4" />
                          このマッピングを学習する（デバッグ版）
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
