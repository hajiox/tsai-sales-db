// /app/components/brand-store/BrandStoreCsvImportModal.tsx ver.4 (自動登録結果表示版)
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Upload, FileText, CheckCircle, AlertCircle } from "lucide-react"
import Papa from "papaparse"

interface Props {
  isOpen: boolean
  onClose: () => void
  onImportComplete: () => void
  selectedYear: number
  selectedMonth: number
}

export function BrandStoreCsvImportModal({ isOpen, onClose, onImportComplete, selectedYear, selectedMonth }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [parsedData, setParsedData] = useState<any>(null)
  const [importResult, setImportResult] = useState<any>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setError(null)
    }
  }

  const handleParse = async () => {
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('year', selectedYear.toString())
      formData.append('month', selectedMonth.toString())

      const response = await fetch('/api/brand-store/parse', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '解析に失敗しました')
      }

      setParsedData(result)
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!parsedData) return

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/brand-store/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: parsedData.data,
          selectedYear,
          selectedMonth
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || '保存に失敗しました')
      }

      setImportResult(result)
      setStep(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setFile(null)
    setStep(1)
    setError(null)
    setParsedData(null)
    setImportResult(null)
    onClose()
  }

  const handleComplete = () => {
    handleClose()
    onImportComplete()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>商品別売上CSV読込</DialogTitle>
          <DialogDescription>
            {selectedYear}年{selectedMonth}月の売上データをインポートします
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <div className="mt-2">
                <label htmlFor="file-upload" className="cursor-pointer">
                  <span className="text-blue-600 hover:text-blue-500">CSVファイルを選択</span>
                  <input
                    id="file-upload"
                    type="file"
                    className="sr-only"
                    accept=".csv"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
              {file && (
                <div className="mt-2 flex items-center justify-center text-sm text-gray-600">
                  <FileText className="h-4 w-4 mr-1" />
                  {file.name}
                </div>
              )}
            </div>
            {error && (
              <div className="text-red-600 text-sm flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {error}
              </div>
            )}
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={handleClose}>キャンセル</Button>
              <Button onClick={handleParse} disabled={!file || loading}>
                {loading ? '解析中...' : '解析'}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && parsedData && (
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold mb-2">解析結果</h3>
              <div className="space-y-1 text-sm">
                <p>総レコード数: {parsedData.summary.totalRows}</p>
                <p>総売上金額: {parsedData.summary.totalSales.toLocaleString()}円</p>
              </div>
            </div>
            {error && (
              <div className="text-red-600 text-sm flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {error}
              </div>
            )}
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setStep(1)}>戻る</Button>
              <Button onClick={handleConfirm} disabled={loading}>
                {loading ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && importResult && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <h3 className="mt-2 text-lg font-semibold">インポート完了</h3>
              <p className="mt-1 text-sm text-gray-600">
                {importResult.message}
              </p>
              {(importResult.newProductsCount > 0 || importResult.newCategoriesCount > 0) && (
                <div className="mt-4 bg-blue-50 p-3 rounded-lg text-sm">
                  <p className="font-semibold text-blue-900">自動登録情報</p>
                  {importResult.newProductsCount > 0 && (
                    <p className="text-blue-700">新商品: {importResult.newProductsCount}件</p>
                  )}
                  {importResult.newCategoriesCount > 0 && (
                    <p className="text-blue-700">新カテゴリー: {importResult.newCategoriesCount}件</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-center">
              <Button onClick={handleComplete}>完了</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
