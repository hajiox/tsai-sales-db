// /components/UnmatchedProductsView.tsx ver.12
"use client"

import React, { useState } from "react"
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
  const [learnedItems, setLearnedItems] = useState<Set<string>>(new Set())
  // コンポーネント内で選択状態を一時的に保持するstateを追加
  const [internalSelections, setInternalSelections] = useState<{ [key: number]: string }>({});

  if (unmatchedProducts.length === 0) return null

  const isResolved = (amazonTitle: string) => {
    return manualSelections.some(selection => selection.amazonTitle === amazonTitle)
  }

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

  // 選択時の処理を更新
  const handleSelectChange = (index: number, value: string) => {
    // 内部stateを更新して即時UIに反映させる
    setInternalSelections(prev => ({ ...prev, [index]: value }));

    // 親コンポーネントに変更を通知する
    if (value) {
      onUnmatchedProductSelect(index, value);
    }
  }

  const handleLearn = async (amazonTitle: string, productId: string, index: number) => {
    console.log('handleLearnが呼び出されました:', amazonTitle, productId, index)
    if (onLearnMapping) {
      console.log('onLearnMappingを呼び出します:', amazonTitle, productId)
      try {
        await onLearnMapping(amazonTitle, productId)
        setLearnedItems(prev => new Set(prev).add(`${index}-${amazonTitle}`))
        alert('マッピングを学習しました')
      } catch (error) {
        alert('学習に失敗しました')
      }
    } else {
      console.log('onLearnMappingが定義されていません。')
    }
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
              const resolved = isResolved(unmatched.amazonTitle);
              // 選択された商品IDを、まず内部stateから取得し、なければpropsから取得
              const selectedProductId = internalSelections[index] || manualSelections.find(s => s.amazonTitle === unmatched.amazonTitle)?.productId;
              const selectedProduct = productMaster.find(p => p.id === selectedProductId);

              const isLearned = learnedItems.has(`${index}-${unmatched.amazonTitle}`);

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
                          value={selectedProductId || ''} // 更新されたIDを使用
                          onChange={(e) => handleSelectChange(index, e.target.value)}
                          className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
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

                      {/* 学習ボタンの表示条件 */}
                      {onLearnMapping && selectedProductId && !isLearned && (
                        <button
                          onClick={() => {
                            if (selectedProductId) { // selectedProductIdが確実にあることを確認
                               handleLearn(unmatched.amazonTitle, selectedProductId, index);
                            }
                          }}
                          className="w-full px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 flex items-center justify-center gap-1"
                        >
                          <Save className="h-4 w-4" />
                          このマッピングを学習する
                        </button>
                      )}

                      {/* 学習済み表示 */}
                      {isLearned && (
                        <div className="text-center text-sm text-green-600 bg-green-100 px-3 py-1 rounded">
                          ✓ 学習済み
                        </div>
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
