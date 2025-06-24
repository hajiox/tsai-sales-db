// /components/QualityCheckPanel.tsx ver.1 (品質管理専用パネル)
"use client"

import React from "react"

interface QualityCheck {
  csvOriginalTotal: number      // CSV読込時の総数量
  csvRecordCount: number       // CSV行数
  matchedTotal: number         // マッチング成功総数量  
  unmatchedTotal: number       // 未マッチング総数量
  duplicateAdjustment: number  // 重複調整分
  deletedTotal: number         // 削除総数量
  finalTotal: number          // 最終確定総数量
  
  // 品質チェック結果
  isQuantityValid: boolean     // 数量整合性OK/NG
  discrepancy: number         // 差分数量
  warningLevel: 'none' | 'warning' | 'error'
  
  // 追加情報
  duplicateCount: number      // 重複商品数
  productCount: number        // 商品種類数
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

  // 品質レベルの色とアイコン
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
      
      {/* 品質ステータスヘッダー */}
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

      {/* 数量フロー表示 */}
      <div className="space-y-3">
        
        {/* CSV原データ */}
        <div className="flex items-center justify-between py-2 border-b border-gray-200">
          <span className="text-sm text-gray-600">📄 CSV元データ</span>
          <div className="text-right">
            <div className="font-medium">{csvOriginalTotal.toLocaleString()}個</div>
            <div className="text-xs text-gray-500">({csvRecordCount}行)</div>
          </div>
        </div>

        {/* マッチング結果 */}
        <div className="flex items-center justify-between py-2 border-b border-gray-200">
          <span className="text-sm text-gray-600">🎯 マッチング成功</span>
          <div className="text-right">
            <div className="font-medium text-green-600">{matchedTotal.toLocaleString()}個</div>
            <div className="text-xs text-gray-500">({productCount}品種)</div>
          </div>
        </div>

        {/* 未マッチング */}
        {unmatchedTotal > 0 && (
          <div className="flex items-center justify-between py-2 border-b border-gray-200">
            <span className="text-sm text-gray-600">❓ 未マッチング</span>
            <div className="text-right">
              <div className="font-medium text-orange-600">{unmatchedTotal.toLocaleString()}個</div>
            </div>
          </div>
        )}

        {/* 重複調整 */}
        {duplicateCount > 0 && (
          <div className="flex items-center justify-between py-2 border-b border-gray-200">
            <span className="text-sm text-gray-600">🔧 重複調整</span>
            <div className="text-right">
              <div className="font-medium text-red-600">{duplicateAdjustment > 0 ? '-' : '+'}{Math.abs(duplicateAdjustment).toLocaleString()}個</div>
              <div className="text-xs text-gray-500">({duplicateCount}商品)</div>
            </div>
          </div>
        )}

        {/* 削除分 */}
        {deletedTotal > 0 && (
          <div className="flex items-center justify-between py-2 border-b border-gray-200">
            <span className="text-sm text-gray-600">🗑️ 削除分</span>
            <div className="text-right">
              <div className="font-medium text-gray-600">-{deletedTotal.toLocaleString()}個</div>
            </div>
          </div>
        )}

        {/* 最終確定 */}
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

      {/* 整合性計算式表示 */}
      <details className="mt-4">
        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
          📊 計算式を表示
        </summary>
        <div className="mt-2 p-3 bg-white border border-gray-200 rounded text-xs text-gray-600">
          <div className="space-y-1">
            <div>CSV元データ: {csvOriginalTotal.toLocaleString()}個</div>
            <div>= マッチング成功: {matchedTotal.toLocaleString()}個</div>
            {unmatchedTotal > 0 && <div>+ 未マッチング: {unmatchedTotal.toLocaleString()}個</div>}
            {duplicateAdjustment !== 0 && (
              <div>+ 重複調整: {duplicateAdjustment > 0 ? '+' : ''}{duplicateAdjustment.toLocaleString()}個</div>
            )}
            {deletedTotal > 0 && <div>+ 削除分: {deletedTotal.toLocaleString()}個</div>}
            <div className="border-t pt-1 font-medium">
              期待値: {(csvOriginalTotal).toLocaleString()}個
            </div>
            <div className={`font-medium ${isQuantityValid ? 'text-green-600' : quality.textColor}`}>
              実際: {finalTotal.toLocaleString()}個 
              {!isQuantityValid && <span> (差分: {discrepancy > 0 ? '+' : ''}{discrepancy}個)</span>}
            </div>
          </div>
        </div>
      </details>

      {/* 品質レポート */}
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
          
          {/* 推奨対処法 */}
          <div className={`mt-2 text-xs ${quality.textColor} opacity-80`}>
            <strong>💡 推奨対処法:</strong>
            <ul className="ml-4 mt-1 space-y-1">
              {duplicateCount > 0 && (
                <li>• 重複解消モードで個別修正を確認</li>
              )}
              {unmatchedTotal > 0 && (
                <li>• 未マッチング商品の確認</li>
              )}
              <li>• 削除した商品の確認</li>
              <li>• CSV元データの再確認</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
