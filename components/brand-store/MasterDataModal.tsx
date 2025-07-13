// /app/components/brand-store/MasterDataModal.tsx ver.2
"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Upload, FileText, CheckCircle, AlertCircle, Database } from "lucide-react"

interface MasterDataModalProps {
  isOpen: boolean
  onClose: () => void
}

export function MasterDataModal({ isOpen, onClose }: MasterDataModalProps) {
  const [categoryFile, setCategoryFile] = useState<File | null>(null)
  const [productFile, setProductFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleCategoryFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type === 'text/csv') {
      setCategoryFile(file)
      setError(null)
    } else {
      setError('カテゴリーマスターはCSVファイルを選択してください')
    }
  }

  const handleProductFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type === 'text/csv') {
      setProductFile(file)
      setError(null)
    } else {
      setError('商品マスターはCSVファイルを選択してください')
    }
  }

  const handleImport = async () => {
    if (!categoryFile && !productFile) {
      setError('少なくとも1つのファイルを選択してください')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const formData = new FormData()
      if (categoryFile) formData.append('categoryFile', categoryFile)
      if (productFile) formData.append('productFile', productFile)

      const response = await fetch('/api/brand-store/import-masters', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'インポートに失敗しました')
      }

      let message = 'インポートが完了しました: '
      if (result.categoryCount > 0) {
        message += `カテゴリー ${result.categoryCount}件`
      }
      if (result.productCount > 0) {
        if (result.categoryCount > 0) message += ', '
        message += `商品 ${result.productCount}件`
      }

      setSuccess(message)
      setCategoryFile(null)
      setProductFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setCategoryFile(null)
    setProductFile(null)
    setError(null)
    setSuccess(null)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            マスターデータ管理
          </DialogTitle>
          <DialogDescription>
            カテゴリーマスターと商品マスターのデータをインポートします
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

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded">
              <div className="flex items-center">
                <CheckCircle className="h-4 w-4 mr-2" />
                <span>{success}</span>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {/* カテゴリーマスター */}
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-2">カテゴリーマスター</h3>
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  カテゴリーID、カテゴリー名、略称、表示/非表示の情報を含むCSVファイル
                </p>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={handleCategoryFileChange}
                  disabled={loading}
                />
                {categoryFile && (
                  <div className="flex items-center text-sm text-gray-600">
                    <FileText className="h-4 w-4 mr-2" />
                    {categoryFile.name}
                  </div>
                )}
              </div>
            </div>

            {/* 商品マスター */}
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-2">商品マスター</h3>
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  商品ID、商品名、カテゴリーID、価格、バーコードの情報を含むCSVファイル
                </p>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={handleProductFileChange}
                  disabled={loading}
                />
                {productFile && (
                  <div className="flex items-center text-sm text-gray-600">
                    <FileText className="h-4 w-4 mr-2" />
                    {productFile.name}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded">
              <div className="flex items-center">
                <AlertCircle className="h-4 w-4 mr-2" />
                <span>注意: インポートを実行すると、既存のマスターデータは削除され、新しいデータで置き換えられます。</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose} disabled={loading}>
              キャンセル
            </Button>
            <Button onClick={handleImport} disabled={loading || (!categoryFile && !productFile)}>
              {loading ? 'インポート中...' : 'インポート実行'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
