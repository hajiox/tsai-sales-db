// /app/components/brand-store/BrandStoreCsvImportModal.tsx ver.3
"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Upload, FileText, CheckCircle, AlertCircle } from "lucide-react"

interface BrandStoreCsvImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete: () => void
  selectedYear: number
  selectedMonth: number
}

interface ParsedData {
  product_name: string
  category: string
  total_sales: number
  quantity_sold: number
  [key: string]: any
}

interface Summary {
  totalProducts: number
  totalSales: number
  totalQuantity: number
  categories: number
}

export function BrandStoreCsvImportModal({
  isOpen,
  onClose,
  onImportComplete,
  selectedYear,
  selectedMonth
}: BrandStoreCsvImportModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'upload' | 'preview' | 'complete'>('upload')
  const [parsedData, setParsedData] = useState<ParsedData[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile)
      setError(null)
    } else {
      setError('CSVファイルを選択してください')
    }
  }

  const handleParse = async () => {
    if (!file) return

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('selectedYear', selectedYear.toString())
      formData.append('selectedMonth', selectedMonth.toString())

      const response = await fetch('/api/brand-store/parse', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'CSVの解析に失敗しました')
      }

      setParsedData(result.data)
      setSummary(result.summary)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/brand-store/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: parsedData,
          reportMonth: `${selectedYear}年${selectedMonth}月`
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'データの保存に失敗しました')
      }

      setStep('complete')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setFile(null)
    setError(null)
    setStep('upload')
    setParsedData([])
    setSummary(null)
    onClose()
  }

  const handleComplete = () => {
    handleClose()
    onImportComplete()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            CSV読込 - {selectedYear}年{selectedMonth}月
          </DialogTitle>
          <DialogDescription>
            商品別売上データのCSVファイルをインポートします
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
              <div className="flex items-center">
                <AlertCircle className="h-4 w-4 mr-2" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {step === 'upload' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p className="text-sm text-gray-600 mb-4">
                  CSVファイルを選択してください
                </p>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="max-w-xs mx-auto"
                />
                {file && (
                  <div className="mt-4 flex items-center justify-center text-sm text-gray-600">
                    <FileText className="h-4 w-4 mr-2" />
                    {file.name}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose}>
                  キャンセル
                </Button>
                <Button 
                  onClick={handleParse} 
                  disabled={!file || loading}
                >
                  {loading ? '解析中...' : '解析'}
                </Button>
              </div>
            </div>
          )}

          {step === 'preview' && summary && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">インポート内容</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>商品数: {summary.totalProducts.toLocaleString()}件</div>
                  <div>カテゴリー数: {summary.categories}種類</div>
                  <div>総売上: ¥{summary.totalSales.toLocaleString()}</div>
                  <div>総販売数: {summary.totalQuantity.toLocaleString()}個</div>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-2">商品名</th>
                      <th className="text-left p-2">カテゴリー</th>
                      <th className="text-right p-2">販売数</th>
                      <th className="text-right p-2">売上</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 5).map((item, index) => (
                      <tr key={index} className="border-t">
                        <td className="p-2">{item.product_name}</td>
                        <td className="p-2">{item.category || '未設定'}</td>
                        <td className="p-2 text-right">
                          {item.quantity_sold.toLocaleString()}
                        </td>
                        <td className="p-2 text-right">
                          ¥{item.total_sales.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {parsedData.length > 5 && (
                      <tr className="border-t">
                        <td colSpan={4} className="p-2 text-center text-gray-500">
                          他 {parsedData.length - 5} 件
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setStep('upload')}>
                  戻る
                </Button>
                <Button 
                  onClick={handleConfirm} 
                  disabled={loading}
                >
                  {loading ? '保存中...' : '保存'}
                </Button>
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="text-center py-8">
              <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                インポート完了
              </h3>
              <p className="text-gray-600 mb-4">
                {selectedYear}年{selectedMonth}月のデータを保存しました
              </p>
              <Button onClick={handleComplete}>
                閉じる
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
