// /components/AmazonCsvConfirmModal.tsx ver.12
"use client"

import React, { useState, useMemo } from "react"
import ProductAddModal from "./ProductAddModal"
import DuplicateResolverModal from "./DuplicateResolverModal"
import QualityCheckPanel from "./QualityCheckPanel"
import ProductListView from "./ProductListView"
import UnmatchedProductsView from "./UnmatchedProductsView"

// ... (他のimportやinterfaceの定義は省略) ...

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
  
  // ... (detectDuplicatesやその他のuseState、useEffect、useMemoは省略) ...
  
  const [manualSelections, setManualSelections] = useState<{amazonTitle: string, productId: string}[]>([]) // manualSelectionsの定義

  // ... (qualityCheck useMemoも省略) ...

  const handleProductChange = (index: number, newProductId: string) => {
    // ... (既存のロジック) ...
  }

  const handleQuantityChange = (index: number, newQuantity: number) => {
    // ... (既存のロジック) ...
  }

  const removeResult = (index: number) => {
    // ... (既存のロジック) ...
  }

  const handleUnmatchedProductSelect = (unmatchedIndex: number, productId: string) => {
    if (!productId) return
    const selectedProduct = productMaster.find(p => p.id === productId)
    if (!selectedProduct) return
    
    setManualSelections(prev => {
      const currentUnmatched = unmatchedProducts[unmatchedIndex];
      // `currentUnmatched`がundefinedでないことを確認
      if (!currentUnmatched) {
        console.error("Error: unmatchedProducts[unmatchedIndex] is undefined for index", unmatchedIndex);
        return prev;
      }

      // 既に選択済みの場合は更新のみ
      const existing = prev.findIndex(s => s.amazonTitle === currentUnmatched.amazonTitle)
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = { amazonTitle: currentUnmatched.amazonTitle, productId }
        console.log('manualSelections updated:', updated); // 更新後のmanualSelectionsをログ出力
        return updated
      }
      const newSelection = [...prev, { amazonTitle: currentUnmatched.amazonTitle, productId }]
      console.log('manualSelections added:', newSelection); // 追加後のmanualSelectionsをログ出力
      return newSelection
    })
  }

  // ... (openAddProductModal, handleAddProduct, handleConfirm などは省略) ...

  if (!isOpen) return null

  // ... (displayResultsやstatsの計算は省略) ...

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full h-[90vh] flex flex-col">
        
        <div className="p-4 border-b bg-gray-50 flex-shrink-0 max-h-[50vh] overflow-y-auto">
          {/* ... (QualityCheckPanel, 重複検出の表示などは省略) ... */}

          <UnmatchedProductsView
            unmatchedProducts={unmatchedProducts}
            productMaster={productMaster}
            showUnmatched={showUnmatched}
            onToggleShow={() => setShowUnmatched(!showUnmatched)}
            onUnmatchedProductSelect={handleUnmatchedProductSelect}
            onOpenAddProductModal={openAddProductModal}
            manualSelections={manualSelections} // ここでmanualSelectionsが渡されている
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
                  console.error('学習APIエラーレスポンス:', errorData); // エラーレスポンスもログ
                  alert(`マッピングの学習に失敗しました: ${errorData.message || response.statusText}`);
                }
              } catch (error) {
                console.error('学習エラー:', error)
                alert('学習に失敗しました')
              }
            }}
          />
        </div>

        {/* ... (ProductListView, フッターなどは省略) ... */}

      </div>

      {/* ... (DuplicateResolverModal, ProductAddModal などは省略) ... */}
    </div>
  )
}
