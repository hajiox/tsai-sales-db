// /components/CsvDebugAnalyzer.tsx ver.1
"use client"

import React, { useState, useMemo } from "react"
import { AlertTriangle, Search, FileText, Calculator } from "lucide-react"

interface CsvDebugAnalyzerProps {
  results: any[]
  unmatchedProducts: any[]
  allProductsResults: any[]
  individualCsvProducts: any[]
  manualSelections: { amazonTitle: string; productId: string }[]
  duplicates: any[]
  showDuplicateResolver: boolean
  csvSummary: any
}

interface DiscrepancyItem {
  type: 'missing' | 'extra' | 'quantity_diff' | 'duplicate_issue'
  amazonTitle: string
  productName: string
  csvQuantity: number
  currentQuantity: number
  difference: number
  details: string
}

// /components/CsvDebugAnalyzer.tsx ver.2
"use client"

import React, { useState, useMemo } from "react"
import { AlertTriangle, Search, FileText, Calculator, Download } from "lucide-react"

interface CsvDebugAnalyzerProps {
  results: any[]
  unmatchedProducts: any[]
  allProductsResults: any[]
  individualCsvProducts: any[]
  manualSelections: { amazonTitle: string; productId: string }[]
  duplicates: any[]
  showDuplicateResolver: boolean
  csvSummary: any
}

interface DiscrepancyItem {
  type: 'missing' | 'extra' | 'quantity_diff' | 'duplicate_issue'
  amazonTitle: string
  productName: string
  csvQuantity: number
  currentQuantity: number
  difference: number
  details: string
}

