// ver.4 (2025-08-19 JST) - add default export
import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

interface ProductCategoryMappingModalProps {
  isOpen: boolean
  onClose: () => void
  onMappingComplete: () => void
}

interface Product {
  jan_code: number
  product_name: string
  category_id: string | null
  custom_gross_profit_rate: number | null
}

interface Category {
  category_id: string
  category_name: string
}

function ProductCategoryMappingModal({
  isOpen,
  onClose,
  onMappingComplete
}: ProductCategoryMappingModalProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedMappings, setSelectedMappings] = useState<{[key: number]: string}>({})
  const [grossProfitRates, setGrossProfitRates] = useState<{[key: number]: string}>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const supabase = createClientComponentClient()

  useEffect(() => {
    if (isOpen) {
      fetchData()
    }
  }, [isOpen])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [productsResult, categoriesResult] = await Promise.all([
        supabase.from('food_product_master').select('*').order('product_name'),
        supabase.from('food_category_master').select('*').order('display_order')
      ])

      if (productsResult.error) throw productsResult.error
      if (categoriesResult.error) throw categoriesResult.error

      setProducts(productsResult.data || [])
      setCategories(categoriesResult.data || [])

      // 既存のマッピングと粗利率を設定
      const mappings: {[key: number]: string} = {}
      const rates: {[key: number]: string} = {}
      productsResult.data?.forEach(product => {
        if (product.category_id) {
          mappings[product.jan_code] = product.category_id
        }
        if (product.custom_gross_profit_rate !== null) {
          rates[product.jan_code] = product.custom_gross_profit_rate.toString()
        }
      })
      setSelectedMappings(mappings)
      setGrossProfitRates(rates)
    } catch (error) {
      console.error('データ取得エラー:', error)
      alert('データの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleCategoryChange = (janCode: number, categoryId: string) => {
    setSelectedMappings(prev => ({
      ...prev,
      [janCode]: categoryId === 'none' ? '' : categoryId
    }))
  }

  const handleGrossProfitRateChange = (janCode: number, value: string) => {
    // 数値のみ許可（小数点含む）
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setGrossProfitRates(prev => ({
        ...prev,
        [janCode]: value
      }))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // 更新データを準備
      const updates = products.map(product => {
        const categoryId = selectedMappings[product.jan_code] || null
        const rateStr = grossProfitRates[product.jan_code]
        const rate = rateStr ? parseFloat(rateStr) : null
        
        return {
          jan_code: product.jan_code,
          category_id: categoryId,
          custom_gross_profit_rate: rate
        }
      })

      // バッチ更新
      for (const update of updates) {
        const { error } = await supabase
          .from('food_product_master')
          .update({
            category_id: update.category_id,
            custom_gross_profit_rate: update.custom_gross_profit_rate
          })
          .eq('jan_code', update.jan_code)

        if (error) throw error
      }

      alert('保存しました')
      onMappingComplete()
      onClose()
    } catch (error) {
      console.error('保存エラー:', error)
      alert('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>商品カテゴリー紐付け・粗利率設定</DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">読み込み中...</div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="max-h-[50vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white border-b">
                  <tr>
                    <th className="text-left p-2">JANコード</th>
                    <th className="text-left p-2">商品名</th>
                    <th className="text-left p-2">カテゴリー</th>
                    <th className="text-left p-2">独自粗利率(%)</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => (
                    <tr key={product.jan_code} className="border-b">
                      <td className="p-2">{product.jan_code}</td>
                      <td className="p-2">{product.product_name}</td>
                      <td className="p-2">
                        <Select
                          value={selectedMappings[product.jan_code] || 'none'}
                          onValueChange={(value) => handleCategoryChange(product.jan_code, value)}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">未分類</SelectItem>
                            {categories.map(category => (
                              <SelectItem key={category.category_id} value={category.category_id}>
                                {category.category_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Input
                          type="text"
                          placeholder="例: 35.5"
                          value={grossProfitRates[product.jan_code] || ''}
                          onChange={(e) => handleGrossProfitRateChange(product.jan_code, e.target.value)}
                          className="w-24"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={onClose}>
                キャンセル
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ver.4 (2025-08-19 JST) - add default export
export default ProductCategoryMappingModal;
export { ProductCategoryMappingModal };
