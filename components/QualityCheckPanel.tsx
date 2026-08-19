// /components/QualityCheckPanel.tsx ver.3 (進捗表示削除版)
"use client"

import React from "react"

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

interface QualityCheckPanelProps {
  qualityCheck: QualityCheck
  isDuplicateResolverMode: boolean
  className?: string
}

export default function QualityCheckPanel({
  qualityCheck,
  isDuplicateResolverMode,
  className = ""
}: QualityCheckPanelProps) {

  const {
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
    duplicateCount,
    productCount
  } = qualityCheck

  const getQualityDisplay = () => {
    if (isQuantityValid) {
      return {
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        textColor: 'text-green-800',
        icon: '✅',
        status: '品質OK'
      }
    } else if (warningLevel === 'error') {
      return {
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        textColor: 'text-red-800',
        icon: '❌',
        status: '品質エラー'
      }
    } else {
      return {
        bgColor: 'bg-yellow-50',
        borderColor: 'border-yellow-200',
        textColor: 'text-yellow-800',
        icon: '⚠️',
        status: '要注意'
      }
    }
  }

  const quality = getQualityDisplay()

  return (
    <div className={`${quality.bgColor} ${quality.borderColor} border rounded-lg p-4 ${className}`}>
      
      <div className="flex items-center justify-between mb-4">
        <h4 className={`font-semibold ${quality.textColor} flex items-center gap-2`}>
          <span className="text-lg">{quality.icon}</span>
          数量整合性チェック: {quality.status}
        </h4>
        
        {!isQuantityValid && (
          <div className={`text-sm px-3 py-1 rounded ${quality.bgColor} ${quality.textColor} border ${quality.borderColor}`}>
            差分: {discrepancy > 0 ? '+' : ''}{discrepancy}個
          </div>
        )}
      </div>

      <div className="space-y-3">
        
        <div className="flex items-center justify-between py-2 border-b border-gray-200">
          <span className="text-sm text-gray-600">📄 CSV元データ</span>
          <div className="text-right">
            <div className="font-medium">{csvOriginalTotal.toLocaleString()}個</div>
            <div className="text-xs text-gray-500">({csvRecordCount}行)</div>
          </div>
        </div>

        <div className="flex items-center justify-between py-2 border-b border-gray-200">
          <span className="text-sm text-gray-600">🎯 マッチング成功</span>
          <div className="text-right">
            <div className="font-medium text-green-600">{matchedTotal.toLocaleString()}個</div>
            <div className="text-xs text-gray-500">({productCount}品種)</div>
          </div>
        </div>

        {unmatchedTotal > 0 && (
          <div className="flex items-center justify-between py-2 border-b border-gray-200">
            <span className="text-sm text-gray-600">❓ 未マッチング</span>
            <div className="text-right">
              <div className="font-medium text-orange-600">{unmatchedTotal.toLocaleString()}個</div>
            </div>
          </div>
        )}

        {duplicateCount > 0 && (
          <div className="flex items-center justify-between py-2 border-b border-gray-200">
            <span className="text-sm text-gray-600">🔧 重複調整</span>
            <div className="text-right">
              <div className="font-medium text-red-600">{duplicateAdjustment > 0 ? '-' : '+'}{Math.abs(duplicateAdjustment).toLocaleString()}個</div>
              <div className="text-xs text-gray-500">({duplicateCount}商品)</div>
            </div>
          </div>
        )}

        {deletedTotal > 0 && (
          <div className="flex items-center justify-between py-2 border-b border-gray-200">
            <span className="text-sm text-gray-600">🗑️ 削除分</span>
            <div className="text-right">
              <div className="font-medium text-gray-600">-{deletedTotal.toLocaleString()}個</div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between py-2 border-t-2 border-gray-300 pt-3">
          <span className="text-sm font-semibold text-gray-800">💾 最終保存予定</span>
          <div className="text-right">
            <div className={`text-lg font-bold ${isQuantityValid ? 'text-green-600' : quality.textColor}`}>
              {finalTotal.toLocaleString()}個
            </div>
            {isDuplicateResolverMode && (
              <div className="text-xs text-blue-600">重複解消モード</div>
            )}
          </div>
        </div>
      </div>

      {!isQuantityValid && (
        <div className={`mt-4 p-3 ${quality.bgColor} border ${quality.borderColor} rounded`}>
          <div className={`text-sm ${quality.textColor} font-medium mb-2`}>
            {quality.icon} 品質チェック結果
          </div>
          <div className={`text-sm ${quality.textColor}`}>
            {warningLevel === 'error' ? (
              <>
                数量に大きな差分があります（{Math.abs(discrepancy)}個）。
                データの整合性を確認してください。
              </>
            ) : (
              <>
                数量に軽微な差分があります（{Math.abs(discrepancy)}個）。
                問題なければそのまま登録できます。
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
