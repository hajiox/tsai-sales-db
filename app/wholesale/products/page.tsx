// /app/wholesale/products/page.tsx ver.3 利益率対応版
"use client"

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { ArrowUpDown, Pencil, Trash2, Save, X, Plus } from 'lucide-react';
import Link from 'next/link';

interface Product {
  id: string;
  product_code: string;
  product_name: string;
  price: number;
  profit_rate: number;
  is_active: boolean;
  display_order: number;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    product_code: '',
    product_name: '',
    price: '',
    profit_rate: ''
  });
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState({
    product_code: '',
    product_name: '',
    price: '',
    profit_rate: '20.00'
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
      console.error('商品データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (product: Product) => {
    setEditingId(product.id);
    setEditForm({
      product_code: product.product_code,
      product_name: product.product_name,
      price: product.price.toString(),
      profit_rate: product.profit_rate.toString()
    });
  };

  const handleSave = async () => {
    if (!editingId) return;

    try {
      const response = await fetch('/api/wholesale/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId,
          ...editForm,
          price: parseInt(editForm.price),
          profit_rate: parseFloat(editForm.profit_rate)
        })
      });

      if (response.ok) {
        await fetchProducts();
        setEditingId(null);
      }
    } catch (error) {
      console.error('更新エラー:', error);
      alert('更新に失敗しました');
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({ product_code: '', product_name: '', price: '', profit_rate: '' });
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const response = await fetch('/api/wholesale/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: !currentStatus })
      });

      if (response.ok) {
        await fetchProducts();
      }
    } catch (error) {
      console.error('ステータス更新エラー:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('この商品を削除しますか？関連する売上データも削除されます。')) {
      return;
    }

    try {
      const response = await fetch(`/api/wholesale/products/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await fetchProducts();
      }
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除に失敗しました');
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

  const handleAddNew = async () => {
    try {
      const response = await fetch('/api/wholesale/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newForm,
          price: parseInt(newForm.price),
          profit_rate: parseFloat(newForm.profit_rate)
        })
      });

      if (response.ok) {
        await fetchProducts();
        setShowNewForm(false);
        setNewForm({ product_code: '', product_name: '', price: '', profit_rate: '20.00' });
      }
    } catch (error) {
      console.error('登録エラー:', error);
      alert('登録に失敗しました');
    }
  };

  const validateProfitRate = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0 || num > 100) {
      return '0.00';
    }
    return num.toFixed(2);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen">読み込み中...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">卸商品マスター管理</h1>
        <div className="flex gap-2">
          <Link href="/wholesale/dashboard">
            <Button variant="outline">ダッシュボードに戻る</Button>
          </Link>
          <Button onClick={() => setShowNewForm(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            新規登録
          </Button>
        </div>
      </div>

      {showNewForm && (
        <div className="mb-6 p-4 border rounded-lg bg-gray-50">
          <h3 className="text-lg font-semibold mb-4">新規商品登録</h3>
          <div className="grid grid-cols-5 gap-4">
            <Input
              placeholder="商品コード"
              value={newForm.product_code}
              onChange={(e) => setNewForm({ ...newForm, product_code: e.target.value })}
            />
            <Input
              placeholder="商品名"
              value={newForm.product_name}
              onChange={(e) => setNewForm({ ...newForm, product_name: e.target.value })}
              className="col-span-2"
            />
            <Input
              type="number"
              placeholder="卸価格"
              value={newForm.price}
              onChange={(e) => setNewForm({ ...newForm, price: e.target.value })}
            />
            <Input
              type="number"
              placeholder="利益率(%)"
              value={newForm.profit_rate}
              onChange={(e) => setNewForm({ ...newForm, profit_rate: e.target.value })}
              onBlur={(e) => setNewForm({ ...newForm, profit_rate: validateProfitRate(e.target.value) })}
              step="0.01"
              min="0"
              max="100"
            />
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={handleAddNew} size="sm">登録</Button>
            <Button onClick={() => setShowNewForm(false)} size="sm" variant="outline">キャンセル</Button>
          </div>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">順序</TableHead>
              <TableHead className="w-32">商品コード</TableHead>
              <TableHead>商品名</TableHead>
              <TableHead className="w-28 text-right">卸価格</TableHead>
              <TableHead className="w-24 text-right">利益率(%)</TableHead>
              <TableHead className="w-20 text-center">状態</TableHead>
              <TableHead className="w-32 text-center">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product, index) => (
              <TableRow key={product.id}>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOrderChange(product.id, 'up')}
                      disabled={index === 0}
                      className="h-6 w-6 p-0"
                    >
                      <ArrowUpDown className="w-3 h-3 rotate-180" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleOrderChange(product.id, 'down')}
                      disabled={index === products.length - 1}
                      className="h-6 w-6 p-0"
                    >
                      <ArrowUpDown className="w-3 h-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  {editingId === product.id ? (
                    <Input
                      value={editForm.product_code}
                      onChange={(e) => setEditForm({ ...editForm, product_code: e.target.value })}
                      className="h-8"
                    />
                  ) : (
                    product.product_code
                  )}
                </TableCell>
                <TableCell>
                  {editingId === product.id ? (
                    <Input
                      value={editForm.product_name}
                      onChange={(e) => setEditForm({ ...editForm, product_name: e.target.value })}
                      className="h-8"
                    />
                  ) : (
                    product.product_name
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {editingId === product.id ? (
                    <Input
                      type="number"
                      value={editForm.price}
                      onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                      className="h-8 text-right"
                    />
                  ) : (
                    `¥${product.price.toLocaleString()}`
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {editingId === product.id ? (
                    <Input
                      type="number"
                      value={editForm.profit_rate}
                      onChange={(e) => setEditForm({ ...editForm, profit_rate: e.target.value })}
                      onBlur={(e) => setEditForm({ ...editForm, profit_rate: validateProfitRate(e.target.value) })}
                      className="h-8 text-right"
                      step="0.01"
                      min="0"
                      max="100"
                    />
                  ) : (
                    `${product.profit_rate}%`
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={product.is_active}
                    onCheckedChange={() => handleToggleActive(product.id, product.is_active)}
                    disabled={editingId === product.id}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    {editingId === product.id ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={handleSave} className="h-8 w-8 p-0">
                          <Save className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={handleCancel} className="h-8 w-8 p-0">
                          <X className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => handleEdit(product)} className="h-8 w-8 p-0">
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(product.id)} className="h-8 w-8 p-0 text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