export default function CsvDebugAnalyzer({
  results,
  unmatchedProducts,
  allProductsResults,
  individualCsvProducts,
  manualSelections,
  duplicates,
  showDuplicateResolver,
  csvSummary
}: CsvDebugAnalyzerProps) {
  
  const [isOpen, setIsOpen] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  // 詳細比較分析
  const analysis = useMemo(() => {
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
      // 重複解消モードの場合
      individualCsvProducts.forEach(item => {
        if (item.quantity > 0) {
          const current = currentMap.get(item.amazonTitle) || 0
          currentMap.set(item.amazonTitle, current + item.quantity)
        }
      })
    } else {
      // 通常モードの場合
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
        
        // 重複関連の問題かチェック
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
    const stats = {
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

  // 🔥 CSV出力機能
  const exportToCSV = (type: 'original' | 'current' | 'comparison') => {
    let csvContent = ''
    let filename = ''

    if (type === 'original') {
      // 元CSVデータの出力
      csvContent = 'Amazon商品名,数量,ソース\n'
      results.forEach(item => {
        csvContent += `"${item.amazonTitle}",${item.quantity},マッチング済み\n`
      })
      unmatchedProducts.forEach(item => {
        csvContent += `"${item.amazonTitle}",${item.quantity},未マッチング\n`
      })
      filename = 'csv_original_data.csv'
    } else if (type === 'current') {
      // 現在の登録予定データの出力
      csvContent = 'Amazon商品名,商品名,数量,状態\n'
      
      if (showDuplicateResolver) {
        individualCsvProducts.forEach(item => {
          if (item.quantity > 0) {
            csvContent += `"${item.amazonTitle}","${item.productName}",${item.quantity},個別商品\n`
          }
        })
      } else {
        allProductsResults.forEach(item => {
          if (item.hasData && item.quantity > 0) {
            csvContent += `"${item.amazonTitle}","${item.productName}",${item.quantity},${item.isDuplicate ? '重複統合' : '単一商品'}\n`
          }
        })
      }
      
      // 修正済み未マッチング商品を追加
      manualSelections.forEach(selection => {
        const unmatchedItem = unmatchedProducts.find(u => u.amazonTitle === selection.amazonTitle)
        if (unmatchedItem) {
          const productName = results.find(r => r.productId === selection.productId)?.productName || '不明'
          csvContent += `"${unmatchedItem.amazonTitle}","${productName}",${unmatchedItem.quantity},手動修正\n`
        }
      })
      filename = 'csv_current_registration.csv'
    } else {
      // 比較結果の出力
      csvContent = 'Amazon商品名,CSV数量,登録予定数量,差分,問題タイプ,詳細\n'
      analysis.discrepancies.forEach(item => {
        csvContent += `"${item.amazonTitle}",${item.csvQuantity},${item.currentQuantity},${item.difference},"${item.type}","${item.details}"\n`
      })
      filename = 'csv_comparison_analysis.csv'
    }

    // CSVダウンロード実行
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const getTypeIcon = (type: DiscrepancyItem['type']) => {
    switch (type) {
      case 'missing': return '❌'
      case 'extra': return '➕'
      case 'quantity_diff': return '⚠️'
      case 'duplicate_issue': return '🔄'
      default: return '❓'
    }
  }

  const getTypeColor = (type: DiscrepancyItem['type']) => {
    switch (type) {
      case 'missing': return 'text-red-600 bg-red-50'
      case 'extra': return 'text-blue-600 bg-blue-50'
      case 'quantity_diff': return 'text-yellow-600 bg-yellow-50'
      case 'duplicate_issue': return 'text-purple-600 bg-purple-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  if (!isOpen) {
    return (
      <div className="mt-4">
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          <Search className="h-4 w-4" />
          詳細分析: CSV vs 登録予定データ
          {analysis.stats.totalDiscrepancy > 0 && (
            <span className="bg-white text-red-600 px-2 py-1 rounded text-xs font-bold">
              差異{analysis.stats.totalDiscrepancy}個
            </span>
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4 border border-red-200 rounded-lg overflow-hidden">
      <div className="bg-red-50 p-4 border-b border-red-200">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-red-800 flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            CSV詳細比較分析
          </h4>
          <button
            onClick={() => setIsOpen(false)}
            className="text-red-600 hover:text-red-800"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* CSV出力ボタン */}
        <div className="flex flex-wrap gap-2 p-3 bg-blue-50 rounded-lg">
          <h5 className="w-full font-medium text-blue-800 mb-2 flex items-center gap-2">
            <Download className="h-4 w-4" />
            CSV出力（詳細比較用）
          </h5>
          <button
            onClick={() => exportToCSV('original')}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            📄 元CSVデータ
          </button>
          <button
            onClick={() => exportToCSV('current')}
            className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
          >
            📋 登録予定データ
          </button>
          <button
            onClick={() => exportToCSV('comparison')}
            className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
          >
            🔍 比較結果
          </button>
        </div>

        {/* 統計サマリー */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-sm text-gray-600">CSV元データ</div>
            <div className="font-bold">{analysis.stats.csvItems}種類</div>
            <div className="text-sm text-gray-600">{analysis.stats.csvTotal.toLocaleString()}個</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-sm text-gray-600">登録予定</div>
            <div className="font-bold">{analysis.stats.currentItems}種類</div>
            <div className="text-sm text-gray-600">{analysis.stats.currentTotal.toLocaleString()}個</div>
          </div>
          <div className="bg-red-50 p-3 rounded">
            <div className="text-sm text-red-600">総差異</div>
            <div className="font-bold text-red-600">{analysis.stats.totalDiscrepancy}個</div>
            <div className="text-sm text-red-600">
              {analysis.stats.csvTotal - analysis.stats.currentTotal}個の差
            </div>
          </div>
          <div className="bg-orange-50 p-3 rounded">
            <div className="text-sm text-orange-600">問題項目</div>
            <div className="font-bold text-orange-600">{analysis.discrepancies.length}項目</div>
            <div className="text-sm text-orange-600">
              要確認
            </div>
          </div>
        </div>

        {/* 問題の内訳 */}
        {analysis.discrepancies.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h5 className="font-medium text-gray-800">検出された問題</h5>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {showDetails ? '詳細を隠す' : '詳細を表示'}
              </button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              <div className="text-center p-2 bg-red-50 rounded">
                <div className="text-lg font-bold text-red-600">{analysis.stats.missingItems}</div>
                <div className="text-xs text-red-600">CSV未登録</div>
              </div>
              <div className="text-center p-2 bg-blue-50 rounded">
                <div className="text-lg font-bold text-blue-600">{analysis.stats.extraItems}</div>
                <div className="text-xs text-blue-600">余分な項目</div>
              </div>
              <div className="text-center p-2 bg-yellow-50 rounded">
                <div className="text-lg font-bold text-yellow-600">{analysis.stats.quantityDiffs}</div>
                <div className="text-xs text-yellow-600">数量不一致</div>
              </div>
              <div className="text-center p-2 bg-purple-50 rounded">
                <div className="text-lg font-bold text-purple-600">{analysis.stats.duplicateIssues}</div>
                <div className="text-xs text-purple-600">重複関連</div>
              </div>
            </div>

            {showDetails && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {analysis.discrepancies.map((item, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded border ${getTypeColor(item.type)}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium flex items-center gap-2">
                          <span>{getTypeIcon(item.type)}</span>
                          {item.amazonTitle}
                        </div>
                        <div className="text-sm mt-1">{item.details}</div>
                      </div>
                      <div className="text-right text-sm">
                        <div>CSV: {item.csvQuantity}</div>
                        <div>登録: {item.currentQuantity}</div>
                        <div className="font-bold">
                          差: {item.difference > 0 ? '+' : ''}{item.difference}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 推奨アクション */}
        <div className="bg-blue-50 p-3 rounded">
          <h5 className="font-medium text-blue-800 mb-2">🔧 推奨アクション</h5>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• <strong>CSV出力ボタン</strong>でファイルをダウンロードし、Excelで詳細比較してください</li>
            {analysis.stats.duplicateIssues > 0 && (
              <li>• 重複解消モードで重複商品を個別に確認してください</li>
            )}
            {analysis.stats.missingItems > 0 && (
              <li>• 未マッチング商品の修正が完了していない可能性があります</li>
            )}
            {analysis.stats.quantityDiffs > 0 && (
              <li>• 数量の手動変更がCSV元データと一致していません</li>
            )}
            <li>• 修正後、このパネルで再度確認してください</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

  // 詳細比較分析
  const analysis = useMemo(() => {
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
      // 重複解消モードの場合
      individualCsvProducts.forEach(item => {
        if (item.quantity > 0) {
          const current = currentMap.get(item.amazonTitle) || 0
          currentMap.set(item.amazonTitle, current + item.quantity)
        }
      })
    } else {
      // 通常モードの場合
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
        
        // 重複関連の問題かチェック
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
    const stats = {
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

  const getTypeIcon = (type: DiscrepancyItem['type']) => {
    switch (type) {
      case 'missing': return '❌'
      case 'extra': return '➕'
      case 'quantity_diff': return '⚠️'
      case 'duplicate_issue': return '🔄'
      default: return '❓'
    }
  }

  const getTypeColor = (type: DiscrepancyItem['type']) => {
    switch (type) {
      case 'missing': return 'text-red-600 bg-red-50'
      case 'extra': return 'text-blue-600 bg-blue-50'
      case 'quantity_diff': return 'text-yellow-600 bg-yellow-50'
      case 'duplicate_issue': return 'text-purple-600 bg-purple-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  if (!isOpen) {
    return (
      <div className="mt-4">
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          <Search className="h-4 w-4" />
          詳細分析: CSV vs 登録予定データ
          {analysis.stats.totalDiscrepancy > 0 && (
            <span className="bg-white text-red-600 px-2 py-1 rounded text-xs font-bold">
              差異{analysis.stats.totalDiscrepancy}個
            </span>
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4 border border-red-200 rounded-lg overflow-hidden">
      <div className="bg-red-50 p-4 border-b border-red-200">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-red-800 flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            CSV詳細比較分析
          </h4>
          <button
            onClick={() => setIsOpen(false)}
            className="text-red-600 hover:text-red-800"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 統計サマリー */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-sm text-gray-600">CSV元データ</div>
            <div className="font-bold">{analysis.stats.csvItems}種類</div>
            <div className="text-sm text-gray-600">{analysis.stats.csvTotal.toLocaleString()}個</div>
          </div>
          <div className="bg-gray-50 p-3 rounded">
            <div className="text-sm text-gray-600">登録予定</div>
            <div className="font-bold">{analysis.stats.currentItems}種類</div>
            <div className="text-sm text-gray-600">{analysis.stats.currentTotal.toLocaleString()}個</div>
          </div>
          <div className="bg-red-50 p-3 rounded">
            <div className="text-sm text-red-600">総差異</div>
            <div className="font-bold text-red-600">{analysis.stats.totalDiscrepancy}個</div>
            <div className="text-sm text-red-600">
              {analysis.stats.csvTotal - analysis.stats.currentTotal}個の差
            </div>
          </div>
          <div className="bg-orange-50 p-3 rounded">
            <div className="text-sm text-orange-600">問題項目</div>
            <div className="font-bold text-orange-600">{analysis.discrepancies.length}項目</div>
            <div className="text-sm text-orange-600">
              要確認
            </div>
          </div>
        </div>

        {/* 問題の内訳 */}
        {analysis.discrepancies.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h5 className="font-medium text-gray-800">検出された問題</h5>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {showDetails ? '詳細を隠す' : '詳細を表示'}
              </button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              <div className="text-center p-2 bg-red-50 rounded">
                <div className="text-lg font-bold text-red-600">{analysis.stats.missingItems}</div>
                <div className="text-xs text-red-600">CSV未登録</div>
              </div>
              <div className="text-center p-2 bg-blue-50 rounded">
                <div className="text-lg font-bold text-blue-600">{analysis.stats.extraItems}</div>
                <div className="text-xs text-blue-600">余分な項目</div>
              </div>
              <div className="text-center p-2 bg-yellow-50 rounded">
                <div className="text-lg font-bold text-yellow-600">{analysis.stats.quantityDiffs}</div>
                <div className="text-xs text-yellow-600">数量不一致</div>
              </div>
              <div className="text-center p-2 bg-purple-50 rounded">
                <div className="text-lg font-bold text-purple-600">{analysis.stats.duplicateIssues}</div>
                <div className="text-xs text-purple-600">重複関連</div>
              </div>
            </div>

            {showDetails && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {analysis.discrepancies.map((item, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded border ${getTypeColor(item.type)}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium flex items-center gap-2">
                          <span>{getTypeIcon(item.type)}</span>
                          {item.amazonTitle}
                        </div>
                        <div className="text-sm mt-1">{item.details}</div>
                      </div>
                      <div className="text-right text-sm">
                        <div>CSV: {item.csvQuantity}</div>
                        <div>登録: {item.currentQuantity}</div>
                        <div className="font-bold">
                          差: {item.difference > 0 ? '+' : ''}{item.difference}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 推奨アクション */}
        <div className="bg-blue-50 p-3 rounded">
          <h5 className="font-medium text-blue-800 mb-2">🔧 推奨アクション</h5>
          <ul className="text-sm text-blue-700 space-y-1">
            {analysis.stats.duplicateIssues > 0 && (
              <li>• 重複解消モードで重複商品を個別に確認してください</li>
            )}
            {analysis.stats.missingItems > 0 && (
              <li>• 未マッチング商品の修正が完了していない可能性があります</li>
            )}
            {analysis.stats.quantityDiffs > 0 && (
              <li>• 数量の手動変更がCSV元データと一致していません</li>
            )}
            <li>• 修正後、このパネルで再度確認してください</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
