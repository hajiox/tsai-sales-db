// /app/wholesale/products/page.tsx ver.7 インライン編集+D&D並び替え
"use client"

import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { GripVertical, Plus, Trash2, Search } from 'lucide-react';
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

// インライン編集中のセル情報
type EditingCell = {
  id: string;
  field: 'product_name' | 'price' | 'profit_rate';
} | null;

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState({
    product_name: '',
    price: '',
    profit_rate: '20.00',
    product_type: '通常卸' as '通常卸' | 'OEM',
    customer_id: '' as string
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [oemCustomers, setOemCustomers] = useState<OEMCustomer[]>([]);

  // インライン編集
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // ドラッグ&ドロップ
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    fetchProducts();
    fetchOemCustomers();
  }, []);

  // 編集セルに切り替わったらフォーカス
  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingCell]);

  const fetchOemCustomers = async () => {
    try {
      const response = await fetch('/api/wholesale/oem-customers?all=true');
      const data = await response.json();
      if (data.success) setOemCustomers(data.customers);
    } catch (error) {
      console.error('OEM顧客取得エラー:', error);
    }
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

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesType = filter === 'all' || p.product_type === filter;
      const matchesSearch = searchQuery === '' ||
        p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.product_code.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [products, filter, searchQuery]);

  const counts = useMemo(() => ({
    all: products.length,
    通常卸: products.filter(p => p.product_type === '通常卸').length,
    OEM: products.filter(p => p.product_type === 'OEM').length,
  }), [products]);

  // === インライン編集 ===
  const startEditing = (id: string, field: 'product_name' | 'price' | 'profit_rate') => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    setEditingCell({ id, field });
    if (field === 'product_name') setEditValue(product.product_name);
    else if (field === 'price') setEditValue(String(product.price));
    else if (field === 'profit_rate') setEditValue(String(product.profit_rate));
  };

  const saveInlineEdit = async () => {
    if (!editingCell) return;
    const { id, field } = editingCell;
    const product = products.find(p => p.id === id);
    if (!product) { setEditingCell(null); return; }

    let updateData: any = {};
    if (field === 'product_name') {
      if (!editValue.trim()) { setEditingCell(null); return; }
      if (editValue.trim() === product.product_name) { setEditingCell(null); return; }
      updateData.product_name = editValue.trim();
    } else if (field === 'price') {
      const num = parseInt(editValue);
      if (isNaN(num) || num === product.price) { setEditingCell(null); return; }
      updateData.price = num;
    } else if (field === 'profit_rate') {
      let num = parseFloat(editValue);
      if (isNaN(num)) num = 0;
      if (num < 0) num = 0;
      if (num > 100) num = 100;
      num = parseFloat(num.toFixed(2));
      if (num === product.profit_rate) { setEditingCell(null); return; }
      updateData.profit_rate = num;
    }

    try {
      const response = await fetch('/api/wholesale/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updateData })
      });
      if (response.ok) {
        // ローカルstate即時更新
        setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updateData } : p));
      }
    } catch (error) {
      console.error('更新エラー:', error);
    }
    setEditingCell(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveInlineEdit();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  // === 属性・受注元・状態変更 ===
  const handleTypeChange = async (id: string, newType: string) => {
    try {
      const response = await fetch('/api/wholesale/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, product_type: newType })
      });
      if (response.ok) {
        setProducts(prev => prev.map(p => p.id === id ? { ...p, product_type: newType, customer_id: newType === '通常卸' ? null : p.customer_id } : p));
      }
    } catch (error) {
      console.error('属性変更エラー:', error);
    }
  };

  const handleCustomerChange = async (id: string, customerId: string) => {
    try {
      const response = await fetch('/api/wholesale/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, customer_id: customerId || null })
      });
      if (response.ok) {
        setProducts(prev => prev.map(p => p.id === id ? { ...p, customer_id: customerId || null } : p));
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
        setProducts(prev => prev.map(p => p.id === id ? { ...p, is_active: !currentStatus } : p));
      }
    } catch (error) {
      console.error('ステータス更新エラー:', error);
    }
  };

  // === ドラッグ&ドロップ ===
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    // ドラッグ時の半透明エフェクト
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.4';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    setDragId(null);
    setDragOverId(null);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(id);
  };

  const handleDrop = async (e: React.DragEvent, dropId: string) => {
    e.preventDefault();
    if (!dragId || dragId === dropId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }

    // フィルタ適用中は全商品リストで並び替え
    const currentList = [...products];
    const dragIndex = currentList.findIndex(p => p.id === dragId);
    const dropIndex = currentList.findIndex(p => p.id === dropId);

    if (dragIndex === -1 || dropIndex === -1) return;

    // ドラッグ元を抜いて、ドロップ先に挿入
    const [dragged] = currentList.splice(dragIndex, 1);
    currentList.splice(dropIndex, 0, dragged);

    // ローカルstate即時更新（オプティミスティック）
    const reordered = currentList.map((p, i) => ({ ...p, display_order: i + 1 }));
    setProducts(reordered);
    setDragId(null);
    setDragOverId(null);

    // サーバーに保存
    try {
      await fetch('/api/wholesale/products/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: reordered.map(p => p.id) })
      });
    } catch (error) {
      console.error('並び替え保存エラー:', error);
      await fetchProducts(); // 失敗時はリロード
    }
  };

  // === 新規登録 ===
  const handleAddNew = async () => {
    if (!newForm.product_name.trim()) {
      alert('商品名を入力してください');
      return;
    }
    const priceNum = parseInt(newForm.price);
    if (isNaN(priceNum)) {
      alert('正しい卸価格を入力してください');
      return;
    }

    try {
      const response = await fetch('/api/wholesale/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: newForm.product_name,
          price: priceNum,
          profit_rate: parseFloat(newForm.profit_rate) || 0,
          product_type: newForm.product_type,
          customer_id: newForm.customer_id || null,
        })
      });

      if (response.ok) {
        await fetchProducts();
        setShowNewForm(false);
        setNewForm({ product_name: '', price: '', profit_rate: '20.00', product_type: '通常卸', customer_id: '' });
      } else {
        const data = await response.json();
        alert(`登録に失敗しました: ${data.error || '不明なエラー'}`);
      }
    } catch (error) {
      console.error('登録エラー:', error);
      alert('通信エラーが発生しました');
    }
  };

  // === 選択・削除 ===
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(filteredProducts.map(p => p.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) newSet.add(id); else newSet.delete(id);
    setSelectedIds(newSet);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    const selectedProducts = products.filter(p => selectedIds.has(p.id));
    const names = selectedProducts.map(p => `  • ${p.product_name}`).join('\n');
    if (!confirm(`以下の${selectedIds.size}件を削除しますか？\n関連する売上データも削除されます。\n\n${names}`)) return;

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

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="商品名で検索"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9"
          />
        </div>

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
          <div className="grid grid-cols-5 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 mb-1 block">商品名 <span className="text-red-500">*</span></label>
              <Input
                placeholder="例: 大根ドレッシング"
                value={newForm.product_name}
                onChange={(e) => setNewForm({ ...newForm, product_name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">卸価格（税込）<span className="text-red-500">*</span></label>
              <Input
                type="number"
                placeholder="例: 315"
                value={newForm.price}
                onChange={(e) => setNewForm({ ...newForm, price: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">利益率（%）</label>
              <Input
                type="number"
                placeholder="例: 20"
                value={newForm.profit_rate}
                onChange={(e) => setNewForm({ ...newForm, profit_rate: e.target.value })}
                step="0.01"
                min="0"
                max="100"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">属性</label>
              <select
                value={newForm.product_type}
                onChange={(e) => setNewForm({ ...newForm, product_type: e.target.value as '通常卸' | 'OEM', customer_id: e.target.value === '通常卸' ? '' : newForm.customer_id })}
                className="border rounded-md px-3 py-2 text-sm w-full h-10"
              >
                <option value="通常卸">通常卸</option>
                <option value="OEM">OEM</option>
              </select>
            </div>
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
              <TableHead className="w-10"></TableHead>
              <TableHead className="w-24">属性</TableHead>
              <TableHead className="w-48">受注元</TableHead>
              <TableHead>商品名</TableHead>
              <TableHead className="w-28 text-right">卸価格</TableHead>
              <TableHead className="w-24 text-right">利益率(%)</TableHead>
              <TableHead className="w-20 text-center">状態</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProducts.map((product) => (
              <TableRow
                key={product.id}
                className={`${selectedIds.has(product.id) ? 'bg-blue-50' : ''} ${dragOverId === product.id && dragId !== product.id ? 'border-t-2 border-blue-400' : ''}`}
                draggable
                onDragStart={(e) => handleDragStart(e, product.id)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, product.id)}
                onDrop={(e) => handleDrop(e, product.id)}
              >
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(product.id)}
                    onCheckedChange={(checked) => handleSelectOne(product.id, !!checked)}
                  />
                </TableCell>
                <TableCell className="cursor-grab active:cursor-grabbing px-1">
                  <GripVertical className="w-4 h-4 text-gray-400" />
                </TableCell>
                <TableCell>
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

                {/* 商品名：クリックで編集 */}
                <TableCell
                  className="cursor-text"
                  onClick={() => {
                    if (!editingCell || editingCell.id !== product.id || editingCell.field !== 'product_name') {
                      startEditing(product.id, 'product_name');
                    }
                  }}
                >
                  {editingCell?.id === product.id && editingCell.field === 'product_name' ? (
                    <Input
                      ref={editInputRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      onBlur={saveInlineEdit}
                      className="h-8 text-sm"
                    />
                  ) : (
                    <span className="text-sm hover:text-blue-600 transition-colors">
                      {product.product_name}
                    </span>
                  )}
                </TableCell>

                {/* 卸価格：クリックで編集 */}
                <TableCell
                  className="text-right cursor-text"
                  onClick={() => {
                    if (!editingCell || editingCell.id !== product.id || editingCell.field !== 'price') {
                      startEditing(product.id, 'price');
                    }
                  }}
                >
                  {editingCell?.id === product.id && editingCell.field === 'price' ? (
                    <Input
                      ref={editInputRef}
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      onBlur={saveInlineEdit}
                      className="h-8 text-right text-sm w-24 ml-auto"
                    />
                  ) : (
                    <span className="text-sm hover:text-blue-600 transition-colors">
                      ¥{product.price.toLocaleString()}
                    </span>
                  )}
                </TableCell>

                {/* 利益率：クリックで編集 */}
                <TableCell
                  className="text-right cursor-text"
                  onClick={() => {
                    if (!editingCell || editingCell.id !== product.id || editingCell.field !== 'profit_rate') {
                      startEditing(product.id, 'profit_rate');
                    }
                  }}
                >
                  {editingCell?.id === product.id && editingCell.field === 'profit_rate' ? (
                    <Input
                      ref={editInputRef}
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      onBlur={saveInlineEdit}
                      className="h-8 text-right text-sm w-20 ml-auto"
                      step="0.01"
                      min="0"
                      max="100"
                    />
                  ) : (
                    <span className="text-sm hover:text-blue-600 transition-colors">
                      {product.profit_rate}%
                    </span>
                  )}
                </TableCell>

                <TableCell className="text-center">
                  <Switch
                    checked={product.is_active}
                    onCheckedChange={() => handleToggleActive(product.id, product.is_active)}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filteredProducts.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-gray-500">
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
        <span className="ml-3 text-gray-400">💡 商品名・卸価格・利益率はクリックで直接編集、Enterで保存  |  ⠿ をドラッグして並び替え</span>
      </div>
    </div>
  );
}
