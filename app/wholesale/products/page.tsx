// /app/wholesale/products/page.tsx ver.6 受注元プルダウン対応
"use client"

import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowUpDown, Pencil, Save, X, Plus, Trash2, Search } from 'lucide-react';
import Link from 'next/link';

interface Product {
  id: string;
  product_code: string;
  product_name: string;
  price: number;
  profit_rate: number;
  is_active: boolean;
  display_order: number;
  product_type: string;
  customer_id: string | null;
}

interface OEMCustomer {
  id: string;
  customer_code: string;
  customer_name: string;
  is_active: boolean;
}

type FilterType = 'all' | '通常卸' | 'OEM';

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    product_code: '',
    product_name: '',
    price: '',
    profit_rate: '',
    product_type: '通常卸',
    customer_id: '' as string
  });
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState({
    product_code: '',
    product_name: '',
    price: '',
    profit_rate: '20.00',
    product_type: '通常卸' as '通常卸' | 'OEM',
    customer_id: '' as string
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [oemCustomers, setOemCustomers] = useState<OEMCustomer[]>([]);

  useEffect(() => {
    fetchProducts();
    fetchOemCustomers();
  }, []);

  const fetchOemCustomers = async () => {
    try {
      const response = await fetch('/api/wholesale/oem-customers?all=true');
      const data = await response.json();
      if (data.success) setOemCustomers(data.customers);
    } catch (error) {
      console.error('OEM顧客取得エラー:', error);
    }
  };

  const getCustomerName = (customerId: string | null) => {
    if (!customerId) return '';
    const c = oemCustomers.find(c => c.id === customerId);
    return c ? c.customer_name : '';
  };

  const fetchProducts = async () => {
    setLoading(true);
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

  // フィルタ＋検索の適用
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesType = filter === 'all' || p.product_type === filter;
      const matchesSearch = searchQuery === '' ||
        p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.product_code.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [products, filter, searchQuery]);

  // 集計
  const counts = useMemo(() => ({
    all: products.length,
    通常卸: products.filter(p => p.product_type === '通常卸').length,
    OEM: products.filter(p => p.product_type === 'OEM').length,
  }), [products]);

  const handleEdit = (product: Product) => {
    setEditingId(product.id);
    setEditForm({
      product_code: product.product_code,
      product_name: product.product_name,
      price: product.price.toString(),
      profit_rate: product.profit_rate.toString(),
      product_type: product.product_type,
      customer_id: product.customer_id || ''
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
          product_code: editForm.product_code,
          product_name: editForm.product_name,
          price: parseInt(editForm.price),
          profit_rate: parseFloat(editForm.profit_rate),
          product_type: editForm.product_type,
          customer_id: editForm.customer_id || null
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
    setEditForm({ product_code: '', product_name: '', price: '', profit_rate: '', product_type: '通常卸', customer_id: '' });
  };

  const handleCustomerChange = async (id: string, customerId: string) => {
    try {
      const response = await fetch('/api/wholesale/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, customer_id: customerId || null })
      });

      if (response.ok) {
        await fetchProducts();
      }
    } catch (error) {
      console.error('受注元変更エラー:', error);
    }
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

  const handleTypeChange = async (id: string, newType: string) => {
    try {
      const response = await fetch('/api/wholesale/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, product_type: newType })
      });

      if (response.ok) {
        await fetchProducts();
      }
    } catch (error) {
      console.error('属性変更エラー:', error);
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
          profit_rate: parseFloat(newForm.profit_rate),
          customer_id: newForm.customer_id || null,
        })
      });

      if (response.ok) {
        await fetchProducts();
        setShowNewForm(false);
        setNewForm({ product_code: '', product_name: '', price: '', profit_rate: '20.00', product_type: '通常卸', customer_id: '' });
      }
    } catch (error) {
      console.error('登録エラー:', error);
      alert('登録に失敗しました');
    }
  };

  // チェックボックス操作
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredProducts.map(p => p.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;

    const selectedProducts = products.filter(p => selectedIds.has(p.id));
    const names = selectedProducts.map(p => `  • ${p.product_name}`).join('\n');

    if (!confirm(`以下の${selectedIds.size}件を削除しますか？\n関連する売上データも削除されます。\n\n${names}`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch('/api/wholesale/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) })
      });

      const data = await response.json();
      if (data.success) {
        await fetchProducts();
        setSelectedIds(new Set());
      } else {
        alert(`削除に失敗しました: ${data.error}`);
      }
    } catch (error) {
      console.error('バッチ削除エラー:', error);
      alert('削除に失敗しました');
    } finally {
      setIsDeleting(false);
    }
  };

  const validateProfitRate = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0 || num > 100) {
      return '0.00';
    }
    return num.toFixed(2);
  };

  const isAllSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedIds.has(p.id));

  if (loading) {
    return <div className="flex items-center justify-center h-screen">読み込み中...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
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

      {/* フィルタ・検索バー */}
      <div className="flex items-center gap-3 mb-4">
        {/* 属性フィルタ */}
        <div className="flex border rounded-lg overflow-hidden">
          {([['all', `全て (${counts.all})`], ['通常卸', `通常卸 (${counts.通常卸})`], ['OEM', `OEM (${counts.OEM})`]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setFilter(key as FilterType); setSelectedIds(new Set()); }}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 検索 */}
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="商品名・コードで検索"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9"
          />
        </div>

        {/* 一括削除ボタン */}
        {selectedIds.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBatchDelete}
            disabled={isDeleting}
            className="flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            {isDeleting ? '削除中...' : `${selectedIds.size}件を削除`}
          </Button>
        )}
      </div>

      {/* 新規登録フォーム */}
      {showNewForm && (
        <div className="mb-4 p-4 border rounded-lg bg-gray-50">
          <h3 className="text-lg font-semibold mb-3">新規商品登録</h3>
          <div className="grid grid-cols-6 gap-3">
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
            <select
              value={newForm.product_type}
              onChange={(e) => setNewForm({ ...newForm, product_type: e.target.value as '通常卸' | 'OEM', customer_id: e.target.value === '通常卸' ? '' : newForm.customer_id })}
              className="border rounded-md px-3 py-2 text-sm"
            >
              <option value="通常卸">通常卸</option>
              <option value="OEM">OEM</option>
            </select>
          </div>
          {newForm.product_type === 'OEM' && (
            <div className="mt-2">
              <label className="text-sm font-medium text-gray-600 mb-1 block">受注元（OEM顧客）</label>
              <select
                value={newForm.customer_id}
                onChange={(e) => setNewForm({ ...newForm, customer_id: e.target.value })}
                className="border rounded-md px-3 py-2 text-sm w-64"
              >
                <option value="">-- 未設定 --</option>
                {oemCustomers.filter(c => c.is_active).map(c => (
                  <option key={c.id} value={c.id}>{c.customer_name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <Button onClick={handleAddNew} size="sm">登録</Button>
            <Button onClick={() => setShowNewForm(false)} size="sm" variant="outline">キャンセル</Button>
          </div>
        </div>
      )}

      {/* テーブル */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={isAllSelected}
                  onCheckedChange={(checked) => handleSelectAll(!!checked)}
                />
              </TableHead>
              <TableHead className="w-12">順序</TableHead>
              <TableHead className="w-24">属性</TableHead>
              <TableHead className="w-32">受注元</TableHead>
              <TableHead className="w-28">商品コード</TableHead>
              <TableHead>商品名</TableHead>
              <TableHead className="w-28 text-right">卸価格</TableHead>
              <TableHead className="w-24 text-right">利益率(%)</TableHead>
              <TableHead className="w-20 text-center">状態</TableHead>
              <TableHead className="w-24 text-center">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProducts.map((product, index) => (
              <TableRow
                key={product.id}
                className={selectedIds.has(product.id) ? 'bg-blue-50' : ''}
              >
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(product.id)}
                    onCheckedChange={(checked) => handleSelectOne(product.id, !!checked)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-0.5">
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
                      disabled={index === filteredProducts.length - 1}
                      className="h-6 w-6 p-0"
                    >
                      <ArrowUpDown className="w-3 h-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  {editingId === product.id ? (
                    <select
                      value={editForm.product_type}
                      onChange={(e) => setEditForm({ ...editForm, product_type: e.target.value })}
                      className="border rounded px-2 py-1 text-sm w-full"
                    >
                      <option value="通常卸">通常卸</option>
                      <option value="OEM">OEM</option>
                    </select>
                  ) : (
                    <select
                      value={product.product_type}
                      onChange={(e) => handleTypeChange(product.id, e.target.value)}
                      className={`border rounded px-2 py-1 text-xs font-medium w-full ${
                        product.product_type === 'OEM'
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}
                    >
                      <option value="通常卸">通常卸</option>
                      <option value="OEM">OEM</option>
                    </select>
                  )}
                </TableCell>
                <TableCell>
                  {product.product_type === 'OEM' ? (
                    <select
                      value={product.customer_id || ''}
                      onChange={(e) => handleCustomerChange(product.id, e.target.value)}
                      className={`border rounded px-1 py-1 text-xs w-full ${
                        product.customer_id
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-gray-50 text-gray-400 border-gray-200'
                      }`}
                    >
                      <option value="">-- 未設定 --</option>
                      {oemCustomers.filter(c => c.is_active).map(c => (
                        <option key={c.id} value={c.id}>{c.customer_name}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-gray-400">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {editingId === product.id ? (
                    <Input
                      value={editForm.product_code}
                      onChange={(e) => setEditForm({ ...editForm, product_code: e.target.value })}
                      className="h-8"
                    />
                  ) : (
                    <span className="text-sm">{product.product_code}</span>
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
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(product)} className="h-8 w-8 p-0">
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredProducts.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                  {searchQuery ? '検索条件に一致する商品がありません' : '商品データがありません'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* フッターサマリー */}
      <div className="mt-3 text-sm text-gray-500">
        表示: {filteredProducts.length}件 / 全{products.length}件
        {selectedIds.size > 0 && <span className="ml-3 text-blue-600 font-medium">{selectedIds.size}件選択中</span>}
      </div>
    </div>
  );
}
