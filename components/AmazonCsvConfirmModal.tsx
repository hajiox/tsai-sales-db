// /components/AmazonCsvConfirmModal.tsx ver.15
"use client"

import React, { useState } from "react"
import { useAmazonCsvLogic } from "../hooks/useAmazonCsvLogic"
import ProductAddModal from "./ProductAddModal"
import DuplicateResolverModal from "./DuplicateResolverModal"
import QualityCheckPanel from "./QualityCheckPanel"
import ProductListView from "./ProductListView"
import UnmatchedProductsView from "./UnmatchedProductsView"
import CsvDebugAnalyzer from "./CsvDebugAnalyzer"
import { AmazonCsvConfirmModalProps, NewProduct } from "../types/amazonCsvTypes"

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
  
  const {
    allProductsResults,
    individualCsvProducts,
    duplicates,
    qualityCheck,
    manualSelections,
    showDuplicateResolver,
    showUnmatched,
    showZeroQuantity,
    showDuplicatesOnly,
    setShowDuplicateResolver,
    setShowUnmatched,
    setShowZeroQuantity,
    setShowDuplicatesOnly,
    handleProductChange,
    handleQuantityChange,
    removeResult,
    handleUnmatchedProductSelect,
    handleLearnAllMappings,
    handleConfirm: handleConfirmLogic,
    setIndividualCsvProducts,
    forceResetAfterDuplicateResolution,
  } = useAmazonCsvLogic({
    results,
    unmatchedProducts,
    csvSummary,
    productMaster,
    onConfirm
  })

  const [isAddingProduct, setIsAddingProduct] = useState(false)
  const [selectedUnmatchedIndex, setSelectedUnmatchedIndex] = useState<number | null>(null)

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
      
      setIsAddingProduct(false)
      setSelectedUnmatchedIndex(null)
      alert('商品を追加しました')
    } catch (error) {
      console.error('商品追加エラー:', error)
      alert('商品追加に失敗しました')
    }
  }

  const handleConfirm = async () => {
    if (!qualityCheck.isQuantityValid && qualityCheck.warningLevel === 'error') {
      alert(`❌ 数量不整合により登録できません\n差分: ${qualityCheck.discrepancy}個`)
      return
    }
    await handleConfirmLogic()
  }

  if (!isOpen) return null

  let displayResults = allProductsResults
  if (showDuplicatesOnly) {
    displayResults = allProductsResults.filter(r => r.isDuplicate)
  } else if (!showZeroQuantity) {
    displayResults = allProductsResults.filter(r => r.hasData && r.quantity > 0)
  }

  const stats = {
    total: allProductsResults.length,
    withData: showDuplicateResolver ? 
      individualCsvProducts.filter(p => p.quantity > 0).length :
      allProductsResults.filter(r => r.hasData && r.quantity > 0).length + manualSelections.length,
    duplicateCount: duplicates.length,
    totalQuantity: qualityCheck.finalTotal,
    resolvedUnmatched: manualSelections.length,
    unresolvedUnmatched: unmatchedProducts.length - manualSelections.length
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full h-[90vh] flex flex-col">
        
        <div className="p-4 border-b bg-gray-50 flex-shrink-0 max-h-[50vh] overflow-y-auto">
          <h3 className="text-lg font-semibold">Amazon CSVインポート確認</h3>
          <p className="text-sm text-gray-600 mt-1">{month}月のAmazonデータを確認してください。</p>
          
          <QualityCheckPanel 
            qualityCheck={qualityCheck} 
            isDuplicateResolverMode={showDuplicateResolver} 
            className="mt-4" 
          />
          
          {duplicates.length > 0 && !showDuplicateResolver && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <h4 className="text-red-800 font-semibold mb-2">⚠️ 重複検出！</h4>
              <p className="text-sm text-red-700 mb-2"><strong>{duplicates.length}商品</strong>で重複が検出されました。</p>
              <div className="flex gap-2">
                <button onClick={() => setShowDuplicateResolver(true)} className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700">
                  🔧 重複を個別に修正する
                </button>
                {qualityCheck.discrepancy === 0 && (
                  <button 
                    onClick={forceResetAfterDuplicateResolution}
                    className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                  >
                    🔄 品質エラーをリセット
                  </button>
                )}
              </div>
            </div>
          )}

          <UnmatchedProductsView
            unmatchedProducts={unmatchedProducts}
            productMaster={productMaster}
            showUnmatched={showUnmatched}
            onToggleShow={() => setShowUnmatched(!showUnmatched)}
            onUnmatchedProductSelect={handleUnmatchedProductSelect}
            onOpenAddProductModal={openAddProductModal}
            manualSelections={manualSelections}
            onLearnMapping={async (amazonTitle, productId) => {
              try {
                const response = await fetch('/api/products/add-learning', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ amazonTitle, productId }),
                })
                if (response.ok) {
                  alert('マッピングを学習しました')
                } else {
                  const errorData = await response.json();
                  console.error('学習APIエラーレスポンス:', errorData);
                  alert(`マッピングの学習に失敗しました: ${errorData.message || response.statusText}`);
                }
              } catch (error) {
                console.error('学習エラー:', error)
                alert('学習に失敗しました')
              }
            }}
          />

          {/* 詳細比較分析パネル */}
          <CsvDebugAnalyzer
            results={results}
            unmatchedProducts={unmatchedProducts}
            allProductsResults={allProductsResults}
            individualCsvProducts={individualCsvProducts}
            manualSelections={manualSelections}
            duplicates={duplicates}
            showDuplicateResolver={showDuplicateResolver}
            csvSummary={csvSummary}
          />
        </div>

        <div className="flex-1 p-4 overflow-y-auto min-h-[200px]">
          {!showDuplicateResolver ? (
            <ProductListView
              displayResults={displayResults}
              productMaster={productMaster}
              showDuplicatesOnly={showDuplicatesOnly}
              onProductChange={handleProductChange}
              onQuantityChange={handleQuantityChange}
              onRemoveResult={removeResult}
              onShowDuplicateResolver={() => setShowDuplicateResolver(true)}
            />
          ) : (
            <div className="text-center py-8 text-gray-500">重複解消モードが開いています</div>
          )}
        </div>

        <div className="border-t bg-gray-50 p-4 flex-shrink-0">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="text-sm text-gray-600">
              <div>Amazon列のみを更新します</div>
              <div className={`text-xs mt-1 ${qualityCheck.isQuantityValid ? 'text-green-600' : 'text-red-600'}`}>
                {qualityCheck.isQuantityValid ? '✅' : '⚠️'} 
                {stats.withData}件・{stats.totalQuantity.toLocaleString()}個をDBに保存
                {!qualityCheck.isQuantityValid && <span> (差分: {qualityCheck.discrepancy}個)</span>}
              </div>
            </div>
            <div className="flex gap-2">
              {manualSelections.length > 0 && (
                <button
                  onClick={handleLearnAllMappings}
                  disabled={isSubmitting}
                  className={`px-3 py-2 text-sm text-white rounded transition-all duration-200 ${
                    isSubmitting 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-green-600 hover:bg-green-700 active:bg-green-800'
                  }`}
                >
                  {isSubmitting ? '学習中...' : `修正結果を学習 (${manualSelections.length}件)`}
                </button>
              )}
              <button onClick={onClose} disabled={isSubmitting} className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50">
                キャンセル
              </button>
              <button
                onClick={handleConfirm}
                disabled={isSubmitting || stats.withData === 0 || qualityCheck.unmatchedTotal > 0}
                className={`px-4 py-2 text-sm text-white rounded disabled:opacity-50 ${
                  qualityCheck.unmatchedTotal > 0 ? 'bg-gray-400 cursor-not-allowed' :
                  qualityCheck.warningLevel === 'error' ? 'bg-yellow-600 hover:bg-yellow-700' :  // errorでも黄色で登録可能
                  qualityCheck.isQuantityValid ? 'bg-blue-600 hover:bg-blue-700' : 'bg-yellow-600 hover:bg-yellow-700'
                }`}
              >
                {isSubmitting ? '処理中...' : 
                 qualityCheck.unmatchedTotal > 0 ? `未マッチング${qualityCheck.unmatchedTotal}個を修正してください` :
                 Math.abs(qualityCheck.discrepancy) > 0 ? `注意: 差異${Math.abs(qualityCheck.discrepancy)}個で登録` :
                 `${stats.withData}件をDBに反映`}
              </button>
            </div>
          </div>
        </div>
      </div>

      <DuplicateResolverModal
        isOpen={showDuplicateResolver}
        duplicates={duplicates}
        individualCsvProducts={individualCsvProducts}
        productMaster={productMaster}
        onClose={() => setShowDuplicateResolver(false)}
        onLearnMapping={async (amazonTitle, productId) => {
          try {
            await fetch('/api/products/add-learning', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ amazonTitle, productId }),
            })
            console.log('学習データ保存:', amazonTitle, productId)
          } catch (error) {
            console.error('学習データ保存エラー:', error)
          }
        }}
        onIndividualProductChange={(csvProductId, newProductId) => {
          const selectedProduct = productMaster.find(p => p.id === newProductId)
          if (selectedProduct) {
            const updated = [...individualCsvProducts]
            const targetIndex = updated.findIndex(p => p.id === csvProductId)
            if (targetIndex !== -1) {
              updated[targetIndex] = { ...updated[targetIndex], productId: newProductId, productName: selectedProduct.name }
              setIndividualCsvProducts(updated)
              setManualSelections(prev => [...prev, { amazonTitle: updated[targetIndex].amazonTitle, productId: newProductId }])
            }
          }
        }}
        onIndividualQuantityChange={(csvProductId, newQuantity) => {
          const updated = [...individualCsvProducts]
          const targetIndex = updated.findIndex(p => p.id === csvProductId)
          if (targetIndex !== -1) {
            updated[targetIndex] = { ...updated[targetIndex], quantity: newQuantity }
            setIndividualCsvProducts(updated)
          }
        }}
        onRemoveIndividualProduct={(csvProductId) => {
          const updated = individualCsvProducts.filter(p => p.id !== csvProductId)
          setIndividualCsvProducts(updated)
        }}
        onConfirm={(resolvedProducts) => {
          setIndividualCsvProducts(resolvedProducts)
          setShowDuplicateResolver(false)
        }}
        isSubmitting={isSubmitting}
      />

      {isAddingProduct && selectedUnmatchedIndex !== null && (
        <ProductAddModal
          isOpen={isAddingProduct}
          unmatchedProduct={unmatchedProducts[selectedUnmatchedIndex]}
          onClose={() => { setIsAddingProduct(false); setSelectedUnmatchedIndex(null) }}
          onAdd={handleAddProduct}
        />
      )}
    </div>
  )
}
