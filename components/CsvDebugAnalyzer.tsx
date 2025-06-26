// /components/CsvDebugAnalyzer.tsx ver.3
"use client"

import React, { useState } from "react"
import { Search } from "lucide-react"
import { useCsvAnalysis } from "../hooks/useCsvAnalysis"
import CsvExportPanel from "./CsvExportPanel"
import CsvComparisonDisplay from "./CsvComparisonDisplay"

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
  
  const analysis = useCsvAnalysis({
    results,
    unmatchedProducts,
    allProductsResults,
    individualCsvProducts,
    manualSelections,
    duplicates,
    showDuplicateResolver,
    csvSummary  // 🔥 csvSummaryを渡して正確な元データ総数を取得
  })

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
        <CsvExportPanel 
          analysis={analysis}
          results={results}
          unmatchedProducts={unmatchedProducts}
          allProductsResults={allProductsResults}
          individualCsvProducts={individualCsvProducts}
          manualSelections={manualSelections}
          showDuplicateResolver={showDuplicateResolver}
        />
        
        <CsvComparisonDisplay analysis={analysis} />
      </div>
    </div>
  )
}
