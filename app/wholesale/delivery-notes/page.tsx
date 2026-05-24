"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CalendarDays,
  Minus,
  Package,
  Plus,
  Printer,
  ReceiptText,
  Search,
  Star,
  Trash2,
  UserRound,
} from 'lucide-react';

type Customer = {
  id: string;
  customer_code: string | null;
  customer_name: string;
  customer_type: string | null;
  is_active: boolean | null;
  is_favorite: boolean | null;
  favorite_order: number | null;
};

type Product = {
  id: string;
  product_code: string | null;
  product_name: string;
  price: number;
  product_type: string | null;
  recipe_category?: string | null;
  is_active: boolean | null;
};

type LineItem = {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  remarks: string;
};

const SETTINGS_STORAGE_KEY = 'tsa-web-delivery-note-settings-v1';

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function WholesaleDeliveryNotesMobilePage() {
  const router = useRouter();
  const settingsRestoredRef = useRef(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [deliveryDate, setDeliveryDate] = useState(todayIso);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [newCustomerName, setNewCustomerName] = useState('');
  const transactionType = 'purchase';
  const rate = 0.65;
  const [productSearch, setProductSearch] = useState('');
  const [productCategory, setProductCategory] = useState<'自社' | 'OEM'>('自社');
  const [items, setItems] = useState<LineItem[]>([]);
  const memo = '';

  const load = async () => {
    setLoading(true);
    try {
      const optionsRes = await fetch('/api/wholesale/delivery-notes/options');
      const optionsData = await optionsRes.json();
      if (optionsData.success) {
        const loadedCustomers: Customer[] = optionsData.customers || [];
        setCustomers(loadedCustomers);
        setProducts(optionsData.products || []);
        if (!settingsRestoredRef.current) {
          try {
            const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
            const saved = raw ? JSON.parse(raw) : null;
            if (saved && typeof saved === 'object') {
              const savedCustomer = loadedCustomers.find(c => c.id === saved.customerId)
                || loadedCustomers.find(c => c.customer_name === saved.customerName);
              if (savedCustomer) {
                setSelectedCustomer(savedCustomer);
                setCustomerSearch(savedCustomer.customer_name);
                setNewCustomerName('');
              } else if (typeof saved.customerName === 'string' && saved.customerName.trim()) {
                setCustomerSearch(saved.customerName);
                setNewCustomerName(saved.customerName);
              }
              if (saved.deliveryDate) setDeliveryDate(String(saved.deliveryDate).slice(0, 10));
            }
          } catch {
            localStorage.removeItem(SETTINGS_STORAGE_KEY);
          } finally {
            settingsRestoredRef.current = true;
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!settingsRestoredRef.current) return;
    const customerName = selectedCustomer?.customer_name || newCustomerName.trim() || customerSearch.trim();
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      deliveryDate,
      customerId: selectedCustomer?.id || null,
      customerName,
    }));
  }, [deliveryDate, selectedCustomer, newCustomerName, customerSearch]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    return customers
      .filter(c => !q || c.customer_name.toLowerCase().includes(q) || String(c.customer_code || '').toLowerCase().includes(q))
      .filter(c => c.is_active !== false)
      .sort((a, b) => {
        const favoriteDiff = Number(Boolean(b.is_favorite)) - Number(Boolean(a.is_favorite));
        if (favoriteDiff !== 0) return favoriteDiff;
        const orderA = a.favorite_order ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.favorite_order ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return a.customer_name.localeCompare(b.customer_name, 'ja');
      })
      .slice(0, 20);
  }, [customers, customerSearch]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return products
      .filter(p => p.is_active !== false)
      .filter(p => (p.recipe_category || '自社') === productCategory)
      .filter(p => !q || p.product_name.toLowerCase().includes(q) || String(p.product_code || '').toLowerCase().includes(q));
  }, [products, productSearch, productCategory]);

  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );

  const addProduct = (product: Product) => {
    let nextQuantity = 1;
    setItems(prev => {
      const index = prev.findIndex(item => item.productId === product.id && !item.remarks);
      if (index >= 0) {
        nextQuantity = prev[index].quantity + 1;
        return prev.map((item, i) => i === index
          ? { ...item, quantity: item.quantity + 1 }
          : item
        );
      }
      return [...prev, {
        productId: product.id,
        productName: product.product_name,
        quantity: 1,
        unit: '個',
        unitPrice: Number(product.price || 0),
        remarks: '',
      }];
    });
    setMessage(`${product.product_name} を追加しました（数量 ${nextQuantity}）`);
    setProductSearch('');
  };

  const updateItem = (index: number, patch: Partial<LineItem>) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, ...patch } : item));
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const toggleCustomerFavorite = async (customer: Customer) => {
    const nextFavorite = !customer.is_favorite;
    const optimisticCustomer = {
      ...customer,
      is_favorite: nextFavorite,
      favorite_order: nextFavorite ? Math.floor(Date.now() / 1000) : null,
    };

    setCustomers(prev => prev.map(c => c.id === customer.id ? optimisticCustomer : c));
    if (selectedCustomer?.id === customer.id) setSelectedCustomer(optimisticCustomer);
    setMessage('');

    try {
      const res = await fetch(`/api/wholesale/delivery-notes/customers/${encodeURIComponent(customer.id)}/favorite`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: nextFavorite }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'お気に入りの更新に失敗しました');
      setCustomers(prev => prev.map(c => c.id === customer.id ? data.customer : c));
      if (selectedCustomer?.id === customer.id) setSelectedCustomer(data.customer);
    } catch (error: any) {
      setCustomers(prev => prev.map(c => c.id === customer.id ? customer : c));
      if (selectedCustomer?.id === customer.id) setSelectedCustomer(customer);
      setMessage(error?.message || 'お気に入りの更新に失敗しました');
    }
  };

  const issue = async (printAfter: boolean) => {
    const customerName = selectedCustomer?.customer_name || newCustomerName.trim();
    if (!customerName) {
      setMessage('発行先を選択してください');
      return;
    }
    if (items.length === 0) {
      setMessage('商品を追加してください');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/wholesale/delivery-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryDate,
          customerId: selectedCustomer?.id,
          customerName,
          transactionType,
          rate,
          memo,
          items: items.map(item => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            remarks: item.remarks,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '発行に失敗しました');

      setMessage(`${data.deliveryNote.number} を発行しました`);
      setItems([]);
      setProductSearch('');
      await load();
      if (printAfter) {
        router.push(`/wholesale/delivery-notes/${encodeURIComponent(data.deliveryNote.id)}/receipt`);
      }
    } catch (error: any) {
      setMessage(error?.message || '発行に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <button
            type="button"
            onClick={() => router.push('/wholesale/dashboard')}
            className="flex min-h-10 items-center gap-2 rounded-full border border-slate-700 px-3 text-sm text-slate-300"
          >
            <ArrowLeft className="h-4 w-4" />
            戻る
          </button>
          <div className="text-right">
            <h1 className="text-lg font-bold">納品書発行</h1>
            <p className="text-[11px] text-slate-500">WEB / モバイル</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 pb-36 pt-4">
        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">
            読み込み中...
          </div>
        ) : (
          <>
            <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center gap-2 text-cyan-300">
                <CalendarDays className="h-4 w-4" />
                <h2 className="text-sm font-semibold">納品情報</h2>
              </div>
              <label className="block text-xs text-slate-500">
                納品日
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={e => setDeliveryDate(e.target.value)}
                  className="mt-1 min-h-12 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 text-base text-white outline-none focus:border-cyan-500"
                />
              </label>
            </section>

            <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center gap-2 text-cyan-300">
                <UserRound className="h-4 w-4" />
                <h2 className="text-sm font-semibold">発行先</h2>
                <span className="ml-auto text-[11px] text-slate-500">★は上部表示</span>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={e => {
                    setCustomerSearch(e.target.value);
                    setSelectedCustomer(null);
                    setNewCustomerName(e.target.value);
                  }}
                  placeholder="取引先を検索"
                  className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-800 pl-9 pr-3 text-base text-white outline-none placeholder:text-slate-500 focus:border-cyan-500"
                />
              </div>
              <div className="max-h-60 space-y-2 overflow-y-auto">
                {filteredCustomers.map(customer => (
                  <div
                    key={customer.id}
                    className={`flex items-stretch gap-2 rounded-xl border transition ${selectedCustomer?.id === customer.id ? 'border-cyan-400 bg-cyan-950 text-cyan-100' : 'border-slate-700 bg-slate-800 text-slate-200'}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setCustomerSearch(customer.customer_name);
                        setNewCustomerName('');
                      }}
                      className="min-w-0 flex-1 px-3 py-3 text-left"
                    >
                      <span className="block break-words text-sm font-semibold">{customer.customer_name}</span>
                      <span className="text-[11px] text-slate-500">{customer.customer_code || 'コードなし'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleCustomerFavorite(customer)}
                      aria-label={customer.is_favorite ? 'お気に入り解除' : 'お気に入り追加'}
                      className={`my-2 mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${customer.is_favorite ? 'border-amber-400 bg-amber-400/15 text-amber-300' : 'border-slate-700 bg-slate-900 text-slate-500'}`}
                    >
                      <Star className={`h-5 w-5 ${customer.is_favorite ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                ))}
              </div>
              {!selectedCustomer && customerSearch.trim() && (
                <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-3 text-xs text-amber-200">
                  新規発行先として「{customerSearch.trim()}」を登録して発行できます。
                </div>
              )}
            </section>

            <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center gap-2 text-cyan-300">
                <Package className="h-4 w-4" />
                <h2 className="text-sm font-semibold">商品追加</h2>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-700 bg-slate-950 p-1">
                {(['自社', 'OEM'] as const).map(category => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => {
                      setProductCategory(category);
                      setProductSearch('');
                    }}
                    className={`min-h-10 rounded-lg text-sm font-semibold transition active:scale-[0.98] ${productCategory === category ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}
                  >
                    {category}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  placeholder="商品名・コードで検索"
                  className="min-h-12 w-full rounded-xl border border-slate-700 bg-slate-800 pl-9 pr-3 text-base text-white outline-none placeholder:text-slate-500 focus:border-cyan-500"
                />
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {filteredProducts.map(product => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProduct(product)}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 px-3 py-3 text-left transition active:scale-[0.97] active:shadow-inner"
                  >
                    <span className="min-w-0">
                      <span className="block break-words text-sm font-semibold text-slate-100">{product.product_name}</span>
                      <span className="text-[11px] text-slate-500">{product.product_code || 'コードなし'}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-cyan-300">
                  <ReceiptText className="h-4 w-4" />
                  <h2 className="text-sm font-semibold">明細</h2>
                </div>
                <span className="text-xs text-slate-500">{items.length}行 / {itemCount}点</span>
              </div>
              {items.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
                  商品を追加してください
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div key={`${item.productId}-${index}`} className="space-y-3 rounded-xl border border-slate-700 bg-slate-800 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="break-words text-sm font-semibold text-white">{item.productName}</div>
                        </div>
                        <button type="button" onClick={() => removeItem(index)} className="rounded-lg bg-rose-950 p-2 text-rose-300">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-[44px_1fr_44px] gap-2">
                        <button type="button" onClick={() => updateItem(index, { quantity: item.quantity - 1 })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-900">
                          <Minus className="mx-auto h-4 w-4" />
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={item.quantity}
                          onFocus={e => e.currentTarget.select()}
                          onChange={e => updateItem(index, { quantity: Number(e.target.value || 0) })}
                          className="min-h-11 rounded-xl border border-slate-700 bg-slate-900 px-3 text-center text-base text-white outline-none focus:border-cyan-500"
                        />
                        <button type="button" onClick={() => updateItem(index, { quantity: item.quantity + 1 })} className="min-h-11 rounded-xl border border-slate-700 bg-slate-900">
                          <Plus className="mx-auto h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

          </>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-md space-y-2">
          {message && <div className="rounded-lg bg-slate-800 px-3 py-2 text-center text-xs text-cyan-200">{message}</div>}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => issue(false)}
              disabled={saving || loading}
              className="min-h-12 rounded-xl border border-slate-700 bg-slate-800 text-sm font-semibold text-slate-100 disabled:opacity-40"
            >
              {saving ? '発行中...' : '発行のみ'}
            </button>
            <button
              type="button"
              onClick={() => issue(true)}
              disabled={saving || loading}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-cyan-600 text-sm font-semibold text-white disabled:opacity-40"
            >
              <Printer className="h-4 w-4" />
              発行して印刷
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
