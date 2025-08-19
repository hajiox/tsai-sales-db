// /components/food-store/CategoryManagementModal.tsx ver.3 (2025-08-19 JST)
"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { Plus, Edit2, Trash2, GripVertical } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface CategoryManagementModalProps {
  isOpen: boolean
  onClose: () => void
}

function CategoryManagementModal({ isOpen, onClose }: CategoryManagementModalProps) {
  const [categories, setCategories] = useState<any[]>([])
  const [newCategoryName, setNewCategoryName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const supabase = getSupabaseBrowserClient()

  useEffect(() => {
    if (isOpen) {
      fetchCategories()
    }
  }, [isOpen])

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('food_category_master')
      .select('*')
      .order('display_order')

    if (error) {
      console.error('カテゴリー取得エラー:', error)
      return
    }

    setCategories(data || [])
  }

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return

    const { error } = await supabase
      .from('food_category_master')
      .insert([{ 
        category_name: newCategoryName.trim(),
        display_order: categories.length 
      }])

    if (error) {
      if (error.code === '23505') {
        alert('同じ名前のカテゴリーが既に存在します')
      } else {
        alert('カテゴリーの追加に失敗しました')
      }
      return
    }

    setNewCategoryName("")
    fetchCategories()
  }

  const handleUpdateCategory = async (id: string) => {
    if (!editingName.trim()) return

    const { error } = await supabase
      .from('food_category_master')
      .update({ category_name: editingName.trim() })
      .eq('category_id', id)

    if (error) {
      if (error.code === '23505') {
        alert('同じ名前のカテゴリーが既に存在します')
      } else {
        alert('カテゴリーの更新に失敗しました')
      }
      return
    }

    setEditingId(null)
    setEditingName("")
    fetchCategories()
  }

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('このカテゴリーを削除しますか？\n紐付けられている商品は「未分類」になります。')) {
      return
    }

    const { error } = await supabase
      .from('food_category_master')
      .delete()
      .eq('category_id', id)

    if (error) {
      alert('カテゴリーの削除に失敗しました')
      return
    }

    fetchCategories()
  }

  const handleUpdateOrder = async (categories: any[]) => {
    const updates = categories.map((cat, index) => ({
      category_id: cat.category_id,
      display_order: index
    }))

    const { error } = await supabase
      .from('food_category_master')
      .upsert(updates)

    if (error) {
      console.error('並び順更新エラー:', error)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>カテゴリー管理</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Input
            placeholder="新しいカテゴリー名"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}
          />
          <Button onClick={handleAddCategory}>
            <Plus className="h-4 w-4 mr-1" />
            追加
          </Button>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>カテゴリー名</TableHead>
                <TableHead className="w-32">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.category_id}>
                  <TableCell>
                    <GripVertical className="h-4 w-4 text-gray-400" />
                  </TableCell>
                  <TableCell>
                    {editingId === category.category_id ? (
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleUpdateCategory(category.category_id)}
                        onBlur={() => handleUpdateCategory(category.category_id)}
                      />
                    ) : (
                      <span>{category.category_name}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingId(category.category_id)
                          setEditingName(category.category_name)
                        }}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteCategory(category.category_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ver.2 (2025-08-19 JST) - add default export
export default CategoryManagementModal;
export { CategoryManagementModal };
