// /components/CsvComparisonDisplay.tsx ver.1
"use client"

import React, { useState } from "react"
import { DiscrepancyItem } from "../hooks/useCsvAnalysis"

interface CsvComparisonDisplayProps {
  analysis: {
    discrepancies: DiscrepancyItem[]
    stats: {
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
  }
}

export default function CsvComparisonDisplay({ analysis }: CsvComparisonDisplayProps) {
  const [showDetails, setShowDetails] = useState(false)

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

  return (
    <>
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
          <div className="text-sm text-orange-600">要確認</div>
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
    </>
  )
}
