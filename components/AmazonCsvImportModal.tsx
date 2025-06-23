// /components/AmazonCsvImportModal.tsx ver.6 (ボタン修正版)
"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"

interface AmazonCsvImportModalProps {
  isOpen: boolean
  month: string
  onClose: () => void
  onSuccess: (results: {
    matchedResults: any[]
    unmatchedProducts: any[]
    summary: any
  }) => void
}

export default function AmazonCsvImportModal({
  isOpen,
  month,
  onClose,
  onSuccess
}: AmazonCsvImportModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type === 'text/csv') {
      setSelectedFile(file)
      setError(null)
    } else {
      setError('CSVファイルを選択してください')
      setSelectedFile(null)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('ファイルを選択してください')
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await fetch('/api/import/amazon-parse', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'アップロードに失敗しました')
      }

      const result = await response.json()
      console.log('アップロード成功:', result)
      
      onSuccess(result)
    } catch (error) {
      console.error('Upload error:', error)
      setError(error instanceof Error ? error.message : 'アップロードに失敗しました')
    } finally {
      setIsUploading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold">Amazon CSVインポート</h3>
          <p className="text-sm text-gray-600 mt-1">
            AmazonのCSVファイルを選択してアップロードしてください。商品名のマッチング確認画面を経由してAmazon列のみを更新します。
          </p>
        </div>

        <div className="p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Amazon CSVファイル:</label>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              disabled={isUploading}
            />
            {selectedFile && (
              <p className="text-xs text-green-600 mt-1">
                選択済み: {selectedFile.name}
              </p>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        <div className="border-t bg-gray-50 p-6">
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
              className={`px-4 py-2 text-sm text-white rounded disabled:opacity-50 transition-colors ${
                isUploading 
                  ? 'bg-blue-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isUploading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
                  解析中...
                </span>
              ) : (
                '次へ（確認画面）'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
