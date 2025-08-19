// /components/brand-store/MasterDataModal.tsx ver.6 (2025-08-19 JST)
'use client'

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Upload, FileText, AlertCircle, Search, Package, Tag, Eye, FileUp } from "lucide-react"
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { formatCurrency } from "@/lib/utils"

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function MasterDataModal({ isOpen, onClose }: Props) {
  const [categoryFile, setCategoryFile] = useState<File | null>(null)
  const [productFile, setProductFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [categories, setCategories] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [categorySearch, setCategorySearch] = useState("")
  const [productSearch, setProductSearch] = useState("")
  const [viewMode, setViewMode] = useState<'view' | 'import'>('view')
  const [viewType, setViewType] = useState<'categories' | 'products'>('categories')
  const supabase = getSupabaseBrowserClient()

  // マスターデータを取得
  const fetchMasterData = async () => {
    try {
      const [categoriesRes, productsRes] = await Promise.all([
        supabase.from('category_master').select('*').order('category_id'),
        supabase.from('product_master').select('*, category_master(category_name)').order('product_id')
      ])

      if (categoriesRes.data) setCategories(categoriesRes.data)
      if (productsRes.data) setProducts(productsRes.data)
    } catch (error) {
      console.error('マスターデータ取得エラー:', error)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchMasterData()
    }
  }, [isOpen])

  const handleCategoryFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setCategoryFile(file)
      setError(null)
    }
  }

  const handleProductFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setProductFile(file)
      setError(null)
    }
  }

  const handleImport = async () => {
    if (!categoryFile && !productFile) {
      setError('ファイルを選択してください')
      return
    }

    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const formData = new FormData()
      if (categoryFile) formData.append('categoryMaster', categoryFile)
      if (productFile) formData.append('productMaster', productFile)

      const response = await fetch('/api/brand-store/import-masters', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'インポートに失敗しました')
      }

      setMessage('マスターデータのインポートが完了しました')
      setCategoryFile(null)
      setProductFile(null)
      
      // データを再取得
      await fetchMasterData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'インポートに失敗しました')
    } finally {
      setLoading(false)
    }
  }

  // カテゴリー検索フィルター
  const filteredCategories = categories.filter(cat => 
    cat.category_name?.toLowerCase().includes(categorySearch.toLowerCase()) ||
    cat.category_id?.toString().includes(categorySearch)
  )

  // 商品検索フィルター
  const filteredProducts = products.filter(prod => 
    prod.product_name?.toLowerCase().includes(productSearch.toLowerCase()) ||
    prod.product_id?.toString().includes(productSearch) ||
    prod.barcode?.includes(productSearch)
  )

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>マスターデータ管理</DialogTitle>
          <DialogDescription>
            カテゴリーマスターと商品マスターのデータをインポート・確認できます
          </DialogDescription>
        </DialogHeader>

        {/* モード切替ボタン */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={viewMode === 'view' ? 'default' : 'outline'}
            onClick={() => setViewMode('view')}
            size="sm"
          >
            <Eye className="h-4 w-4 mr-2" />
            マスター一覧
          </Button>
          <Button
            variant={viewMode === 'import' ? 'default' : 'outline'}
            onClick={() => setViewMode('import')}
            size="sm"
          >
            <FileUp className="h-4 w-4 mr-2" />
            インポート
          </Button>
        </div>

        {viewMode === 'view' ? (
          <div className="space-y-4">
            {/* カテゴリー/商品切替ボタン */}
            <div className="flex gap-2">
              <Button
                variant={viewType === 'categories' ? 'default' : 'outline'}
                onClick={() => setViewType('categories')}
                size="sm"
              >
                <Tag className="h-4 w-4 mr-2" />
                カテゴリー ({categories.length})
              </Button>
              <Button
                variant={viewType === 'products' ? 'default' : 'outline'}
                onClick={() => setViewType('products')}
                size="sm"
              >
                <Package className="h-4 w-4 mr-2" />
                商品 ({products.length})
              </Button>
            </div>

            {viewType === 'categories' ? (
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Search className="h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="カテゴリー検索..."
                    className="flex-1 px-3 py-2 border rounded-md"
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                  />
                </div>
                <div className="overflow-y-auto max-h-96 border rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">ID</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">カテゴリー名</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">略称</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">表示</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredCategories.map((cat) => (
                        <tr key={cat.category_id}>
                          <td className="px-4 py-2 text-sm">{cat.category_id}</td>
                          <td className="px-4 py-2 text-sm font-medium">{cat.category_name}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">{cat.category_short_name}</td>
                          <td className="px-4 py-2 text-sm">{cat.is_visible === '1' ? '表示' : '非表示'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredCategories.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      カテゴリーが見つかりません
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Search className="h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="商品名、ID、バーコードで検索..."
                    className="flex-1 px-3 py-2 border rounded-md"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                </div>
                <div className="overflow-y-auto max-h-96 border rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">ID</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">商品名</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">カテゴリー</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">価格</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">バーコード</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredProducts.map((prod) => (
                        <tr key={prod.id}>
                          <td className="px-4 py-2 text-sm">{prod.product_id}</td>
                          <td className="px-4 py-2 text-sm font-medium">{prod.product_name}</td>
                          <td className="px-4 py-2 text-sm text-gray-500">
                            {prod.category_master?.category_name || '未設定'}
                          </td>
                          <td className="px-4 py-2 text-sm text-right">
                            {prod.price ? formatCurrency(prod.price) : '-'}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-500">{prod.barcode || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredProducts.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      商品が見つかりません
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">カテゴリーマスター</h3>
              <p className="text-sm text-gray-600 mb-2">
                カテゴリーID、カテゴリー名、略称、表示/非表示の情報を含むCSVファイル
              </p>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                <label htmlFor="category-upload" className="cursor-pointer text-center block">
                  <Upload className="mx-auto h-8 w-8 text-gray-400" />
                  <span className="mt-2 block text-sm text-gray-600">
                    ファイルを選択　{categoryFile ? categoryFile.name : '選択されていません'}
                  </span>
                  <input
                    id="category-upload"
                    type="file"
                    className="sr-only"
                    accept=".csv"
                    onChange={handleCategoryFileChange}
                  />
                </label>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">商品マスター</h3>
              <p className="text-sm text-gray-600 mb-2">
                商品ID、商品名、カテゴリーID、価格、バーコードの情報を含むCSVファイル
              </p>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                <label htmlFor="product-upload" className="cursor-pointer text-center block">
                  <Upload className="mx-auto h-8 w-8 text-gray-400" />
                  <span className="mt-2 block text-sm text-gray-600">
                    ファイルを選択　{productFile ? productFile.name : '選択されていません'}
                  </span>
                  <input
                    id="product-upload"
                    type="file"
                    className="sr-only"
                    accept=".csv"
                    onChange={handleProductFileChange}
                  />
                </label>
              </div>
            </div>

            {error && (
              <div className="text-red-600 text-sm flex items-center bg-red-50 p-3 rounded">
                <AlertCircle className="h-4 w-4 mr-2" />
                {error}
              </div>
            )}

            {message && (
              <div className="text-green-600 text-sm bg-green-50 p-3 rounded">
                {message}
              </div>
            )}

            <div className="bg-yellow-50 p-3 rounded-lg">
              <p className="text-sm text-yellow-800">
                注意: 新しいデータで既存のマスターデータを更新します。削除されたデータはそのまま残ります。
              </p>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={onClose}>キャンセル</Button>
              <Button onClick={handleImport} disabled={loading || (!categoryFile && !productFile)}>
                {loading ? 'インポート中...' : 'インポート実行'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
