// /components/food-store/ProductCategoryMappingModal.tsx ver.3
'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface ProductCategoryMappingModalProps {
  isOpen: boolean
  onClose: () => void
  janCode: string
  productName: string
  currentCategoryId?: string | null
  onUpdate: () => void
}

interface Category {
  category_id: string
  category_name: string
  display_order: number
}

export function ProductCategoryMappingModal({
  isOpen,
  onClose,
  janCode,
  productName,
  currentCategoryId,
  onUpdate
}: ProductCategoryMappingModalProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      fetchCategories()
      setSelectedCategoryId(currentCategoryId || '')
    }
  }, [isOpen, currentCategoryId])

  const fetchCategories = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/food-store/categories')
      
      if (!response.ok) {
        throw new Error('カテゴリーの取得に失敗しました')
      }
      
      const data = await response.json()
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
      
      const response = await fetch('/api/food-store/products/category', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          janCode: parseInt(janCode),
          productName,
          categoryId: selectedCategoryId || null
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'カテゴリーの更新に失敗しました')
      }

      onUpdate()
      onClose()
    } catch (error) {
      console.error('Error updating product category:', error)
      alert(error instanceof Error ? error.message : 'カテゴリーの更新に失敗しました')
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
