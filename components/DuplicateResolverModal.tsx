// /components/DuplicateResolverModal.tsx ver.1 (重複解消専用UI)
"use client"

import React, { useState } from "react"

interface AmazonImportResult {
  productId: string
  productName: string
  amazonTitle: string
  quantity: number
  matched: boolean
  matchType?: 'exact' | 'learned' | 'high' | 'medium' | 'low'
}

interface IndividualCsvProduct {
  id: string
  productId: string
  productName: string
  amazonTitle: string
  quantity: number
  matchType?: 'exact' | 'learned' | 'high' | 'medium' | 'low'
  isFromDuplicate: boolean
  originalDuplicateGroup?: string
}

interface DuplicateResolverModalProps {
  isOpen: boolean
  duplicates: AllProductResult[]
  individualCsvProducts: IndividualCsvProduct[]
  productMaster: { id: string; name: string }[]
  onClose: () => void
  onIndividualProductChange: (csvProductId: string, newProductId: string) => void
  onIndividualQuantityChange: (csvProductId: string, newQuantity: number) => void
  onRemoveIndividualProduct: (csvProductId: string) => void
  onConfirm: (resolvedProducts: IndividualCsvProduct[]) => void
  isSubmitting: boolean
}

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

export default function DuplicateResolverModal({
  isOpen,
  duplicates,
  individualCsvProducts,
  productMaster,
  onClose,
  onIndividualProductChange,
  onIndividualQuantityChange,
  onRemoveIndividualProduct,
  onConfirm,
  isSubmitting
}: DuplicateResolverModalProps) {

  // 重複由来の個別商品のみ表示
  const duplicateProducts = individualCsvProducts.filter(p => p.isFromDuplicate)

  const getStats = () => {
    const withData = duplicateProducts.filter(p => p.quantity > 0)
    return {
      total: duplicateProducts.length,
      withData: withData.length,
      totalQuantity: withData.reduce((sum, p) => sum + p.quantity, 0),
      duplicateGroups: duplicates.length
    }
  }

  const stats = getStats()

  const handleConfirm = () => {
    // 数量が0でない商品のみを確定
    const validProducts = duplicateProducts.filter(p => p.quantity > 0)
    onConfirm(validProducts)
  }

  // 重複グループ別に商品を整理
  const getProductsByGroup = () => {
    const groups = new Map<string, IndividualCsvProduct[]>()
    
    duplicateProducts.forEach(product => {
      const groupId = product.originalDuplicateGroup || 'unknown'
      if (!groups.has(groupId)) {
        groups.set(groupId, [])
      }
      groups.get(groupId)!.push(product)
    })
    
    return Array.from(groups.entries())
  }

  const productGroups = getProductsByGroup()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        
        {/* ヘッダー */}
        <div className="p-6 border-b bg-blue-50 flex-shrink-0">
          <h3 className="text-lg font-semibold text-blue-800">🔧 重複解消モード</h3>
          <p className="text-sm text-blue-600 mt-1">
            重複していたCSV商品を個別に表示しています。それぞれを適切な商品マスターに紐付け直してください。
          </p>

          {/* 重複解消統計 */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-lg p-3 border border-blue-200">
              <div className="text-xs text-gray-500">重複グループ</div>
              <div className="text-lg font-bold text-red-600">{stats.duplicateGroups}件</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-blue-200">
              <div className="text-xs text-gray-500">個別CSV商品</div>
              <div className="text-lg font-bold text-blue-600">{stats.total}商品</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-blue-200">
              <div className="text-xs text-gray-500">修正済み商品</div>
              <div className="text-lg font-bold text-green-600">{stats.withData}商品</div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-blue-200">
              <div className="text-xs text-gray-500">合計数量</div>
              <div className="text-lg font-bold text-green-600">{stats.totalQuantity.toLocaleString()}個</div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-blue-100 border border-blue-200 rounded">
            <p className="text-sm text-blue-700">
              <strong>💡 重複解消の流れ:</strong> 
              同じ商品マスターに{stats.duplicateGroups}グループ・{stats.total}個のCSV商品が紐付いていました。
              各CSV商品を正しい商品マスターに個別に紐付け直してください。
            </p>
          </div>
        </div>

        {/* メインコンテンツ */}
        <div className="flex-1 p-4 overflow-y-auto">
          <h4 className="text-lg font-semibold mb-4 text-blue-600">
            重複CSV商品一覧 ({stats.total}商品)
          </h4>

          {/* 重複グループ別表示 */}
          <div className="space-y-6">
            {productGroups.map(([groupId, products]) => {
              const originalProduct = duplicates.find(d => d.productId === groupId)
              return (
                <div key={groupId} className="border-2 border-red-200 rounded-lg p-4 bg-red-50">
                  
                  {/* グループヘッダー */}
                  <div className="mb-4 p-3 bg-red-100 border border-red-200 rounded">
                    <h5 className="font-semibold text-red-800 mb-2">
                      🚨 重複グループ: {originalProduct?.productName || '不明な商品'}
                    </h5>
                    <div className="text-sm text-red-700">
                      このグループには{products.length}個のCSV商品が含まれています
                    </div>
                    {originalProduct?.duplicateInfo && (
                      <div className="text-xs text-red-600 mt-1">
                        元の数量: {originalProduct.duplicateInfo.originalQuantities.join(' + ')} = {originalProduct.duplicateInfo.totalQuantity}個
                      </div>
                    )}
                  </div>

                  {/* グループ内の個別商品 */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {products.map((csvProduct) => (
                      <div key={csvProduct.id} className="border border-red-300 rounded-lg p-4 bg-white">
                        
                        {/* CSV商品情報 */}
                        <div className="mb-3">
                          <label className="text-xs text-gray-500 font-medium">CSV商品名</label>
                          <p className="text-sm font-bold text-gray-800 break-words">{csvProduct.amazonTitle}</p>
                        </div>

                        {/* 商品選択（修正） */}
                        <div className="mb-3">
                          <label className="text-xs text-gray-500 font-medium block mb-1">
                            正しい商品マスターを選択
                            <span className="ml-2 text-xs text-red-600">※修正必須</span>
                          </label>
                          <select
                            value={csvProduct.productId}
                            onChange={(e) => onIndividualProductChange(csvProduct.id, e.target.value)}
                            className="w-full text-sm border-2 border-red-300 rounded px-3 py-2 bg-white focus:border-red-500 focus:outline-none"
                          >
                            <option value="">商品を選択...</option>
                            {productMaster.map((product) => (
                              <option key={product.id} value={product.id}>{product.name}</option>
                            ))}
                          </select>
                        </div>

                        {/* 数量・削除 */}
                        <div className="flex items-center gap-3 mb-3">
                          <div className="flex-1">
                            <label className="text-xs text-gray-500 font-medium block mb-1">販売数</label>
                            <input
                              type="number"
                              value={csvProduct.quantity}
                              onChange={(e) => onIndividualQuantityChange(csvProduct.id, parseInt(e.target.value) || 0)}
                              className="w-full text-sm border rounded px-3 py-2 focus:border-blue-500 focus:outline-none"
                              min="0"
                            />
                          </div>
                          <div className="pt-6">
                            <button
                              onClick={() => onRemoveIndividualProduct(csvProduct.id)}
                              className="text-red-500 hover:text-red-700 text-sm px-3 py-2 border border-red-200 rounded hover:bg-red-50"
                            >
                              削除
                            </button>
                          </div>
                        </div>

                        {/* ステータス表示 */}
                        <div className="flex items-center justify-between">
                          <div className={`text-xs px-2 py-1 rounded ${
                            csvProduct.productId && csvProduct.quantity > 0
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {csvProduct.productId && csvProduct.quantity > 0
                              ? '✅ 修正完了'
                              : '❌ 修正が必要'
                            }
                          </div>
                          
                          {csvProduct.matchType && (
                            <div className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">
                              元: {csvProduct.matchType === 'exact' ? '完全一致' :
                                   csvProduct.matchType === 'learned' ? '学習済み' :
                                   csvProduct.matchType === 'high' ? '高精度' :
                                   csvProduct.matchType === 'medium' ? '中精度' : '低精度'}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* フッター */}
        <div className="border-t bg-gray-50 p-6 flex-shrink-0">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              <div>重複解消後のCSV商品をDBに保存します</div>
              <div className="text-xs text-blue-600 mt-1">
                ✅ 修正済み{stats.withData}商品・{stats.totalQuantity.toLocaleString()}個をDBに保存
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="px-6 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                ← 通常表示に戻る
              </button>
              <button
                onClick={handleConfirm}
                disabled={isSubmitting || stats.withData === 0}
                className="px-6 py-2 text-sm text-white rounded disabled:opacity-50 bg-blue-600 hover:bg-blue-700"
              >
                {isSubmitting ? '処理中...' : `重複解消完了：${stats.withData}商品をDBに反映`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
