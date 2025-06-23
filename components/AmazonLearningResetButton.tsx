// /components/AmazonLearningResetButton.tsx ver.1
"use client"

import React, { useState } from "react"

interface AmazonLearningResetButtonProps {
  onReset?: () => void
}

export default function AmazonLearningResetButton({ onReset }: AmazonLearningResetButtonProps) {
  const [isResetting, setIsResetting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleReset = async () => {
    if (!showConfirm) {
      setShowConfirm(true)
      return
    }

    setIsResetting(true)
    try {
      const response = await fetch('/api/learning/amazon-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('リセットに失敗しました')
      }

      const result = await response.json()
      
      if (result.success) {
        alert(`Amazon学習データをリセットしました（削除件数: ${result.deletedCount}件）`)
        onReset?.()
        setShowConfirm(false)
      } else {
        throw new Error(result.error || 'リセットに失敗しました')
      }
    } catch (error) {
      console.error('学習データリセットエラー:', error)
      alert(`リセットに失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`)
    } finally {
      setIsResetting(false)
    }
  }

  const handleCancel = () => {
    setShowConfirm(false)
  }

  if (showConfirm) {
    return (
      <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
        <div className="text-sm text-red-700 flex-1">
          <strong>⚠️ 確認:</strong> Amazon学習データを全削除します。この操作は取り消せません。
        </div>
        <button
          onClick={handleReset}
          disabled={isResetting}
          className="px-3 py-1 text-xs font-semibold text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
        >
          {isResetting ? '削除中...' : '実行'}
        </button>
        <button
          onClick={handleCancel}
          disabled={isResetting}
          className="px-3 py-1 text-xs font-semibold text-gray-700 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
        >
          キャンセル
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={handleReset}
      disabled={isResetting}
      className="px-3 py-2 text-sm font-semibold text-red-700 bg-red-100 border border-red-300 rounded hover:bg-red-200 disabled:opacity-50"
    >
      {isResetting ? 'リセット中...' : '🔄 Amazon学習データリセット'}
    </button>
  )
}
