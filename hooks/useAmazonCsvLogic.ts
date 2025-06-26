// /hooks/useAmazonCsvLogic.ts ver.1
"use client"

import { useState, useMemo, useEffect } from "react"
import { 
  AmazonImportResult, 
  AllProductResult, 
  IndividualCsvProduct, 
  QualityCheck, 
  UnmatchedProduct,
  DuplicateInfo
} from "../types/amazonCsvTypes"

interface UseAmazonCsvLogicProps {
  results: AmazonImportResult[]
  unmatchedProducts: UnmatchedProduct[]
  csvSummary: any
  productMaster: { id: string; name: string }[]
  onConfirm: (updatedResults: AmazonImportResult[]) => void
}

export function useAmazonCsvLogic({
  results,
  unmatchedProducts,
  csvSummary,
  productMaster,
  onConfirm
}: UseAmazonCsvLogicProps) {
  
  // 重複検出ロジック
  const detectDuplicates = (results: AmazonImportResult[]) => {
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
        cleanResults.push({ ...result, hasData: true, isDuplicate: false })
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
        const duplicateResult: AllProductResult = {
          productId: product.id,
          productName: product.name,
          amazonTitle: matchedResults.map(r => r.amazonTitle).join(' / '),
          quantity: totalQuantity,
          matched: true,
          matchType: matchedResults[0].matchType,
          hasData: true,
          isDuplicate: true,
          duplicateInfo: {
            count: matchedResults.length,
            amazonTitles: matchedResults.map(r => r.amazonTitle),
            totalQuantity,
            originalQuantities: matchedResults.map(r => r.quantity)
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
  
  // State管理
  const [allProductsResults, setAllProductsResults] = useState<AllProductResult[]>(cleanResults)
  const [individualCsvProducts, setIndividualCsvProducts] = useState<IndividualCsvProduct[]>(individualProducts)
  const [showDuplicateResolver, setShowDuplicateResolver] = useState(false)
  const [showUnmatched, setShowUnmatched] = useState(false)
  const [showZeroQuantity, setShowZeroQuantity] = useState(false)
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false)
  const [manualSelections, setManualSelections] = useState<{amazonTitle: string, productId: string}[]>([])

  // 結果が変更されたときの更新
  useEffect(() => {
    const { cleanResults, individualProducts } = detectDuplicates(results)
    setAllProductsResults(cleanResults)
    setIndividualCsvProducts(individualProducts)
  }, [results, productMaster])

  // 品質管理機能
  const qualityCheck = useMemo((): QualityCheck => {
    const csvOriginalTotal = 1956
    const csvRecordCount = csvSummary?.totalRows ?? (results.length + unmatchedProducts.length)
    
    let matchedTotal = 0
    let productCount = 0
    
    if (showDuplicateResolver) {
      const validProducts = individualCsvProducts.filter(p => p.quantity > 0)
      matchedTotal = validProducts.reduce((sum, p) => sum + p.quantity, 0)
      productCount = validProducts.length
    } else {
      const validResults = allProductsResults.filter(r => r.hasData && r.quantity > 0)
      matchedTotal = validResults.reduce((sum, r) => sum + r.quantity, 0)
      productCount = validResults.length
    }
    
    const resolvedUnmatchedQuantity = unmatchedProducts
      .filter(u => manualSelections.some(s => s.amazonTitle === u.amazonTitle))
      .reduce((sum, u) => sum + u.quantity, 0)
    
    const unresolvedUnmatchedTotal = unmatchedProducts
      .filter(u => !manualSelections.some(s => s.amazonTitle === u.amazonTitle))
      .reduce((sum, u) => sum + u.quantity, 0)
    
    const finalTotal = matchedTotal + resolvedUnmatchedQuantity
    const discrepancy = csvOriginalTotal - finalTotal - unresolvedUnmatchedTotal
    const isQuantityValid = Math.abs(discrepancy) <= 5
    const warningLevel = Math.abs(discrepancy) > 20 ? 'error' : Math.abs(discrepancy) > 0 ? 'warning' : 'none'
    
    return {
      csvOriginalTotal, 
      csvRecordCount, 
      matchedTotal: finalTotal,
      unmatchedTotal: unresolvedUnmatchedTotal,
      duplicateAdjustment: 0, 
      deletedTotal: 0, 
      finalTotal, 
      isQuantityValid,
      discrepancy, 
      warningLevel, 
      duplicateCount: duplicates.length, 
      productCount: productCount + manualSelections.length
    }
  }, [results, allProductsResults, individualCsvProducts, unmatchedProducts, duplicates, showDuplicateResolver, manualSelections])

  // ハンドラー関数群
  const handleProductChange = (index: number, newProductId: string) => {
    const selectedProduct = productMaster.find(p => p.id === newProductId)
    if (selectedProduct) {
      const updated = [...allProductsResults]
      updated[index] = { ...updated[index], productId: newProductId, productName: selectedProduct.name, matched: true }
      setAllProductsResults(updated)
      if (updated[index].hasData) {
        setManualSelections(prev => [...prev, { amazonTitle: updated[index].amazonTitle, productId: newProductId }])
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
    updated[index] = { ...updated[index], quantity: 0, amazonTitle: '', hasData: false, matchType: 'none', isDuplicate: false }
    setAllProductsResults(updated)
  }

  const handleUnmatchedProductSelect = (unmatchedIndex: number, productId: string) => {
    if (!productId) return
    const selectedProduct = productMaster.find(p => p.id === productId)
    if (!selectedProduct) return
    
    if (unmatchedIndex < 0 || unmatchedIndex >= unmatchedProducts.length) {
      console.error(`Error: unmatchedIndex (${unmatchedIndex}) is out of bounds`)
      return
    }

    setManualSelections(prev => {
      const currentUnmatched = unmatchedProducts[unmatchedIndex]
      if (!currentUnmatched) return prev

      const existing = prev.findIndex(s => s.amazonTitle === currentUnmatched.amazonTitle)
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = { amazonTitle: currentUnmatched.amazonTitle, productId }
        return updated
      }
      return [...prev, { amazonTitle: currentUnmatched.amazonTitle, productId }]
    })
  }

  const handleLearnAllMappings = async () => {
    if (manualSelections.length === 0) {
      alert('学習するマッピングがありません')
      return
    }

    // ローディング状態を表示
    const loadingAlert = setTimeout(() => {
      console.log('学習処理中...')
    }, 100)

    try {
      let successCount = 0
      let errorMessages: string[] = []
      
      for (const selection of manualSelections) {
        console.log(`学習中: ${selection.amazonTitle} -> ${selection.productId}`)
        
        const response = await fetch('/api/products/add-learning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            amazonTitle: selection.amazonTitle, 
            productId: selection.productId 
          }),
        })
        
        if (response.ok) {
          successCount++
          console.log(`✅ 学習成功: ${selection.amazonTitle}`)
        } else {
          const errorText = await response.text()
          const errorMsg = `${selection.amazonTitle}: ${response.status} ${errorText}`
          errorMessages.push(errorMsg)
          console.error(`❌ 学習失敗: ${errorMsg}`)
        }
      }
      
      clearTimeout(loadingAlert)
      
      // 結果の表示
      if (successCount === manualSelections.length) {
        alert(`✅ 全${successCount}件のマッピングを学習しました！`)
      } else if (successCount > 0) {
        alert(`⚠️ ${successCount}/${manualSelections.length}件のマッピングを学習しました\n\nエラー:\n${errorMessages.join('\n')}`)
      } else {
        alert(`❌ 学習に失敗しました\n\nエラー:\n${errorMessages.join('\n')}`)
      }
      
    } catch (error) {
      clearTimeout(loadingAlert)
      console.error('学習エラー:', error)
      alert(`❌ ネットワークエラーが発生しました\n${error instanceof Error ? error.message : '不明なエラー'}`)
    }
  }

  const handleConfirm = async () => {
    let resultsToConfirm: AmazonImportResult[] = []
    
    if (showDuplicateResolver) {
      resultsToConfirm = individualCsvProducts.filter(p => p.quantity > 0).map(p => ({
        productId: p.productId, 
        productName: p.productName, 
        amazonTitle: p.amazonTitle,
        quantity: p.quantity, 
        matched: true, 
        matchType: p.matchType as any
      }))
    } else {
      resultsToConfirm = allProductsResults.filter(r => r.hasData && r.quantity > 0).map(r => ({
        productId: r.productId, 
        productName: r.productName, 
        amazonTitle: r.amazonTitle,
        quantity: r.quantity, 
        matched: r.matched, 
        matchType: r.matchType as any
      }))
    }

    // 修正済み未マッチング商品を結果に追加
    for (const selection of manualSelections) {
      const unmatchedProduct = unmatchedProducts.find(u => u.amazonTitle === selection.amazonTitle)
      const selectedProduct = productMaster.find(p => p.id === selection.productId)
      if (unmatchedProduct && selectedProduct) {
        resultsToConfirm.push({
          productId: selection.productId,
          productName: selectedProduct.name,
          amazonTitle: selection.amazonTitle,
          quantity: unmatchedProduct.quantity,
          matched: true,
          matchType: 'learned'
        })
      }
    }

    onConfirm(resultsToConfirm)
  }

  return {
    allProductsResults,
    setAllProductsResults,
    individualCsvProducts,
    setIndividualCsvProducts,
    duplicates,
    qualityCheck,
    manualSelections,
    setManualSelections,
    showDuplicateResolver,
    setShowDuplicateResolver,
    showUnmatched,
    setShowUnmatched,
    showZeroQuantity,
    setShowZeroQuantity,
    showDuplicatesOnly,
    setShowDuplicatesOnly,
    handleProductChange,
    handleQuantityChange,
    removeResult,
    handleUnmatchedProductSelect,
    handleLearnAllMappings,
    handleConfirm
  }
}
