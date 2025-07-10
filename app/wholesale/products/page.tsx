// /app/wholesale/products/page.tsx ver.2 (完全版商品マスター管理)
"use client"

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Edit2, Trash2, Save, X, ArrowUp, ArrowDown } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Product {
  id: string;
  product_code: string;
  product_name: string;
  price: number;
  is_active: boolean;
  display_order: number;
  created_at?: string;
  updated_at?: string;
}

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    product_code: '',
    product_name: '',
    price: 0,
    is_active: true
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await fetch('/api/wholesale/products');
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.products)) {
          setProducts(data.products);
        }
      }
    } catch (error) {
      console.error('商品データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setIsAdding(true);
    setFormData({
      product_code: '',
      product_name: '',
      price: 0,
      is_active: true
    });
  };

  const handleEdit = (product: Product) => {
    setEditingId(product.id);
    setFormData({
      product_code: product.product_code,
      product_name: product.product_name,
      price: product.price,
      is_active: product.is_active
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setIsAdding(false);
    setFormData({
      product_code: '',
      product_name: '',
      price: 0,
      is_active: true
    });
  };

  const handleSave = async () => {
    try {
      if (isAdding) {
        // 新規追加
        const maxOrder = Math.max(...products.map(p => p.display_order || 0), 0);
        const response = await fetch('/api/wholesale/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formData,
            display_order: maxOrder + 1
          })
        });

        if (response.ok) {
          await fetchProducts();
          setIsAdding(false);
          handleCancel();
        } else {
          const error = await response.json();
          alert(`エラー: ${error.error}`);
        }
      } else if (editingId) {
        // 更新
        const response = await fetch(`/api/wholesale/products/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });

        if (response.ok) {
          await fetchProducts();
          handleCancel();
        } else {
          const error = await response.json();
          alert(`エラー: ${error.error}`);
        }
      }
    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存中にエラーが発生しました。');
    }
  };

  const handleDelete = async (id: string, productName: string) => {
    if (!confirm(`商品「${productName}」を削除しますか？\n\n※この商品の売上データも全て削除されます。`)) {
      return;
    }

    try {
      const response = await fetch(`/api/wholesale/products/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await fetchProducts();
      } else {
        const error = await response.json();
        alert(`エラー: ${error.error}`);
      }
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除中にエラーが発生しました。');
    }
  };

  const handleOrderChange = async (id: string, direction: 'up' | 'down') => {
    try {
      const response = await fetch(`/api/wholesale/products/${id}/order`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction })
      });

      if (response.ok) {
        await fetchProducts();
      }
    } catch (error) {
      console.error('並び順変更エラー:', error);
    }
  };

  const renderProductRow = (product: Product, index: number) => {
    const isEditing = editingId === product.id;

    if (isEditing) {
      return (
        <tr key={product.id} className="border-b hover:bg-gray-50">
          <td className="p-2 text-center text-gray-500">{index + 1}</td>
          <td className="p-2">
            <Input
              value={formData.product_code}
              onChange={(e) => setFormData({ ...formData, product_code: e.target.value })}
              className="h-8 text-sm"
            />
          </td>
          <td className="p-2">
            <Input
              value={formData.product_name}
              onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
              className="h-8 text-sm"
            />
          </td>
          <td className="p-2">
            <Input
              type="number"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
              className="h-8 text-sm w-24"
            />
          </td>
          <td className="p-2 text-center">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="h-4 w-4"
            />
          </td>
          <td className="p-2">
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled>
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
          </td>
          <td className="p-2">
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2"
                onClick={handleSave}
              >
                <Save className="h-4 w-4 mr-1" />
                保存
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2"
                onClick={handleCancel}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </td>
        </tr>
      );
    }

    return (
      <tr key={product.id} className="border-b hover:bg-gray-50">
        <td className="p-2 text-center text-gray-500">{index + 1}</td>
        <td className="p-2 text-sm">{product.product_code}</td>
        <td className="p-2 text-sm font-medium">{product.product_name}</td>
        <td className="p-2 text-sm text-right">¥{product.price.toLocaleString()}</td>
        <td className="p-2 text-center">
          <span className={`text-xs px-2 py-1 rounded ${product.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {product.is_active ? '有効' : '無効'}
          </span>
        </td>
        <td className="p-2">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => handleOrderChange(product.id, 'up')}
              disabled={index === 0}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => handleOrderChange(product.id, 'down')}
              disabled={index === products.length - 1}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </div>
        </td>
        <td className="p-2">
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => handleEdit(product)}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
              onClick={() => handleDelete(product.id, product.product_name)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </td>
      </tr>
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen"><p>読み込み中...</p></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">商品マスター管理</h1>
        <div className="flex gap-2">
          <Button onClick={() => router.push('/wholesale/dashboard')}>
            ダッシュボードに戻る
          </Button>
          <Button onClick={handleAdd} disabled={isAdding}>
            <Plus className="h-4 w-4 mr-2" />
            新規追加
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No.</th>
                <th className="p-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">商品コード</th>
                <th className="p-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">商品名</th>
                <th className="p-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">価格</th>
                <th className="p-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">状態</th>
                <th className="p-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">並び順</th>
                <th className="p-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody>
              {isAdding && (
                <tr className="border-b bg-blue-50">
                  <td className="p-2 text-center text-gray-500">新規</td>
                  <td className="p-2">
                    <Input
                      value={formData.product_code}
                      onChange={(e) => setFormData({ ...formData, product_code: e.target.value })}
                      className="h-8 text-sm"
                      placeholder="商品コード"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={formData.product_name}
                      onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                      className="h-8 text-sm"
                      placeholder="商品名"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="number"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                      className="h-8 text-sm w-24"
                      placeholder="価格"
                    />
                  </td>
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="p-2">-</td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 px-2"
                        onClick={handleSave}
                      >
                        <Save className="h-4 w-4 mr-1" />
                        保存
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2"
                        onClick={handleCancel}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
              {products.map((product, index) => renderProductRow(product, index))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
