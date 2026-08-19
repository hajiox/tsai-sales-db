// /hooks/useDuplicateChecker.ts ver.1
import { useState, useEffect } from "react"

interface AmazonImportResult {
  productId: string
  productName: string
  amazonTitle: string
  quantity: number
  matched: boolean
  matchType?: 'exact' | 'learned' | 'high' | 'medium' | 'low'
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

export function useDuplicateChecker(
  results: AmazonImportResult[], 
  productMaster: { id: string; name: string }[]
) {
  const [cleanResults, setCleanResults] = useState<AllProductResult[]>([])
  const [duplicates, setDuplicates] = useState<AllProductResult[]>([])

  const detectDuplicates = () => {
    const productMap = new Map<string, AmazonImportResult[]>()
    
    // 商品ID別にグループ化
    results.forEach(result => {
      if (!productMap.has(result.productId)) {
        productMap.set(result.productId, [])
      }
      productMap.get(result.productId)!.push(result)
    })
    
    const newCleanResults: AllProductResult[] = []
    const newDuplicates: AllProductResult[] = []
    
    // 全商品マスターをベースに処理
    productMaster.forEach(product => {
      const matchedResults = productMap.get(product.id) || []
      
      if (matchedResults.length === 0) {
        // データなし商品
        newCleanResults.push({
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
        newCleanResults.push({
          ...result,
          hasData: true,
          isDuplicate: false
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
        
        newDuplicates.push(duplicateResult)
        newCleanResults.push(duplicateResult)
      }
    })
    
    setCleanResults(newCleanResults)
    setDuplicates(newDuplicates)
  }

  useEffect(() => {
    detectDuplicates()
  }, [results, productMaster])

  const getStats = () => {
    const withData = cleanResults.filter(r => r.hasData && r.quantity > 0)
    const withoutData = cleanResults.filter(r => !r.hasData || r.quantity === 0)

    return {
      total: cleanResults.length,
      withData: withData.length,
      withoutData: withoutData.length,
      duplicateCount: duplicates.length,
      totalQuantity: withData.reduce((sum, r) => sum + r.quantity, 0),
      csvOriginalCount: results.length
    }
  }

  return {
    cleanResults,
    duplicates,
    stats: getStats(),
    updateResults: setCleanResults
  }
}
