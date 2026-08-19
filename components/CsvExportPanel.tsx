// /components/CsvExportPanel.tsx ver.1
"use client"

import React from "react"
import { Download } from "lucide-react"

interface CsvExportPanelProps {
  analysis: any
  results: any[]
  unmatchedProducts: any[]
  allProductsResults: any[]
  individualCsvProducts: any[]
  manualSelections: { amazonTitle: string; productId: string }[]
  showDuplicateResolver: boolean
}

export default function CsvExportPanel({
  analysis,
  results,
  unmatchedProducts,
  allProductsResults,
  individualCsvProducts,
  manualSelections,
  showDuplicateResolver
}: CsvExportPanelProps) {

  const exportToCSV = (type: 'original' | 'current' | 'comparison') => {
    let csvContent = ''
    let filename = ''

    if (type === 'original') {
      csvContent = 'Amazon商品名,数量,ソース\n'
      results.forEach(item => {
        csvContent += `"${item.amazonTitle}",${item.quantity},マッチング済み\n`
      })
      unmatchedProducts.forEach(item => {
        csvContent += `"${item.amazonTitle}",${item.quantity},未マッチング\n`
      })
      filename = 'csv_original_data.csv'
    } else if (type === 'current') {
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
      
      manualSelections.forEach(selection => {
        const unmatchedItem = unmatchedProducts.find(u => u.amazonTitle === selection.amazonTitle)
        if (unmatchedItem) {
          const productName = results.find(r => r.productId === selection.productId)?.productName || '不明'
          csvContent += `"${unmatchedItem.amazonTitle}","${productName}",${unmatchedItem.quantity},手動修正\n`
        }
      })
      filename = 'csv_current_registration.csv'
    } else {
      csvContent = 'Amazon商品名,CSV数量,登録予定数量,差分,問題タイプ,詳細\n'
      analysis.discrepancies.forEach((item: any) => {
        csvContent += `"${item.amazonTitle}",${item.csvQuantity},${item.currentQuantity},${item.difference},"${item.type}","${item.details}"\n`
      })
      filename = 'csv_comparison_analysis.csv'
    }

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

  return (
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
  )
}
