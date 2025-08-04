// /components/food-store/ProductCategoryMappingModal.tsx ver.4
"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import { Search, Save } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface ProductCategoryMappingModalProps {
  isOpen: boolean
  onClose: () => void
  onMappingComplete: () => void
}

interface Product {
  jan_code: number
  product_name: string
  category_id: string | null
}

interface Category {
  category_id: string
  category_name: string
}

export function ProductCategoryMappingModal({ 
  isOpen, 
  onClose, 
  onMappingComplete 
}: ProductCategoryMappingModalProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [modifiedProducts, setModifiedProducts] = useState<Map<number, string>>(new Map())
  const [loading, setLoading] = useState(false)
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
        supabase
          .from('food_product_master')
          .select('jan_code, product_name, category_id')
          .order('product_name'),
        supabase
          .from('food_category_master')
          .select('category_id, category_name')
          .order('display_order')
      ])

      if (productsResult.error) {
        console.error('Products fetch error:', productsResult.error)
      } else {
        setProducts(productsResult.data || [])
      }

      if (categoriesResult.error) {
        console.error('Categories fetch error:', categoriesResult.error)
      } else {
        setCategories(categoriesResult.data || [])
      }
    } catch (error) {
      console.error('Fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCategoryChange = (janCode: number, categoryId: string) => {
    setModifiedProducts(prev => new Map(prev).set(janCode, categoryId))
  }

  const handleSave = async () => {
    if (modifiedProducts.size === 0) return

    setLoading(true)
    const updates = Array.from(modifiedProducts.entries()).map(([jan_code, category_id]) => {
      const product = products.find(p => p.jan_code === jan_code);
      return {
        jan_code,
        product_name: product?.product_name, // ★ 既存の商品名をセット
        category_id: category_id === "null" ? null : category_id
      }
    })

    // product_nameが見つからないデータを除外（念のため）
    const validUpdates = updates.filter(u => u.product_name);
    if (validUpdates.length !== updates.length) {
      console.error("一部の商品の商品名が見つかりませんでした。");
      alert("エラー: 一部の商品の情報が不足しています。");
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase
        .from('food_product_master')
        .upsert(validUpdates, { onConflict: 'jan_code' })

      if (error) {
        alert('保存に失敗しました')
        console.error(error)
      } else {
        alert(`${validUpdates.length}件の商品カテゴリーを更新しました`)
        setModifiedProducts(new Map())
        await fetchData()
        onMappingComplete()
      }
    } catch (error) {
      console.error('Save error:', error)
      alert('保存中にエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.jan_code.toString().includes(searchTerm)
    
    if (filterCategory === "all") return matchesSearch
    if (filterCategory === "uncategorized") return matchesSearch && !product.category_id
    return matchesSearch && product.category_id === filterCategory
  })

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return "未分類"
    const category = categories.find(c => c.category_id === categoryId)
    return category?.category_name || "未分類"
  }

  const getSelectValue = (product: Product) => {
    const modifiedValue = modifiedProducts.get(product.jan_code)
    if (modifiedValue !== undefined) {
      return modifiedValue
    }
    return product.category_id || "null"
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>商品カテゴリー紐付け</DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="商品名またはJANコードで検索"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="すべて" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべて</SelectItem>
              <SelectItem value="uncategorized">未分類のみ</SelectItem>
              {categories.map(category => (
                <SelectItem key={category.category_id} value={category.category_id}>
                  {category.category_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            onClick={handleSave} 
            disabled={modifiedProducts.size === 0 || loading}
          >
            <Save className="h-4 w-4 mr-2" />
            保存 {modifiedProducts.size > 0 && `(${modifiedProducts.size}件)`}
          </Button>
        </div>

        <div className="flex-1 overflow-auto border rounded-lg">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-500">読み込み中...</div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>JANコード</TableHead>
                  <TableHead>商品名</TableHead>
                  <TableHead>現在のカテゴリー</TableHead>
                  <TableHead className="w-64">新しいカテゴリー</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map(product => {
                  const isModified = modifiedProducts.has(product.jan_code)
                  
                  return (
                    <TableRow key={product.jan_code} className={isModified ? "bg-yellow-50" : ""}>
                      <TableCell>{product.jan_code}</TableCell>
                      <TableCell>{product.product_name}</TableCell>
                      <TableCell>{getCategoryName(product.category_id)}</TableCell>
                      <TableCell>
                        <Select
                          value={getSelectValue(product)}
                          onValueChange={(value) => handleCategoryChange(product.jan_code, value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="カテゴリーを選択" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="null">未分類</SelectItem>
                            {categories.map(category => (
                              <SelectItem key={category.category_id} value={category.category_id}>
                                {category.category_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
