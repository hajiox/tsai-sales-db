// /components/food-store/ProductCategoryMappingModal.tsx ver.3
'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/utils/supabase/client'
import { Database } from '@/types/supabase'

type FoodProductMaster = Database['public']['Tables']['food_product_master']['Row']
type FoodCategoryMaster = Database['public']['Tables']['food_category_master']['Row']

interface ProductCategoryMappingModalProps {
  isOpen: boolean
  onClose: () => void
  janCode: string
  productName: string
  currentCategoryId?: string | null
  onUpdate: () => void
}

export function ProductCategoryMappingModal({
  isOpen,
  onClose,
  janCode,
  productName,
  currentCategoryId,
  onUpdate
}: ProductCategoryMappingModalProps) {
  const [categories, setCategories] = useState<FoodCategoryMaster[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    if (isOpen) {
      fetchCategories()
      setSelectedCategoryId(currentCategoryId || '')
    }
  }, [isOpen, currentCategoryId])

  const fetchCategories = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('food_category_master')
        .select('*')
        .order('display_order')
        .order('category_name')

      if (error) throw error
      setCategories(data || [])
    } catch (error) {
      console.error('Error fetching categories:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      
      // まず商品が存在するか確認
      const { data: existingProduct } = await supabase
        .from('food_product_master')
        .select('*')
        .eq('jan_code', janCode)
        .single()

      if (existingProduct) {
        // 既存の商品を更新
        const { error: updateError } = await supabase
          .from('food_product_master')
          .update({ 
            category_id: selectedCategoryId || null,
            updated_at: new Date().toISOString()
          })
          .eq('jan_code', janCode)

        if (updateError) throw updateError
      } else {
        // 新規商品として挿入
        const { error: insertError } = await supabase
          .from('food_product_master')
          .insert({
            jan_code: parseInt(janCode),
            product_name: productName,
            category_id: selectedCategoryId || null
          })

        if (insertError) throw insertError
      }

      onUpdate()
      onClose()
    } catch (error) {
      console.error('Error updating product category:', error)
      alert('カテゴリーの更新に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>商品カテゴリー紐付け</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">商品名</label>
            <p className="text-sm text-gray-600">{productName}</p>
          </div>
          <div>
            <label className="text-sm font-medium">JANコード</label>
            <p className="text-sm text-gray-600">{janCode}</p>
          </div>
          <div>
            <label className="text-sm font-medium">カテゴリー</label>
            {loading ? (
              <p className="text-sm text-gray-500">読み込み中...</p>
            ) : (
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="カテゴリーを選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">未分類</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.category_id} value={category.category_id}>
                      {category.category_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={onClose}>
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={loading || saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
