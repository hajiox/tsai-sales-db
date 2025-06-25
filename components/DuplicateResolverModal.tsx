// /components/DuplicateResolverModal.tsx ver.2
"use client"

import React, { useState } from "react"
import { X, CheckCircle2, AlertCircle, Save } from "lucide-react"

interface DuplicateResolverModalProps {
  isOpen: boolean
  duplicates: any[]
  individualCsvProducts: any[]
  productMaster: { id: string; name: string }[]
  onClose: () => void
  onIndividualProductChange: (csvProductId: string, newProductId: string) => void
  onIndividualQuantityChange: (csvProductId: string, newQuantity: number) => void
  onRemoveIndividualProduct: (csvProductId: string) => void
  onConfirm: (resolvedProducts: any[]) => void
  isSubmitting: boolean
  onLearnMapping?: (amazonTitle: string, productId: string) => void // 新規追加
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
  isSubmitting,
  onLearnMapping
}: DuplicateResolverModalProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [resolvedDuplicates, setResolvedDuplicates] = useState<string[]>([])
  const [learnedMappings, setLearnedMappings] = useState<{amazonTitle: string, productId: string}[]>([])
  
  if (!isOpen) return null

  const currentDuplicate = duplicates[currentStep]
  const isLastStep = currentStep === duplicates.length - 1
  
  // 現在の重複グループのCSV商品を取得
  const currentGroupProducts = individualCsvProducts.filter(
    p => p.originalDuplicateGroup === currentDuplicate?.productId
  )

  // 学習ボタンのハンドラー
  const handleLearnMapping = (amazonTitle: string, productId: string) => {
    if (onLearnMapping) {
      onLearnMapping(amazonTitle, productId)
    }
    setLearnedMappings(prev => [...prev, { amazonTitle, productId }])
  }

  // 次のステップへ
  const handleNextStep = () => {
    setResolvedDuplicates(prev => [...prev, currentDuplicate.productId])
    
    if (isLastStep) {
      // 最後のステップなら完了処理
      handleComplete()
    } else {
      setCurrentStep(prev => prev + 1)
    }
  }

  // 完了処理
  const handleComplete = () => {
    onConfirm(individualCsvProducts)
    alert(`✅ 重複解消完了！\n\n${duplicates.length}件の重複を解消しました。\n${learnedMappings.length}件のマッピングを学習しました。`)
    onClose()
  }

  // 進捗情報
  const progress = {
    current: currentStep + 1,
    total: duplicates.length,
    percentage: Math.round(((currentStep + 1) / duplicates.length) * 100)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[85vh] flex flex-col">
        
        {/* ヘッダー */}
        <div className="p-4 border-b bg-blue-50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-blue-600" />
              重複解消モード - ステップ {progress.current} / {progress.total}
            </h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-200 rounded"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          
          {/* プログレスバー */}
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
          
          <p className="text-sm text-gray-600">
            各商品を個別に修正できます。完了後、未マッチング商品の修正に進みます。
          </p>
        </div>

        {/* 現在の重複グループ情報 */}
        {currentDuplicate && (
          <div className="p-4 bg-yellow-50 border-b">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-yellow-800">
                  {currentDuplicate.productName}
                </h4>
                <p className="text-sm text-yellow-700 mt-1">
                  {currentDuplicate.duplicateInfo.count}個のCSV商品が同じ商品として統合されています
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-yellow-800">
                  {currentDuplicate.duplicateInfo.totalQuantity}個
                </div>
                <div className="text-xs text-yellow-700">合計数量</div>
              </div>
            </div>
          </div>
        )}

        {/* 個別商品リスト */}
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="space-y-3">
            {currentGroupProducts.map((product) => {
              const isLearned = learnedMappings.some(
                m => m.amazonTitle === product.amazonTitle
              )
              
              return (
                <div 
                  key={product.id} 
                  className={`p-4 border rounded-lg ${
                    isLearned ? 'bg-green-50 border-green-200' : 'bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="font-medium text-sm mb-1">
                        {product.amazonTitle}
                      </div>
                      {isLearned && (
                        <div className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          学習済み
                        </div>
                      )}
                    </div>
                    <div className="ml-4">
                      <input
                        type="number"
                        value={product.quantity}
                        onChange={(e) => onIndividualQuantityChange(
                          product.id, 
                          parseInt(e.target.value) || 0
                        )}
                        className="w-20 px-2 py-1 border rounded text-right"
                        min="0"
                      />
                      <span className="ml-1 text-sm">個</span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 items-center">
                    <select
                      value={product.productId}
                      onChange={(e) => onIndividualProductChange(
                        product.id, 
                        e.target.value
                      )}
                      className="flex-1 px-3 py-2 border rounded text-sm"
                    >
                      <option value="">商品を選択...</option>
                      {productMaster.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    
                    {!isLearned && product.productId && (
                      <button
                        onClick={() => handleLearnMapping(
                          product.amazonTitle, 
                          product.productId
                        )}
                        className="px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 flex items-center gap-1"
                      >
                        <Save className="h-3 w-3" />
                        学習
                      </button>
                    )}
                    
                    <button
                      onClick={() => onRemoveIndividualProduct(product.id)}
                      className="px-3 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                    >
                      削除
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* フッター */}
        <div className="border-t bg-gray-50 p-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              {learnedMappings.length > 0 && (
                <span className="text-green-600">
                  {learnedMappings.length}件のマッピングを学習しました
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleNextStep}
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {isLastStep ? '重複解消を完了' : '次の重複へ →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
