// /app/wholesale/products/page.tsx ver.1 (商品マスタ管理画面)
"use client"

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, Plus, Pencil, Trash2, Search, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Product {
  id: string;
  product_code: string;
  product_name: string;
  price: number;
  is_active: boolean;
  created_at: string;
}

export default function ProductManagement() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    product_code: '',
    product_name: '',
    price: ''
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await fetch('/api/wholesale/products');
      const data = await response.json();
      if (data.success) {
        setProducts(data.products);
      }
    } catch (error) {
      console.error('商品取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setFormData({ product_code: '', product_name: '', price: '' });
    setIsAddDialogOpen(true);
  };

  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setFormData({
      product_code: product.product_code,
      product_name: product.product_name,
      price: product.price.toString()
    });
    setIsEditDialogOpen(true);
  };

  const handleDelete = (product: Product) => {
    setSelectedProduct(product);
    setIsDeleteDialogOpen(true);
  };

  const handleSubmitAdd = async () => {
    try {
      const response = await fetch('/api/wholesale/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          price: parseInt(formData.price)
        })
      });

      const data = await response.json();
      if (data.success) {
        await fetchProducts();
        setIsAddDialogOpen(false);
      } else {
        alert('エラー: ' + data.error);
      }
    } catch (error) {
      console.error('商品追加エラー:', error);
      alert('商品の追加に失敗しました');
    }
  };

  const handleSubmitEdit = async () => {
    if (!selectedProduct) return;

    try {
      const response = await fetch('/api/wholesale/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedProduct.id,
          ...formData,
          price: parseInt(formData.price)
        })
      });

      const data = await response.json();
      if (data.success) {
        await fetchProducts();
        setIsEditDialogOpen(false);
      } else {
        alert('エラー: ' + data.error);
      }
    } catch (error) {
      console.error('商品更新エラー:', error);
      alert('商品の更新に失敗しました');
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedProduct) return;

    try {
      const response = await fetch('/api/wholesale/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedProduct.id })
      });

      const data = await response.json();
      if (data.success) {
        await fetchProducts();
        setIsDeleteDialogOpen(false);
      } else {
        alert('エラー: ' + data.error);
      }
    } catch (error) {
      console.error('商品削除エラー:', error);
      alert('商品の削除に失敗しました');
    }
  };

  const filteredProducts = products.filter(product =>
    product.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.product_code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* ヘッダー */}
      <div className="bg-white shadow-sm border-b flex-shrink-0">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/wholesale/dashboard')}
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                戻る
              </Button>
              <h1 className="text-xl font-bold text-gray-900">商品マスタ管理</h1>
            </div>
            <Button onClick={handleAdd} size="sm" className="gap-1">
              <Plus className="w-4 h-4" />
              新規登録
            </Button>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* 検索バー */}
          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  type="text"
                  placeholder="商品名または商品コードで検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          {/* 商品一覧 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="w-5 h-5" />
                商品一覧 ({filteredProducts.length}件)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-3 font-medium">商品コード</th>
                      <th className="text-left p-3 font-medium">商品名</th>
                      <th className="text-right p-3 font-medium">卸価格</th>
                      <th className="text-center p-3 font-medium">状態</th>
                      <th className="text-center p-3 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-gray-500">
                          読み込み中...
                        </td>
                      </tr>
                    ) : filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-gray-500">
                          商品が見つかりません
                        </td>
                      </tr>
                    ) : (
                      filteredProducts.map((product) => (
                        <tr key={product.id} className="border-b hover:bg-gray-50">
                          <td className="p-3">{product.product_code}</td>
                          <td className="p-3">{product.product_name}</td>
                          <td className="p-3 text-right">¥{product.price.toLocaleString()}</td>
                          <td className="p-3 text-center">
                            <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                              product.is_active 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {product.is_active ? '有効' : '無効'}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex justify-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEdit(product)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(product)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 新規登録ダイアログ */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>商品の新規登録</DialogTitle>
            <DialogDescription>
              新しい商品を登録します。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="code">商品コード</Label>
              <Input
                id="code"
                value={formData.product_code}
                onChange={(e) => setFormData({...formData, product_code: e.target.value})}
                placeholder="例: ABC001"
              />
            </div>
            <div>
              <Label htmlFor="name">商品名</Label>
              <Input
                id="name"
                value={formData.product_name}
                onChange={(e) => setFormData({...formData, product_name: e.target.value})}
                placeholder="例: サンプル商品"
              />
            </div>
            <div>
              <Label htmlFor="price">卸価格</Label>
              <Input
                id="price"
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({...formData, price: e.target.value})}
                placeholder="例: 1000"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleSubmitAdd}>登録</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 編集ダイアログ */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>商品の編集</DialogTitle>
            <DialogDescription>
              商品情報を編集します。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-code">商品コード</Label>
              <Input
                id="edit-code"
                value={formData.product_code}
                onChange={(e) => setFormData({...formData, product_code: e.target.value})}
              />
            </div>
            <div>
              <Label htmlFor="edit-name">商品名</Label>
              <Input
                id="edit-name"
                value={formData.product_name}
                onChange={(e) => setFormData({...formData, product_name: e.target.value})}
              />
            </div>
            <div>
              <Label htmlFor="edit-price">卸価格</Label>
              <Input
                id="edit-price"
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({...formData, price: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleSubmitEdit}>更新</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>商品の削除</AlertDialogTitle>
            <AlertDialogDescription>
              「{selectedProduct?.product_name}」を削除してもよろしいですか？
              この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700">
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
