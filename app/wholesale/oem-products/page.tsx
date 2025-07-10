// /app/wholesale/oem-products/page.tsx ver.2 デザイン修正版
"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Trash2, Edit, Check, X, ChevronUp, ChevronDown, ArrowLeft, Plus } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { useRouter } from 'next/navigation'

interface OEMProduct {
  id: string
  product_code: string
  product_name: string
  price: number
  is_active: boolean
  display_order: number | null
}

export default function OEMProductsPage() {
  const router = useRouter()
  const [products, setProducts] = useState<OEMProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingProduct, setEditingProduct] = useState<Partial<OEMProduct>>({})
  const [isAddingNew, setIsAddingNew] = useState(false)
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
      setIsAddingNew(false)
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
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">OEM商品マスター管理</h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => router.push('/wholesale/dashboard')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              ダッシュボードに戻る
            </Button>
            <Button
              onClick={() => setIsAddingNew(true)}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              新規追加
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-4 font-medium text-gray-700">NO.</th>
                  <th className="text-left p-4 font-medium text-gray-700">商品コード</th>
                  <th className="text-left p-4 font-medium text-gray-700">商品名</th>
                  <th className="text-right p-4 font-medium text-gray-700">価格</th>
                  <th className="text-center p-4 font-medium text-gray-700">状態</th>
                  <th className="text-center p-4 font-medium text-gray-700">並び順</th>
                  <th className="text-center p-4 font-medium text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {isAddingNew && (
                  <tr className="border-b bg-blue-50">
                    <td className="p-4">新規</td>
                    <td className="p-4">
                      <Input
                        placeholder="商品コード"
                        value={newProduct.product_code}
                        onChange={(e) => setNewProduct({ ...newProduct, product_code: e.target.value })}
                        className="w-full"
                      />
                    </td>
                    <td className="p-4">
                      <Input
                        placeholder="商品名"
                        value={newProduct.product_name}
                        onChange={(e) => setNewProduct({ ...newProduct, product_name: e.target.value })}
                        className="w-full"
                      />
                    </td>
                    <td className="p-4">
                      <Input
                        type="number"
                        placeholder="価格"
                        value={newProduct.price}
                        onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                        className="w-full text-right"
                      />
                    </td>
                    <td className="p-4 text-center">-</td>
                    <td className="p-4 text-center">-</td>
                    <td className="p-4">
                      <div className="flex gap-2 justify-center">
                        <Button size="sm" onClick={handleAddProduct}>
                          保存
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            setIsAddingNew(false)
                            setNewProduct({ product_code: "", product_name: "", price: "" })
                          }}
                        >
                          キャンセル
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
                {products.map((product, index) => (
                  <tr key={product.id} className="border-b hover:bg-gray-50">
                    <td className="p-4">{index + 1}</td>
                    <td className="p-4">
                      {editingId === product.id ? (
                        <Input
                          value={editingProduct.product_code || ""}
                          onChange={(e) => setEditingProduct({ ...editingProduct, product_code: e.target.value })}
                          className="w-full"
                        />
                      ) : (
                        product.product_code
                      )}
                    </td>
                    <td className="p-4">
                      {editingId === product.id ? (
                        <Input
                          value={editingProduct.product_name || ""}
                          onChange={(e) => setEditingProduct({ ...editingProduct, product_name: e.target.value })}
                          className="w-full"
                        />
                      ) : (
                        product.product_name
                      )}
                    </td>
                    <td className="p-4 text-right">
                      {editingId === product.id ? (
                        <Input
                          type="number"
                          value={editingProduct.price || ""}
                          onChange={(e) => setEditingProduct({ ...editingProduct, price: parseInt(e.target.value) || 0 })}
                          className="w-full text-right"
                        />
                      ) : (
                        `¥${product.price.toLocaleString()}`
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        product.is_active 
                          ? "bg-green-100 text-green-700" 
                          : "bg-gray-100 text-gray-700"
                      }`}>
                        {product.is_active ? "有効" : "無効"}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-1 justify-center">
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
                    </td>
                    <td className="p-4">
                      {editingId === product.id ? (
                        <div className="flex gap-2 justify-center">
                          <Button size="icon" variant="ghost" onClick={handleSaveEdit}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={handleCancelEdit}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-2 justify-center">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {products.length === 0 && !isAddingNew && (
              <div className="text-center py-12 text-gray-500">
                商品が登録されていません
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
