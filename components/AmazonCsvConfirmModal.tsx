// /components/AmazonCsvConfirmModal.tsx ver.8 (簡素化+品質管理機能)
"use client"

import React, { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import ProductAddModal from "./ProductAddModal"
import DuplicateResolverModal from "./DuplicateResolverModal"
import QualityCheckPanel from "./QualityCheckPanel"

interface AmazonImportResult {
  productId: string
  productName: string
  amazonTitle: string
  quantity: number
  matched: boolean
  matchType?: 'exact' | 'learned' | 'high' | 'medium' | 'low'
}

interface AmazonCsvConfirmModalProps {
  isOpen: boolean
  results: AmazonImportResult[]
  unmatchedProducts: UnmatchedProduct[]
  csvSummary: any
  productMaster: { id: string; name: string }[]
  month: string
  isSubmitting: boolean
  onClose: () => void
  onConfirm: (updatedResults: AmazonImportResult[]) => void
}

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

interface QualityCheck {
  csvOriginalTotal: number
  csvRecordCount: number
  matchedTotal: number
  unmatchedTotal: number
  duplicateAdjustment: number
  deletedTotal: number
  finalTotal: number
  isQuantityValid: boolean
  discrepancy: number
  warningLevel: 'none' | 'warning' | 'error'
  duplicateCount: number
  productCount: number
}

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
  
  // 🔥 重複検出システム
  const detectDuplicates = (results: AmazonImportResult[]): { cleanResults: AllProductResult[], duplicates: AllProductResult[], individualProducts: IndividualCsvProduct[] } => {
    const productMap = new Map<string, AmazonImportResult[]>()
    
    results.forEach(result => {
      if (!productMap.has(result.productId)) {
        productMap.set(result.productId, [])
      }
      productMap.get(result.productId)!.push(result)
    })
    
    const cleanResults: AllProductResult[] = []
    const duplicates: AllProductResult[] = []
    const individualProducts: IndividualCsvProduct[] = []
    
    productMaster.forEach(product => {
      const matchedResults = productMap.get(product.id) || []
      
      if (matchedResults.length === 0) {
        cleanResults.push({
          productId: product.id,
          productName: product.name,
          amazonTitle: '',
          quantity: 0,
          matched: true,
          matchType: 'none',
          hasData: false,
          isDuplicate: false
        })
      } else if (matchedResults.length === 1) {
        const result = matchedResults[0]
        cleanResults.push({
          ...result,
          hasData: true,
          isDuplicate: false
        })
        
        individualProducts.push({
          id: `single_${product.id}`,
          productId: result.productId,
          productName: result.productName,
          amazonTitle: result.amazonTitle,
          quantity: result.quantity,
          matchType: result.matchType,
          isFromDuplicate: false
        })
      } else {
        const totalQuantity = matchedResults.reduce((sum, r) => sum + r.quantity, 0)
        const amazonTitles = matchedResults.map(r => r.amazonTitle)
        const originalQuantities = matchedResults.map(r => r.quantity)
        
        const duplicateResult: AllProductResult = {
          productId: product.id,
          productName: product.name,
          amazonTitle: amazonTitles.join(' / '),
          quantity: totalQuantity,
          matched: true,
          matchType: matchedResults[0].matchType,
          hasData: true,
          isDuplicate: true,
          duplicateInfo: {
            count: matchedResults.length,
            amazonTitles,
            totalQuantity,
            originalQuantities
          }
        }
        
        duplicates.push(duplicateResult)
        cleanResults.push(duplicateResult)
        
        matchedResults.forEach((result, index) => {
          individualProducts.push({
            id: `duplicate_${product.id}_${index}`,
            productId: result.productId,
            productName: result.productName,
            amazonTitle: result.amazonTitle,
            quantity: result.quantity,
            matchType: result.matchType,
            isFromDuplicate: true,
            originalDuplicateGroup: product.id
          })
        })
      }
    })
    
    return { cleanResults, duplicates, individualProducts }
  }

  const { cleanResults, duplicates, individualProducts } = detectDuplicates(results)
  const [allProductsResults, setAllProductsResults] = useState<AllProductResult[]>(cleanResults)
  const [individualCsvProducts, setIndividualCsvProducts] = useState<IndividualCsvProduct[]>(individualProducts)
  const [showDuplicateResolver, setShowDuplicateResolver] = useState(false)
  const [showUnmatched, setShowUnmatched] = useState(false)
  const [showZeroQuantity, setShowZeroQuantity] = useState(false)
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false)
  const [isAddingProduct, setIsAddingProduct] = useState(false)
  const [selectedUnmatchedIndex, setSelectedUnmatchedIndex] = useState<number | null>(null)
  const [manualSelections, setManualSelections] = useState<{amazonTitle: string, productId: string}[]>([])
  const router = useRouter()

  // 結果が更新されたら重複チェックも更新
  React.useEffect(() => {
    const { cleanResults, individualProducts } = detectDuplicates(results)
    setAllProductsResults(cleanResults)
    setIndividualCsvProducts(individualProducts)
  }, [results, productMaster])

  // 🔥 品質管理機能 - 数量整合性チェック
  const qualityCheck = useMemo((): QualityCheck => {
    const csvOriginalTotal = csvSummary?.totalQuantity || results.reduce((sum, r) => sum + r.quantity, 0)
    const csvRecordCount = results.length
    
    let matchedTotal = 0
    let productCount = 0
    let deletedTotal = 0
    
    if (showDuplicateResolver) {
      // 重複解消モード
      const validProducts = individualCsvProducts.filter(p => p.quantity > 0)
      matchedTotal = validProducts.reduce((sum, p) => sum + p.quantity, 0)
      productCount = validProducts.length
      deletedTotal = individualCsvProducts.filter(p => p.quantity === 0).reduce((sum, p) => sum + p.quantity, 0)
    } else {
      // 通常モード
      const validResults = allProductsResults.filter(r => r.hasData && r.quantity > 0)
      matchedTotal = validResults.reduce((sum, r) => sum + r.quantity, 0)
      productCount = validResults.length
      deletedTotal = allProductsResults.filter(r => r.hasData && r.quantity === 0).reduce((sum, r) => sum + r.quantity, 0)
    }
    
    const unmatchedTotal = unmatchedProducts.reduce((sum, u) => sum + u.quantity, 0)
    const duplicateAdjustment = duplicates.reduce((sum, d) => {
      if (d.duplicateInfo) {
        return sum + (d.duplicateInfo.totalQuantity - d.duplicateInfo.originalQuantities.reduce((a, b) => a + b, 0))
      }
      return sum
    }, 0)
    
    const finalTotal = matchedTotal
    const discrepancy = csvOriginalTotal - (matchedTotal + unmatchedTotal + Math.abs(deletedTotal))
    const isQuantityValid = Math.abs(discrepancy) <= 5  // 5個以内の差分は許容
    const warningLevel = Math.abs(discrepancy) > 20 ? 'error' : Math.abs(discrepancy) > 0 ? 'warning' : 'none'
    
    return {
      csvOriginalTotal,
      csvRecordCount,
      matchedTotal,
      unmatchedTotal,
      duplicateAdjustment,
      deletedTotal,
      finalTotal,
      isQuantityValid,
      discrepancy,
      warningLevel,
      duplicateCount: duplicates.length,
      productCount
    }
  }, [results, allProductsResults, individualCsvProducts, unmatchedProducts, duplicates, showDuplicateResolver, csvSummary])

  // 重複解消モーダル用のハンドラー
  const handleIndividualProductChange = (csvProductId: string, newProductId: string) => {
    const selectedProduct = productMaster.find(p => p.id === newProductId)
    if (selectedProduct) {
      const updated = [...individualCsvProducts]
      const targetIndex = updated.findIndex(p => p.id === csvProductId)
      if (targetIndex !== -1) {
        updated[targetIndex] = {
          ...updated[targetIndex],
          productId: newProductId,
          productName: selectedProduct.name
        }
        setIndividualCsvProducts(updated)

        setManualSelections(prev => [...prev, {
          amazonTitle: updated[targetIndex].amazonTitle,
          productId: newProductId
        }])
      }
    }
  }

  const handleIndividualQuantityChange = (csvProductId: string, newQuantity: number) => {
    const updated = [...individualCsvProducts]
    const targetIndex = updated.findIndex(p => p.id === csvProductId)
    if (targetIndex !== -1) {
      updated[targetIndex] = {
        ...updated[targetIndex],
        quantity: newQuantity
      }
      setIndividualCsvProducts(updated)
    }
  }

  const removeIndividualProduct = (csvProductId: string) => {
    const updated = individualCsvProducts.filter(p => p.id !== csvProductId)
    setIndividualCsvProducts(updated)
  }

  const handleDuplicateResolverConfirm = (resolvedProducts: IndividualCsvProduct[]) => {
    setIndividualCsvProducts(resolvedProducts)
    setShowDuplicateResolver(false)
  }

  // 通常モード用のハンドラー
  const handleProductChange = (index: number, newProductId: string) => {
    const selectedProduct = productMaster.find(p => p.id === newProductId)
    if (selectedProduct) {
      const updated = [...allProductsResults]
      updated[index] = {
        ...updated[index],
        productId: newProductId,
        productName: selectedProduct.name,
        matched: true
      }
      setAllProductsResults(updated)

      if (updated[index].hasData) {
        setManualSelections(prev => [...prev, {
          amazonTitle: updated[index].amazonTitle,
          productId: newProductId
        }])
      }
    }
  }

  const handleQuantityChange = (index: number, newQuantity: number) => {
    const updated = [...allProductsResults]
    updated[index] = { ...updated[index], quantity: newQuantity }
    setAllProductsResults(updated)
  }

  const removeResult = (index: number) => {
    const updated = [...allProductsResults]
    updated[index] = {
      ...updated[index],
      quantity: 0,
      amazonTitle: '',
      hasData: false,
      matchType: 'none',
      isDuplicate: false
    }
    setAllProductsResults(updated)
  }

  // 商品追加処理
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
      
      const newResult: AllProductResult = {
        productId: newProduct.product.id,
        productName: newProduct.product.name,
        amazonTitle: productData.amazonTitle,
        quantity: productData.quantity,
        matched: true,
        matchType: 'exact',
        hasData: true,
        isDuplicate: false
      }

      setAllProductsResults(prev => [...prev, newResult])
      setIsAddingProduct(false)
      setSelectedUnmatchedIndex(null)
      alert('商品を追加しました')
    } catch (error) {
      console.error('商品追加エラー:', error)
      alert('商品追加に失敗しました')
    }
  }

  // 🔥 品質チェック付き確定処理
  const handleConfirm = async () => {
    // 品質チェック実行
    if (!qualityCheck.isQuantityValid) {
      if (qualityCheck.warningLevel === 'error') {
        alert(`❌ 数量不整合により登録できません\n\n差分: ${qualityCheck.discrepancy}個\n\nデータを確認してください。`)
        return
      } else {
        const confirmed = confirm(
          `⚠️ 数量に差分があります\n\n` +
          `CSV元データ: ${qualityCheck.csvOriginalTotal.toLocaleString()}個\n` +
          `最終保存予定: ${qualityCheck.finalTotal.toLocaleString()}個\n` +
          `差分: ${qualityCheck.discrepancy}個\n\n` +
          `このまま登録しますか？`
        )
        if (!confirmed) return
      }
    }

    let resultsToConfirm: AmazonImportResult[] = []

    if (showDuplicateResolver) {
      resultsToConfirm = individualCsvProducts
        .filter(p => p.quantity > 0)
        .map(p => ({
          productId: p.productId,
          productName: p.productName,
          amazonTitle: p.amazonTitle,
          quantity: p.quantity,
          matched: true,
          matchType: p.matchType as any
        }))
    } else {
      resultsToConfirm = allProductsResults
        .filter(r => r.hasData && r.quantity > 0)
        .map(r => ({
          productId: r.productId,
          productName: r.productName,
          amazonTitle: r.amazonTitle,
          quantity: r.quantity,
          matched: r.matched,
          matchType: r.matchType as any
        }))
    }

    // 重複があり、解消されていない場合は警告
    if (duplicates.length > 0 && !showDuplicateResolver && qualityCheck.isQuantityValid) {
      const duplicateNames = duplicates.map(d => d.productName).join('\n')
      if (!confirm(`🚨 重複が検出されました！\n\n重複商品:\n${duplicateNames}\n\n数量は自動で合計されます。続行しますか？\n\n※重複解消画面で個別に修正することもできます。`)) {
        return
      }
    }

    // 学習データ一括登録
    for (const selection of manualSelections) {
      try {
        await fetch('/api/products/add-learning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amazonTitle: selection.amazonTitle,
            productId: selection.productId
          }),
        })
      } catch (error) {
        console.error('学習データ追加エラー:', error)
      }
    }
    
    onConfirm(resultsToConfirm)
  }

  if (!isOpen) return null

  // 表示用データのフィルタリング
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
      allProductsResults.filter(r => r.hasData && r.quantity > 0).length,
    duplicateCount: duplicates.length,
    totalQuantity: qualityCheck.finalTotal
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        
        {/* ヘッダー */}
        <div className="p-6 border-b bg-gray-50 flex-shrink-0">
          <h3 className="text-lg font-semibold">Amazon CSVインポート確認</h3>
          <p className="text-sm text-gray-600 mt-1">
            {month}月のAmazonデータを確認し、必要に応じて修正してください。
          </p>
          
          {/* 🔥 品質管理パネル */}
          <QualityCheckPanel 
            qualityCheck={qualityCheck}
            isDuplicateResolverMode={showDuplicateResolver}
            className="mt-4"
          />
          
          {/* 重複警告・解消ボタン */}
          {duplicates.length > 0 && !showDuplicateResolver && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <h4 className="text-red-800 font-semibold mb-2">⚠️ 重複検出！</h4>
              <p className="text-sm text-red-700 mb-2">
                <strong>{duplicates.length}商品</strong>で重複が検出されました。個別修正を推奨します。
              </p>
              <button
                onClick={() => setShowDuplicateResolver(true)}
                className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700"
              >
                🔧 重複を個別に修正する
              </button>
            </div>
          )}

          {/* 表示切り替えボタン */}
          {!showDuplicateResolver && (
            <div className="mt-4 flex gap-2 flex-wrap">
              <button
                onClick={() => setShowZeroQuantity(!showZeroQuantity)}
                className={`px-4 py-2 rounded-lg text-sm ${
                  showZeroQuantity 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {showZeroQuantity ? `データなし商品を非表示` : `すべて表示 (${stats.total}品種)`}
              </button>
              
              {stats.duplicateCount > 0 && (
                <button
                  onClick={() => setShowDuplicatesOnly(!showDuplicatesOnly)}
                  className={`px-4 py-2 rounded-lg text-sm ${
                    showDuplicatesOnly 
                      ? 'bg-red-600 text-white' 
                      : 'bg-red-100 text-red-800 hover:bg-red-200'
                  }`}
                >
                  {showDuplicatesOnly ? '全商品表示' : `重複商品のみ表示 (${stats.duplicateCount}品種)`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* メインコンテンツ - 簡素化された商品リスト */}
        <div className="flex-1 p-4 overflow-y-auto">
          {!showDuplicateResolver && (
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
                          onClick={() => setShowDuplicateResolver(true)}
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
                          onChange={(e) => handleProductChange(index, e.target.value)}
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
                            onChange={(e) => handleQuantityChange(index, parseInt(e.target.value) || 0)}
                            className="w-full text-sm border rounded px-3 py-2"
                            min="0"
                            disabled={!result.hasData}
                          />
                        </div>
                        {result.hasData && (
                          <div className="pt-6">
                            <button
                              onClick={() => removeResult(index)}
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
          )}
        </div>

        {/* フッター */}
        <div className="border-t bg-gray-50 p-6 flex-shrink-0">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              <div>Amazon列のみを更新します（他のECサイトデータは保持）</div>
              <div className={`text-xs mt-1 ${qualityCheck.isQuantityValid ? 'text-green-600' : 'text-red-600'}`}>
                {qualityCheck.isQuantityValid ? '✅' : '⚠️'} 
                品質チェック: {stats.withData}件・{stats.totalQuantity.toLocaleString()}個をDBに保存
                {!qualityCheck.isQuantityValid && (
                  <span> (差分: {qualityCheck.discrepancy}個)</span>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="px-6 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={handleConfirm}
                disabled={isSubmitting || stats.withData === 0 || (qualityCheck.warningLevel === 'error')}
                className={`px-6 py-2 text-sm text-white rounded disabled:opacity-50 ${
                  qualityCheck.warningLevel === 'error' ? 'bg-red-400' :
                  qualityCheck.isQuantityValid ? 'bg-blue-600 hover:bg-blue-700' :
                  'bg-yellow-600 hover:bg-yellow-700'
                }`}
              >
                {isSubmitting ? '処理中...' : 
                 qualityCheck.warningLevel === 'error' ? '品質エラーのため登録不可' :
                 !qualityCheck.isQuantityValid ? `要確認: ${stats.withData}件をDBに反映` :
                 `${stats.withData}件をDBに反映`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 重複解消モーダル */}
      <DuplicateResolverModal
        isOpen={showDuplicateResolver}
        duplicates={duplicates}
        individualCsvProducts={individualCsvProducts}
        productMaster={productMaster}
        onClose={() => setShowDuplicateResolver(false)}
        onIndividualProductChange={handleIndividualProductChange}
        onIndividualQuantityChange={handleIndividualQuantityChange}
        onRemoveIndividualProduct={removeIndividualProduct}
        onConfirm={handleDuplicateResolverConfirm}
        isSubmitting={isSubmitting}
      />

      {/* 商品追加モーダル */}
      {isAddingProduct && selectedUnmatchedIndex !== null && (
        <ProductAddModal
          isOpen={isAddingProduct}
          unmatchedProduct={unmatchedProducts[selectedUnmatchedIndex]}
          onClose={() => {
            setIsAddingProduct(false)
            setSelectedUnmatchedIndex(null)
          }}
          onAdd={handleAddProduct}
        />
      )}
    </div>
  )
}
