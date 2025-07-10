// /app/wholesale/oem-products/page.tsx ver.1 OEM商品マスター管理
"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Trash2, Edit, Check, X, ChevronUp, ChevronDown } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"

interface OEMProduct {
  id: string
  product_code: string
  product_name: string
  price: number
  is_active: boolean
  display_order: number | null
}

export default function OEMProductsPage() {
  const [products, setProducts] = useState<OEMProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingProduct, setEditingProduct] = useState<Partial<OEMProduct>>({})
  const [newProduct, setNewProduct] = useState({
    product_code: "",
    product_name: "",
    price: ""
  })

  useEffect(() => {
    fetchProducts()
  }, [])

  const fetchProducts = async () => {
    try {
      const response = await fetch("/api/wholesale/oem-products")
      if (!response.ok) throw new Error("商品データの取得に失敗しました")
      const data = await response.json()
      setProducts(data)
    } catch (error) {
      console.error("Error:", error)
      toast.error("商品データの読み込みに失敗しました")
    } finally {
      setLoading(false)
    }
  }

  const handleAddProduct = async () => {
    if (!newProduct.product_code || !newProduct.product_name || !newProduct.price) {
      toast.error("すべての項目を入力してください")
      return
    }

    try {
      const response = await fetch("/api/wholesale/oem-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newProduct,
          price: parseInt(newProduct.price)
        })
      })

      if (!response.ok) throw new Error("商品の追加に失敗しました")

      toast.success("商品を追加しました")
      setNewProduct({ product_code: "", product_name: "", price: "" })
      fetchProducts()
    } catch (error) {
      console.error("Error:", error)
      toast.error("商品の追加に失敗しました")
    }
  }

  const handleEdit = (product: OEMProduct) => {
    setEditingId(product.id)
    setEditingProduct({
      product_code: product.product_code,
      product_name: product.product_name,
      price: product.price
    })
  }

  const handleSaveEdit = async () => {
    if (!editingId) return

    try {
      const response = await fetch(`/api/wholesale/oem-products/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingProduct)
      })

      if (!response.ok) throw new Error("商品の更新に失敗しました")

      toast.success("商品を更新しました")
      setEditingId(null)
      fetchProducts()
    } catch (error) {
      console.error("Error:", error)
      toast.error("商品の更新に失敗しました")
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingProduct({})
  }

  const handleDelete = async (id: string, productName: string) => {
    if (!confirm(`「${productName}」を削除しますか？\n関連する売上データも削除されます。`)) {
      return
    }

    try {
      const response = await fetch(`/api/wholesale/oem-products/${id}`, {
        method: "DELETE"
      })

      if (!response.ok) throw new Error("商品の削除に失敗しました")

      toast.success("商品を削除しました")
      fetchProducts()
    } catch (error) {
      console.error("Error:", error)
      toast.error("商品の削除に失敗しました")
    }
  }

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/wholesale/oem-products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !currentStatus })
      })

      if (!response.ok) throw new Error("ステータスの更新に失敗しました")

      toast.success("ステータスを更新しました")
      fetchProducts()
    } catch (error) {
      console.error("Error:", error)
      toast.error("ステータスの更新に失敗しました")
    }
  }

  const handleOrderChange = async (id: string, direction: "up" | "down") => {
    try {
      const response = await fetch(`/api/wholesale/oem-products/${id}/order`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction })
      })

      if (!response.ok) throw new Error("並び順の変更に失敗しました")

      fetchProducts()
    } catch (error) {
      console.error("Error:", error)
      toast.error("並び順の変更に失敗しました")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>OEM商品マスター管理</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 新規商品追加フォーム */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <h3 className="font-semibold mb-3">新規商品追加</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Input
                placeholder="商品コード"
                value={newProduct.product_code}
                onChange={(e) => setNewProduct({ ...newProduct, product_code: e.target.value })}
              />
              <Input
                placeholder="商品名"
                value={newProduct.product_name}
                onChange={(e) => setNewProduct({ ...newProduct, product_name: e.target.value })}
              />
              <Input
                type="number"
                placeholder="価格"
                value={newProduct.price}
                onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
              />
              <Button onClick={handleAddProduct}>追加</Button>
            </div>
          </div>

          {/* 商品一覧テーブル */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">順序</TableHead>
                <TableHead>商品コード</TableHead>
                <TableHead>商品名</TableHead>
                <TableHead className="text-right">価格</TableHead>
                <TableHead className="text-center">有効</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product, index) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => handleOrderChange(product.id, "up")}
                        disabled={index === 0}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => handleOrderChange(product.id, "down")}
                        disabled={index === products.length - 1}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    {editingId === product.id ? (
                      <Input
                        value={editingProduct.product_code || ""}
                        onChange={(e) => setEditingProduct({ ...editingProduct, product_code: e.target.value })}
                        className="w-32"
                      />
                    ) : (
                      product.product_code
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === product.id ? (
                      <Input
                        value={editingProduct.product_name || ""}
                        onChange={(e) => setEditingProduct({ ...editingProduct, product_name: e.target.value })}
                      />
                    ) : (
                      product.product_name
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {editingId === product.id ? (
                      <Input
                        type="number"
                        value={editingProduct.price || ""}
                        onChange={(e) => setEditingProduct({ ...editingProduct, price: parseInt(e.target.value) || 0 })}
                        className="w-24 text-right"
                      />
                    ) : (
                      `¥${product.price.toLocaleString()}`
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={product.is_active}
                      onCheckedChange={() => handleToggleActive(product.id, product.is_active)}
                      disabled={editingId === product.id}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {editingId === product.id ? (
                      <div className="flex gap-2 justify-end">
                        <Button size="icon" variant="ghost" onClick={handleSaveEdit}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={handleCancelEdit}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(product)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(product.id, product.product_name)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {products.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              商品が登録されていません
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
