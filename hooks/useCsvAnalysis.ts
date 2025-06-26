// /hooks/useCsvAnalysis.ts ver.1
"use client"

import { useMemo } from "react"

interface DiscrepancyItem {
  type: 'missing' | 'extra' | 'quantity_diff' | 'duplicate_issue'
  amazonTitle: string
  productName: string
  csvQuantity: number
  currentQuantity: number
  difference: number
  details: string
}

interface AnalysisStats {
  csvTotal: number
  currentTotal: number
  csvItems: number
  currentItems: number
  totalDiscrepancy: number
  missingItems: number
  extraItems: number
  quantityDiffs: number
  duplicateIssues: number
}

interface UseCsvAnalysisProps {
  results: any[]
  unmatchedProducts: any[]
  allProductsResults: any[]
  individualCsvProducts: any[]
  manualSelections: { amazonTitle: string; productId: string }[]
  duplicates: any[]
  showDuplicateResolver: boolean
}

export function useCsvAnalysis({
  results,
  unmatchedProducts,
  allProductsResults,
  individualCsvProducts,
  manualSelections,
  duplicates,
  showDuplicateResolver
}: UseCsvAnalysisProps) {
  
  return useMemo(() => {
    const discrepancies: DiscrepancyItem[] = []
    
    // 1. CSV元データの集計
    const csvMap = new Map<string, number>()
    results.forEach(item => {
      const current = csvMap.get(item.amazonTitle) || 0
      csvMap.set(item.amazonTitle, current + item.quantity)
    })
    
    unmatchedProducts.forEach(item => {
      const current = csvMap.get(item.amazonTitle) || 0
      csvMap.set(item.amazonTitle, current + item.quantity)
    })

    // 2. 現在の登録予定データの集計
    const currentMap = new Map<string, number>()
    
    if (showDuplicateResolver) {
      individualCsvProducts.forEach(item => {
        if (item.quantity > 0) {
          const current = currentMap.get(item.amazonTitle) || 0
          currentMap.set(item.amazonTitle, current + item.quantity)
        }
      })
    } else {
      allProductsResults.forEach(item => {
        if (item.hasData && item.quantity > 0) {
          const current = currentMap.get(item.amazonTitle) || 0
          currentMap.set(item.amazonTitle, current + item.quantity)
        }
      })
    }
    
    // 3. 修正済み未マッチング商品を追加
    manualSelections.forEach(selection => {
      const unmatchedItem = unmatchedProducts.find(u => u.amazonTitle === selection.amazonTitle)
      if (unmatchedItem) {
        const current = currentMap.get(unmatchedItem.amazonTitle) || 0
        currentMap.set(unmatchedItem.amazonTitle, current + unmatchedItem.quantity)
      }
    })

    // 4. 差異の検出
    const allTitles = new Set([...csvMap.keys(), ...currentMap.keys()])
    
    allTitles.forEach(title => {
      const csvQty = csvMap.get(title) || 0
      const currentQty = currentMap.get(title) || 0
      const diff = csvQty - currentQty
      
      if (diff !== 0) {
        let type: DiscrepancyItem['type'] = 'quantity_diff'
        let details = ''
        
        if (csvQty === 0) {
          type = 'extra'
          details = '登録予定にあるがCSVにない'
        } else if (currentQty === 0) {
          type = 'missing'
          details = 'CSVにあるが登録予定にない'
        } else {
          details = `数量不一致 (CSV: ${csvQty}, 登録予定: ${currentQty})`
        }
        
        const isDuplicateRelated = duplicates.some(dup => 
          dup.duplicateInfo?.amazonTitles.includes(title)
        )
        if (isDuplicateRelated) {
          type = 'duplicate_issue'
          details += ' [重複関連]'
        }
        
        discrepancies.push({
          type,
          amazonTitle: title,
          productName: results.find(r => r.amazonTitle === title)?.productName || '不明',
          csvQuantity: csvQty,
          currentQuantity: currentQty,
          difference: diff,
          details
        })
      }
    })

    // 5. 統計情報
    const stats: AnalysisStats = {
      csvTotal: Array.from(csvMap.values()).reduce((sum, qty) => sum + qty, 0),
      currentTotal: Array.from(currentMap.values()).reduce((sum, qty) => sum + qty, 0),
      csvItems: csvMap.size,
      currentItems: currentMap.size,
      totalDiscrepancy: discrepancies.reduce((sum, item) => sum + Math.abs(item.difference), 0),
      missingItems: discrepancies.filter(d => d.type === 'missing').length,
      extraItems: discrepancies.filter(d => d.type === 'extra').length,
      quantityDiffs: discrepancies.filter(d => d.type === 'quantity_diff').length,
      duplicateIssues: discrepancies.filter(d => d.type === 'duplicate_issue').length
    }

    return { discrepancies, stats, csvMap, currentMap }
  }, [results, unmatchedProducts, allProductsResults, individualCsvProducts, manualSelections, duplicates, showDuplicateResolver])
}

export type { DiscrepancyItem, AnalysisStats }
