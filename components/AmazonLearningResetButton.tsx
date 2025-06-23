// /components/WebSalesImportButtons.tsx ver.2 (リセットボタン追加版)
"use client"

import React from "react"
import AmazonLearningResetButton from "./AmazonLearningResetButton"

interface WebSalesImportButtonsProps {
  isUploading: boolean
  onCsvClick: () => void
  onAmazonClick: () => void
  onLearningReset?: () => void
}

export default function WebSalesImportButtons({ 
  isUploading, 
  onCsvClick, 
  onAmazonClick,
  onLearningReset 
}: WebSalesImportButtonsProps) {
  return (
    <div className="space-y-3">
      {/* メインインポートボタン群 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">データ取り込み:</span>
        <button 
          onClick={onCsvClick}
          disabled={isUploading}
          className="px-3 py-1 text-xs font-semibold text-white bg-gray-600 rounded hover:bg-gray-700 disabled:opacity-50"
        >
          CSV
        </button>
        <button 
          onClick={onAmazonClick}
          disabled={isUploading}
          className="px-3 py-1 text-xs font-semibold text-white bg-orange-600 rounded hover:bg-orange-700 disabled:opacity-50"
        >
          Amazon
        </button>
        <button 
          disabled={isUploading}
          className="px-3 py-1 text-xs font-semibold text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
        >
          楽天
        </button>
        <button 
          disabled={isUploading}
          className="px-3 py-1 text-xs font-semibold text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          Yahoo
        </button>
        <button 
          disabled={isUploading}
          className="px-3 py-1 text-xs font-semibold text-white bg-cyan-600 rounded hover:bg-cyan-700 disabled:opacity-50"
        >
          メルカリ
        </button>
        <button 
          disabled={isUploading}
          className="px-3 py-1 text-xs font-semibold text-white bg-pink-600 rounded hover:bg-pink-700 disabled:opacity-50"
        >
          Qoo10
        </button>
        <button 
          disabled={isUploading}
          className="px-3 py-1 text-xs font-semibold text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
        >
          BASE
        </button>
      </div>

      {/* 学習データリセットボタン */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-700">学習データ管理:</span>
        <AmazonLearningResetButton onReset={onLearningReset} />
      </div>
    </div>
  )
}
