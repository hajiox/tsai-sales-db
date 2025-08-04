// /components/food-store/FoodStoreCsvImportModal.tsx ver.3 (重複除去対応版)
"use client"

import { useState, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Upload, FileText, AlertCircle } from "lucide-react"
import Papa from 'papaparse'

interface FoodStoreCsvImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete: () => void
  selectedYear: number
  selectedMonth: number
}

export function FoodStoreCsvImportModal({
  isOpen,
  onClose,
  onImportComplete,
  selectedYear,
  selectedMonth
}: FoodStoreCsvImportModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importedCount, setImportedCount] = useState(0)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setFile(file)
      setError(null)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type === 'text/csv') {
      setFile(file)
      setError(null)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }, [])

  const handleImport = async () => {
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const text = await file.text()
      
      Papa.parse(text, {
        header: true,
        encoding: 'UTF-8',
        skipEmptyLines: true,
        complete: async (results) => {
          const reportMonth = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
          const dataMap = new Map()

          // 重複を除去（後から来たデータで上書き）
          for (const row of results.data as any[]) {
            if (!row['ＪＡＮ'] || !row['商品名']) continue

            const janCode = parseInt(row['ＪＡＮ'])
            if (isNaN(janCode)) continue

            dataMap.set(janCode, {
              report_month: reportMonth,
              jan_code: janCode,
              product_name: row['商品名'] || '',
              supplier_code: parseInt(row['仕入先コード']) || null,
              supplier_name: row['仕入先名'] || null,
              department_code: parseInt(row['部門コード']) || null,
              department_name: row['部門名'] || null,
              rank: parseInt(row['順位']) || null,
              unit_price: parseInt(row['単価']) || 0,
              quantity_sold: parseInt(row['点数']) || 0,
              total_sales: parseInt(row['金額']) || 0,
              discount_amount: parseInt(row['値引金額']) || 0,
              cost_amount: parseInt(row['原価金額']) || 0,
              gross_profit: parseInt(row['粗利']) || 0,
              gross_profit_rate: parseFloat(row['粗利率']) || 0,
              composition_ratio: parseFloat(row['構成比']) || 0,
              cumulative_ratio: parseFloat(row['累計比']) || 0,
              rank_category: row['ランク'] || null
            })
          }

          const validData = Array.from(dataMap.values())

          if (validData.length === 0) {
            setError('有効なデータが見つかりませんでした')
            setLoading(false)
            return
          }

          // APIエンドポイントにデータを送信
          try {
            const response = await fetch('/api/food-store/import', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                data: validData,
                reportMonth: reportMonth
              })
            })

            const result = await response.json()

            if (!response.ok) {
              setError(result.error || 'インポートに失敗しました')
              if (result.details) {
                console.error('Import error details:', result.details)
              }
              setLoading(false)
              return
            }

            setImportedCount(result.count)
            setTimeout(() => {
              onImportComplete()
            }, 1500)
          } catch (error) {
            console.error('API Error:', error)
            setError('サーバーとの通信に失敗しました')
            setLoading(false)
          }
        },
        error: (error) => {
          setError(`CSVの解析に失敗しました: ${error.message}`)
          setLoading(false)
        }
      })
    } catch (error) {
      setError('ファイルの読み込みに失敗しました')
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{selectedYear}年{selectedMonth}月 販売データインポート</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-sm text-gray-600 mb-2">
              CSVファイルをドラッグ＆ドロップ
            </p>
            <p className="text-xs text-gray-500">または、クリックしてファイルを選択</p>
            <input
              id="file-input"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {file && (
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md">
              <FileText className="h-5 w-5 text-gray-600" />
              <span className="text-sm font-medium">{file.name}</span>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {importedCount > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {importedCount}件のデータをインポートしました
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              キャンセル
            </Button>
            <Button onClick={handleImport} disabled={!file || loading}>
              {loading ? 'インポート中...' : 'インポート'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
