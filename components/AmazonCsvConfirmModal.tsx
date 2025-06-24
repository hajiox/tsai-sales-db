// /components/AmazonCsvConfirmModal.tsx ver.7 (重複解消UI付き)
"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import ProductAddModal from "./ProductAddModal"

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

// 🔥 新規: 重複解消用の個別CSV商品
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
  
  // 🔥 重複チェック機能
  const detectDuplicates = (results: AmazonImportResult[]): { cleanResults: AllProductResult[], duplicates: AllProductResult[], individualProducts: IndividualCsvProduct[] } => {
    const productMap = new Map<string, AmazonImportResult[]>()
    
    // 商品ID別にグループ化
    results.forEach(result => {
      if (!productMap.has(result.productId)) {
        productMap.set(result.productId, [])
      }
      productMap.get(result.productId)!.push(result)
    })
    
    const cleanResults: AllProductResult[] = []
    const duplicates: AllProductResult[] = []
    const individualProducts: IndividualCsvProduct[] = []
    
    // 全商品マスターをベースに処理
    productMaster.forEach(product => {
      const matchedResults = productMap.get(product.id) || []
      
      if (matchedResults.length === 0) {
        // データなし商品
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
        // 正常商品（重複なし）
        const result = matchedResults[0]
        cleanResults.push({
          ...result,
          hasData: true,
          isDuplicate: false
        })
        
        // 個別商品としても追加
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
        // 🚨 重複商品検出
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
        
        // 🔥 重複商品を個別に分離してindividualProductsに追加
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
  const [originalResults, setOriginalResults] = useState<AmazonImportResult[]>(results)
  const [showUnmatched, setShowUnmatched] = useState(false)
  const [showZeroQuantity, setShowZeroQuantity] = useState(false)
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false)
  const [showDuplicateResolver, setShowDuplicateResolver] = useState(false) // 🔥 新機能
  const [isAddingProduct, setIsAddingProduct] = useState(false)
  const [selectedUnmatchedIndex, setSelectedUnmatchedIndex] = useState<number | null>(null)
  const [manualSelections, setManualSelections] = useState<{amazonTitle: string, productId: string}[]>([])
  const router = useRouter()

  // 結果が更新されたら重複チェックも更新
  React.useEffect(() => {
    const { cleanResults, individualProducts } = detectDuplicates(results)
    setAllProductsResults(cleanResults)
    setIndividualCsvProducts(individualProducts)
    setOriginalResults(results)
  }, [results, productMaster])

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

      // 学習データ対象チェック
      if (updated[index].hasData) {
        setManualSelections(prev => [...prev, {
          amazonTitle: updated[index].amazonTitle,
          productId: newProductId
        }])
      }
    }
  }

  // 🔥 新機能: 個別CSV商品の商品変更
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

        // 学習データ追加
        setManualSelections(prev => [...prev, {
          amazonTitle: updated[targetIndex].amazonTitle,
          productId: newProductId
        }])
      }
    }
  }

  // 🔥 新機能: 個別CSV商品の数量変更
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

  // 🔥 新機能: 個別CSV商品の削除
  const removeIndividualProduct = (csvProductId: string) => {
    const updated = individualCsvProducts.filter(p => p.id !== csvProductId)
    setIndividualCsvProducts(updated)
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

  const handleUnmatchedProductSelect = (unmatchedIndex: number, productId: string) => {
    if (!productId) return
    
    const selectedProduct = productMaster.find(p => p.id === productId)
    if (!selectedProduct) return

    const unmatchedProduct = unmatchedProducts[unmatchedIndex]
    
    const updated = [...allProductsResults]
    const existingIndex = updated.findIndex(p => p.productId === productId)
    
    if (existingIndex !== -1) {
      updated[existingIndex] = {
        ...updated[existingIndex],
        amazonTitle: unmatchedProduct.amazonTitle,
        quantity: unmatchedProduct.quantity,
        hasData: true,
        matchType: 'medium'
      }
      setAllProductsResults(updated)
    }

    setManualSelections(prev => [...prev, {
      amazonTitle: unmatchedProduct.amazonTitle,
      productId: selectedProduct.id
    }])
  }

  const getMatchingStats = () => {
    if (showDuplicateResolver) {
      // 重複解消モードでは個別CSV商品ベースで集計
      const withData = individualCsvProducts.filter(p => p.quantity > 0)
      return {
        total: individualCsvProducts.length,
        withData: withData.length,
        withoutData: individualCsvProducts.length - withData.length,
        duplicateCount: duplicates.length,
        totalQuantity: withData.reduce((sum, p) => sum + p.quantity, 0),
        csvOriginalCount: results.length
      }
    } else {
      // 通常モードでは統合後ベースで集計
      const withData = allProductsResults.filter(r => r.hasData && r.quantity > 0)
      const withoutData = allProductsResults.filter(r => !r.hasData || r.quantity === 0)
      return {
        total: allProductsResults.length,
        withData: withData.length,
        withoutData: withoutData.length,
        duplicateCount: duplicates.length,
        totalQuantity: withData.reduce((sum, r) => sum + r.quantity, 0),
        csvOriginalCount: results.length
      }
    }
  }

  const stats = getMatchingStats()

  const handleConfirm = async () => {
    let resultsToConfirm: AmazonImportResult[] = []

    if (showDuplicateResolver) {
      // 重複解消モードでは個別CSV商品から確定データを作成
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
      // 通常モードでは統合後データから確定データを作成
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
    if (duplicates.length > 0 && !showDuplicateResolver) {
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

  // 🔥 重複解消モード用の表示データ
  let displayIndividualProducts = individualCsvProducts
  if (showDuplicateResolver) {
    displayIndividualProducts = individualCsvProducts.filter(p => p.isFromDuplicate)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b bg-gray-50 flex-shrink-0">
          <h3 className="text-lg font-semibold">Amazon CSVインポート確認</h3>
          <p className="text-sm text-gray-600 mt-1">
            {month}月のAmazonデータを確認し、必要に応じて修正してください。
          </p>
          
          {/* 🚨 重複警告 */}
          {duplicates.length > 0 && !showDuplicateResolver && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <h4 className="text-red-800 font-semibold mb-2">⚠️ 重複検出！</h4>
              <p className="text-sm text-red-700 mb-2">
                <strong>{duplicates.length}商品</strong>で重複が検出されました。同じ商品マスターに複数のCSV商品が紐付いています。
              </p>
              <div className="text-xs text-red-600 mb-2">
                数量は自動で合計されますが、個別に修正することを推奨します。
              </div>
              <button
                onClick={() => setShowDuplicateResolver(true)}
                className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700"
              >
                🔧 重複を個別に修正する
              </button>
            </div>
          )}

          {/* 🔥 重複解消モード表示 */}
          {showDuplicateResolver && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-blue-800 font-semibold mb-2">🔧 重複解消モード</h4>
              <p className="text-sm text-blue-700 mb-2">
                重複していたCSV商品を個別に表示しています。それぞれを適切な商品マスターに紐付け直してください。
              </p>
              <button
                onClick={() => setShowDuplicateResolver(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                ← 通常表示に戻る
              </button>
            </div>
          )}
          
          {/* 統計情報 */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500">全商品数</div>
              <div className="text-lg font-bold text-blue-600">{stats.total}品種</div>
            </div>
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500">データあり商品</div>
              <div className="text-lg font-bold text-green-600">{stats.withData}品種</div>
            </div>
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500">合計販売数量</div>
              <div className="text-lg font-bold text-green-600">{stats.totalQuantity.toLocaleString()}個</div>
            </div>
            <div className={`bg-white rounded-lg p-3 border ${stats.duplicateCount > 0 ? 'border-red-300 bg-red-50' : ''}`}>
              <div className="text-xs text-gray-500">重複商品</div>
              <div className={`text-lg font-bold ${stats.duplicateCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {stats.duplicateCount}品種
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500">CSV元行数</div>
              <div className="text-lg font-bold text-gray-600">{stats.csvOriginalCount}行</div>
            </div>
          </div>

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

        <div className="flex-1 p-4 overflow-y-auto">
          {/* 🔥 重複解消モード */}
          {showDuplicateResolver ? (
            <>
              <h4 className="text-lg font-semibold mb-4 text-blue-600">
                重複CSV商品一覧 ({displayIndividualProducts.length}商品)
              </h4>
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm text-blue-700">
                  <strong>💡 重複解消:</strong> 
                  同じ商品マスターに紐付いていた{duplicates.length}商品の個別CSV商品を表示しています。
                  それぞれを適切な商品マスターに紐付け直してください。
                </p>
              </div>
              
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {displayIndividualProducts.map((csvProduct) => (
                  <div key={csvProduct.id} className="border-2 border-red-200 rounded-lg p-4 bg-red-50">
                    {/* 重複元情報 */}
                    <div className="mb-4 p-2 bg-red-100 border border-red-200 rounded">
                      <div className="text-xs text-red-700 font-semibold">🚨 重複元商品</div>
                      <div className="text-xs text-red-600 mt-1">
                        元々紐付き先: {csvProduct.productName}
                      </div>
                    </div>

                    {/* CSV商品情報 */}
                    <div className="mb-4">
                      <label className="text-xs text-gray-500 font-medium">CSV商品名</label>
                      <p className="text-sm font-bold text-gray-800">{csvProduct.amazonTitle}</p>
                    </div>

                    {/* 商品選択（修正） */}
                    <div className="mb-4">
                      <label className="text-xs text-gray-500 font-medium block mb-1">
                        正しい商品マスターを選択
                        <span className="ml-2 text-xs text-red-600">※修正必須</span>
                      </label>
                      <select
                        value={csvProduct.productId}
                        onChange={(e) => handleIndividualProductChange(csvProduct.id, e.target.value)}
                        className="w-full text-sm border-2 border-red-300 rounded px-3 py-2 bg-white"
                      >
                        <option value="">商品を選択...</option>
                        {productMaster.map((product) => (
                          <option key={product.id} value={product.id}>{product.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* 数量・削除 */}
                    <div className="flex items-center gap-4 mb-4">
                      <div className="flex-1">
                        <label className="text-xs text-gray-500 font-medium block mb-1">販売数</label>
                        <input
                          type="number"
                          value={csvProduct.quantity}
                          onChange={(e) => handleIndividualQuantityChange(csvProduct.id, parseInt(e.target.value) || 0)}
                          className="w-full text-sm border rounded px-3 py-2"
                          min="0"
                        />
                      </div>
                      <div className="pt-6">
                        <button
                          onClick={() => removeIndividualProduct(csvProduct.id)}
                          className="text-red-500 hover:text-red-700 text-sm px-3 py-2 border border-red-200 rounded"
                        >
                          削除
                        </button>
                      </div>
                    </div>

                    {/* マッチタイプ */}
                    <div>
                      <div className="text-xs px-3 py-1 rounded inline-block bg-red-100 text-red-800">
                        重複解消中 - 修正が必要
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* 通常モード */
            <>
              <h4 className="text-lg font-semibold mb-4 text-blue-600">
                {showDuplicatesOnly ? `重複商品一覧 (${displayResults.length}品種)` : `全商品一覧 (${displayResults.length}品種表示中)`}
              </h4>
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm text-blue-700">
                  <strong>💡 数字の流れ:</strong> 
                  CSV元データ{stats.csvOriginalCount}行 → 統合後{stats.withData}品種（重複{stats.duplicateCount}件統合済み）
                  = 数量{stats.totalQuantity.toLocaleString()}個
                </p>
              </div>
              
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {displayResults.map((result, index) => (
                  <div key={`${result.productId}-${index}`} className={`border rounded-lg p-4 ${
                    result.isDuplicate ? 'bg-red-50 border-red-300' :
                    !result.hasData ? 'bg-gray-50 border-gray-200' :
                    result.matchType === 'exact' || result.matchType === 'learned' ? 'bg-green-50 border-green-200' :
                    result.matchType === 'high' ? 'bg-blue-50 border-blue-200' :
                    result.matchType === 'medium' ? 'bg-yellow-50 border-yellow-200' :
                    'bg-orange-50 border-orange-200'
                  }`}>
                    
                    {/* 重複警告 */}
                    {result.isDuplicate && result.duplicateInfo && (
                      <div className="mb-4 p-2 bg-red-100 border border-red-200 rounded">
                        <div className="text-xs text-red-700 font-semibold">🚨 重複検出</div>
                        <div className="text-xs text-red-600 mt-1">
                          {result.duplicateInfo.count}件のCSV商品が同じマスターに紐付き:
                        </div>
                        <div className="text-xs text-red-600 mt-1">
                          数量: {result.duplicateInfo.originalQuantities.join(' + ')} = {result.duplicateInfo.totalQuantity}個
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
                    <div className="mb-4">
                      <label className="text-xs text-gray-500 font-medium">商品名</label>
                      <p className="text-sm font-bold text-gray-800">{result.productName}</p>
                    </div>

                    {/* Amazon商品名 */}
                    {result.hasData && (
                      <div className="mb-4">
                        <label className="text-xs text-gray-500 font-medium">Amazon商品名</label>
                        <p className="text-sm font-medium text-gray-700">{result.amazonTitle}</p>
                      </div>
                    )}

                    {/* 商品選択 */}
                    <div className="mb-4">
                      <label className="text-xs text-gray-500 font-medium block mb-1">
                        商品選択（修正可能）
                        {result.hasData && <span className="ml-2 text-xs text-blue-600">※要確認</span>}
                      </label>
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

                    {/* 販売数・削除ボタン */}
                    <div className="flex items-center gap-4 mb-4">
                      <div className="flex-1">
                        <label className="text-xs text-gray-500 font-medium block mb-1">
                          販売数{result.isDuplicate ? '（統合済み）' : ''}
                        </label>
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

                    {/* マッチタイプラベル */}
                    <div>
                      <div className={`text-xs px-3 py-1 rounded inline-block ${
                        result.isDuplicate ? 'bg-red-100 text-red-800' :
                        !result.hasData ? 'bg-gray-100 text-gray-600' :
                        result.matchType === 'exact' || result.matchType === 'learned' ? 'bg-green-100 text-green-800' :
                        result.matchType === 'high' ? 'bg-blue-100 text-blue-800' :
                        result.matchType === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-orange-100 text-orange-800'
                      }`}>
                        {result.isDuplicate ? `重複統合 (${result.duplicateInfo?.count}件)` :
                         !result.hasData ? 'データなし' :
                         result.matchType === 'exact' ? '完全一致（要確認）' :
                         result.matchType === 'learned' ? '学習済み（要確認）' :
                         result.matchType === 'high' ? '高精度（要確認）' :
                         result.matchType === 'medium' ? '中精度（要確認）' :
                         '低精度（要確認）'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="border-t bg-gray-50 p-6 flex-shrink-0">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              <div>Amazon列のみを更新します（他のECサイトデータは保持）</div>
              <div className="text-xs text-blue-600 mt-1">
                {showDuplicateResolver ? (
                  <>✅ 重複解消モード: {stats.withData}件のCSV商品をDBに保存</>
                ) : (
                  <>✅ データあり{stats.withData}品種・{stats.totalQuantity.toLocaleString()}個をDBに保存
                  {stats.duplicateCount > 0 && (
                    <span className="text-red-600 ml-2">🚨 重複{stats.duplicateCount}件統合済み</span>
                  )}</>
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
                disabled={isSubmitting || stats.withData === 0}
                className={`px-6 py-2 text-sm text-white rounded disabled:opacity-50 ${
                  showDuplicateResolver ? 'bg-blue-600 hover:bg-blue-700' :
                  stats.duplicateCount > 0 ? 'bg-red-600 hover:bg-red-700' :
                  isSubmitting ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isSubmitting ? '処理中...' : 
                 showDuplicateResolver ? `重複解消完了：${stats.withData}件をDBに反映` :
                 stats.duplicateCount > 0 ? `重複統合して${stats.withData}品種をDBに反映` :
                 `${stats.withData}品種をDBに反映`}
              </button>
            </div>
          </div>
        </div>
      </div>

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
