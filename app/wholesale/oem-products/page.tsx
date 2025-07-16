// /app/wholesale/oem-products/page.tsx ver.5 Suspense対応版
"use client"

import { useState, useEffect, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Package, Plus, ChevronLeft, ChevronUp, ChevronDown, Edit2, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

interface OEMProduct {
  id: string;
  product_code: string;
  product_name: string;
  price: number;
  is_active: boolean;
  display_order: number;
}

// メインコンポーネントを分離
function OEMProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<OEMProduct[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [loading, setLoading] = useState(true);

  // URLパラメータから年月を取得
  const year = searchParams.get('year');
  const month = searchParams.get('month');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await fetch('/api/wholesale/oem-products');
      if (!response.ok) throw new Error('Failed to fetch products');
      const data = await response.json();
      setProducts(data);
    } catch (error) {
      console.error('商品データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProduct = async () => {
    if (!newProductName || !newProductPrice) return;

    try {
      const response = await fetch('/api/wholesale/oem-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: newProductName,
          price: parseInt(newProductPrice)
        })
      });
      
      if (!response.ok) throw new Error('Failed to add product');
      
      await fetchProducts();
      setNewProductName('');
      setNewProductPrice('');
      setShowNewForm(false);
    } catch (error) {
      console.error('商品追加エラー:', error);
    }
  };

  const handleUpdateProduct = async (productId: string) => {
    if (!editName || !editPrice) return;

    try {
      const response = await fetch(`/api/wholesale/oem-products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: editName,
          price: parseInt(editPrice),
          is_active: products.find(p => p.id === productId)?.is_active || true
        })
      });
      
      if (!response.ok) throw new Error('Failed to update product');
      
      await fetchProducts();
      setEditingProduct(null);
    } catch (error) {
      console.error('商品更新エラー:', error);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('この商品を削除しますか？\n関連する売上データも削除されます。')) return;

    try {
      const response = await fetch(`/api/wholesale/oem-products/${productId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Failed to delete product');
      
      await fetchProducts();
    } catch (error) {
      console.error('商品削除エラー:', error);
    }
  };

  const handleToggleActive = async (product: OEMProduct) => {
    try {
      const response = await fetch(`/api/wholesale/oem-products/${product.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: product.product_name,
          price: product.price,
          is_active: !product.is_active
        })
      });
      
      if (!response.ok) throw new Error('Failed to toggle active');
      
      await fetchProducts();
    } catch (error) {
      console.error('状態切替エラー:', error);
    }
  };

  const handleChangeOrder = async (productId: string, direction: 'up' | 'down') => {
    try {
      const response = await fetch(`/api/wholesale/oem-products/${productId}/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction })
      });
      
      if (!response.ok) throw new Error('Failed to change order');
      
      await fetchProducts();
    } catch (error) {
      console.error('並び順変更エラー:', error);
    }
  };

  // ダッシュボードに戻る際に年月パラメータを保持
  const handleBackToDashboard = () => {
    if (year && month) {
      router.push(`/wholesale/dashboard?year=${year}&month=${month}`);
    } else {
      router.push('/wholesale/dashboard');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={handleBackToDashboard}
          className="flex items-center gap-2 mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          ダッシュボードに戻る
        </Button>
        
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package className="w-6 h-6" />
          OEM商品マスター管理
        </h1>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>OEM商品一覧</CardTitle>
          <Button onClick={() => setShowNewForm(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            新規追加
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">NO.</TableHead>
                <TableHead className="w-32">商品コード</TableHead>
                <TableHead>商品名</TableHead>
                <TableHead className="w-32 text-right">価格</TableHead>
                <TableHead className="w-24 text-center">状態</TableHead>
                <TableHead className="w-24 text-center">並び順</TableHead>
                <TableHead className="w-32 text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {showNewForm && (
                <TableRow className="bg-blue-50">
                  <TableCell>新規</TableCell>
                  <TableCell className="font-mono text-gray-500">自動採番</TableCell>
                  <TableCell>
                    <Input
                      value={newProductName}
                      onChange={(e) => setNewProductName(e.target.value)}
                      placeholder="商品名"
                      className="w-full"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={newProductPrice}
                      onChange={(e) => setNewProductPrice(e.target.value)}
                      placeholder="価格"
                      className="w-32 text-right"
                    />
                  </TableCell>
                  <TableCell className="text-center">-</TableCell>
                  <TableCell className="text-center">-</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Button size="sm" onClick={handleAddProduct}>保存</Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          setShowNewForm(false);
                          setNewProductName('');
                          setNewProductPrice('');
                        }}
                      >
                        キャンセル
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              
              {products.map((product, index) => (
                <TableRow key={product.id} className={product.is_active ? '' : 'opacity-50'}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell className="font-mono">{product.product_code}</TableCell>
                  <TableCell>
                    {editingProduct === product.id ? (
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full"
                      />
                    ) : (
                      product.product_name
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {editingProduct === product.id ? (
                      <Input
                        type="number"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        className="w-32 text-right"
                      />
                    ) : (
                      `¥${product.price.toLocaleString()}`
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={`text-xs px-2 py-1 rounded ${product.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                      {product.is_active ? '有効' : '無効'}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleChangeOrder(product.id, 'up')}
                        disabled={index === 0}
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleChangeOrder(product.id, 'down')}
                        disabled={index === products.length - 1}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {editingProduct === product.id ? (
                      <div className="flex items-center justify-center gap-2">
                        <Button size="sm" onClick={() => handleUpdateProduct(product.id)}>保存</Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setEditingProduct(null)}
                        >
                          キャンセル
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingProduct(product.id);
                            setEditName(product.product_name);
                            setEditPrice(product.price.toString());
                          }}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteProduct(product.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              
              {products.length === 0 && !showNewForm && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                    商品データがありません
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          
          {products.length > 0 && (
            <div className="mt-4 text-sm text-red-600 flex items-center gap-2">
              <span className="inline-block w-4 h-4 bg-red-100 rounded-full flex items-center justify-center text-xs">!</span>
              すべての項目を入力してください
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Suspenseでラップしたメインコンポーネント
export default function OEMProductsPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">読み込み中...</p>
        </div>
      </div>
    }>
      <OEMProductsContent />
    </Suspense>
  );
}
