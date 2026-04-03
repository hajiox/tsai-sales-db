// /app/wholesale/sales-input/page.tsx ver.2 — 行背景色機能付き日別売上入力
"use client"

import { Suspense } from 'react';
import { useState, useEffect, useRef, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button } from "@/components/ui/button";
import { ArrowLeft, Upload, Save, Link2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

// 行背景色の定義（5色 + クリア）
const ROW_COLORS: { key: string; label: string; bg: string; bgCell: string; bgSticky: string; dot: string }[] = [
  { key: 'yellow',  label: '黄',   bg: 'bg-yellow-50',  bgCell: 'bg-yellow-50',  bgSticky: 'bg-yellow-50',  dot: 'bg-yellow-300' },
  { key: 'green',   label: '緑',   bg: 'bg-green-50',   bgCell: 'bg-green-50',   bgSticky: 'bg-green-50',   dot: 'bg-green-300'  },
  { key: 'blue',    label: '青',   bg: 'bg-blue-50',    bgCell: 'bg-blue-50',    bgSticky: 'bg-blue-50',    dot: 'bg-blue-300'   },
  { key: 'pink',    label: 'ピンク', bg: 'bg-pink-50',  bgCell: 'bg-pink-50',    bgSticky: 'bg-pink-50',    dot: 'bg-pink-300'   },
  { key: 'purple',  label: '紫',   bg: 'bg-purple-50',  bgCell: 'bg-purple-50',  bgSticky: 'bg-purple-50',  dot: 'bg-purple-300' },
];

const COLOR_MAP: Record<string, typeof ROW_COLORS[0]> = {};
ROW_COLORS.forEach(c => { COLOR_MAP[c.key] = c; });

interface Product {
  id: string;
  product_name: string;
  product_code: string;
  price: number;
  profit_rate: number;
  product_type: string;
  row_color?: string | null;
  [key: string]: any;
}

interface SalesData {
  [productId: string]: { [day: string]: { quantity: number; unit_price: number; amount: number } | undefined; };
}

// カラーパレットポップオーバー（fixed positioning でテーブル行に隠れない）
function ColorPalette({ currentColor, onSelect, onClose, anchorEl }: {
  currentColor: string | null | undefined;
  onSelect: (color: string | null) => void;
  onClose: () => void;
  anchorEl: HTMLElement | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [anchorEl]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && anchorEl && !anchorEl.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorEl]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      className="bg-white border border-gray-200 rounded-lg shadow-xl p-2 flex items-center gap-1.5"
    >
      {ROW_COLORS.map(c => (
        <button
          key={c.key}
          onClick={() => { onSelect(c.key); onClose(); }}
          className={`w-6 h-6 rounded-full ${c.dot} border-2 transition-all hover:scale-110 ${currentColor === c.key ? 'border-gray-700 ring-2 ring-offset-1 ring-gray-400' : 'border-white'}`}
          title={c.label}
        />
      ))}
      {/* クリアボタン */}
      <button
        onClick={() => { onSelect(null); onClose(); }}
        className={`w-6 h-6 rounded-full bg-white border-2 border-gray-300 transition-all hover:scale-110 flex items-center justify-center text-gray-400 text-[10px] font-bold ${!currentColor ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
        title="色なし"
      >
        ✕
      </button>
    </div>,
    document.body
  );
}

function SalesInputContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [salesData, setSalesData] = useState<SalesData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [yearOptions, setYearOptions] = useState<string[]>([]);
  const [monthOptions, setMonthOptions] = useState<string[]>([]);
  const [linkedProductIds, setLinkedProductIds] = useState<Set<string>>(new Set());
  const [colorPickerOpen, setColorPickerOpen] = useState<{ productId: string; anchorEl: HTMLElement } | null>(null); // カラーパレット開閉

  useEffect(() => {
    setMounted(true);
    const now = new Date();
    const years: string[] = [];
    for (let i = 0; i < 3; i++) years.push(String(now.getFullYear() - i));
    setYearOptions(years);
    const months: string[] = [];
    for (let i = 1; i <= 12; i++) months.push(String(i).padStart(2, '0'));
    setMonthOptions(months);

    const urlYear = searchParams.get('year');
    const urlMonth = searchParams.get('month');
    if (urlYear && urlMonth) {
      setSelectedYear(urlYear);
      setSelectedMonth(urlMonth);
    } else {
      setSelectedYear(String(now.getFullYear()));
      setSelectedMonth(String(now.getMonth() + 1).padStart(2, '0'));
    }
  }, [searchParams]);

  useEffect(() => {
    if (!selectedYear || !selectedMonth || !mounted) return;
    fetchAllData();
  }, [selectedYear, selectedMonth, mounted]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchProducts(), fetchSalesData(), fetchLinkedProducts()]);
    } catch (error) {
      console.error('データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    const response = await fetch('/api/wholesale/products?type=通常卸');
    const data = await response.json();
    if (data.success) setProducts(data.products);
  };

  const fetchSalesData = async () => {
    const month = `${selectedYear}-${selectedMonth}`;
    const response = await fetch(`/api/wholesale/sales?month=${month}`);
    const data = await response.json();
    if (data.success && Array.isArray(data.sales)) {
      const formatted: SalesData = {};
      data.sales.forEach((sale: any) => {
        if (!formatted[sale.product_id]) formatted[sale.product_id] = {};
        const day = new Date(sale.sale_date).getUTCDate();
        formatted[sale.product_id][day] = {
          quantity: sale.quantity,
          unit_price: sale.unit_price || 0,
          amount: sale.amount || 0
        };
      });
      setSalesData(formatted);
    } else {
      setSalesData({});
    }
  };

  const fetchLinkedProducts = async () => {
    try {
      const res = await fetch('/api/recipe/sync-wholesale');
      if (res.ok) {
        const data = await res.json();
        if (data.recipes) {
          const linked = new Set<string>();
          data.recipes.forEach((r: { linked_wholesale_product_id: string | null }) => {
            if (r.linked_wholesale_product_id) linked.add(r.linked_wholesale_product_id);
          });
          setLinkedProductIds(linked);
        }
      }
    } catch (error) {
      console.error('紐付け情報取得エラー:', error);
    }
  };

  const getDaysInMonth = () => {
    if (!selectedYear || !selectedMonth) return 31;
    return new Date(parseInt(selectedYear), parseInt(selectedMonth), 0).getDate();
  };

  const handleQuantityChange = (productId: string, day: number, value: string) => {
    if (!/^-?\d*$/.test(value)) return;
    const product = products.find(p => p.id === productId);
    const qty = value === '' ? 0 : parseInt(value, 10);
    const unitPrice = product?.price || 0;
    setSalesData(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [day]: value === '' ? undefined : { quantity: qty, unit_price: unitPrice, amount: qty * unitPrice },
      }
    }));
  };

  const saveSalesData = async (productId: string, day: number) => {
    const dayData = salesData[productId]?.[day];
    const quantity = dayData?.quantity || 0;
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const saleDate = `${selectedYear}-${selectedMonth}-${String(day).padStart(2, '0')}`;
    try {
      await fetch('/api/wholesale/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, saleDate, quantity, unitPrice: product.price })
      });
    } catch (error) {
      console.error('保存エラー:', error);
    }
  };

  const handleInputKeyDown = async (e: KeyboardEvent<HTMLInputElement>, productId: string, day: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setSaving(true);
      await saveSalesData(productId, day);
      setSaving(false);
      (e.target as HTMLInputElement).blur();
    }
  };

  const calculateTotals = (productId: string) => {
    const sales = salesData[productId] || {};
    let totalQuantity = 0;
    let totalAmount = 0;
    Object.values(sales).forEach(dayData => {
      if (dayData) {
        totalQuantity += dayData.quantity || 0;
        totalAmount += dayData.amount || 0;
      }
    });
    return { totalQuantity, totalAmount };
  };

  // 行の背景色変更
  const handleRowColorChange = async (productId: string, color: string | null) => {
    // ローカルstate即時反映
    setProducts(prev => prev.map(p =>
      p.id === productId ? { ...p, row_color: color } : p
    ));
    // DB保存
    try {
      await fetch('/api/wholesale/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: productId, row_color: color })
      });
    } catch (error) {
      console.error('行色保存エラー:', error);
    }
  };

  // CSV読み込み
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        const productNameIndex = headers.findIndex(h => h === '商品名');
        const priceIndex = headers.findIndex(h => h === '卸価格');
        if (productNameIndex === -1) {
          alert('CSVに「商品名」列が見つかりません。');
          setIsImporting(false);
          return;
        }
        const dayColumns: { [key: string]: number } = {};
        headers.forEach((header, index) => {
          const match = header.match(/^(\d+)日$/);
          if (match) dayColumns[match[1]] = index;
        });
        const importData: any[] = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const values = line.split(',').map(v => v.trim());
          const productName = values[productNameIndex];
          if (!productName) continue;
          const price = priceIndex !== -1 ? parseInt(values[priceIndex]) || 0 : 0;
          Object.entries(dayColumns).forEach(([day, idx]) => {
            const quantity = parseInt(values[idx]) || 0;
            if (quantity !== 0) {
              importData.push({
                productName, price,
                saleDate: `${selectedYear}-${selectedMonth}-${day.padStart(2, '0')}`,
                quantity
              });
            }
          });
        }
        const response = await fetch('/api/wholesale/sales/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: importData })
        });
        const result = await response.json();
        if (result.success) {
          alert(`CSV読み込み完了。処理件数: ${result.processed}件`);
          await fetchAllData();
        } else {
          alert(`エラー: ${result.error}`);
        }
      } catch {
        alert('CSV読み込み中にエラーが発生しました。');
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    router.push(`/wholesale/sales-input?year=${year}&month=${selectedMonth}`);
  };

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
    router.push(`/wholesale/sales-input?year=${selectedYear}&month=${month}`);
  };

  const daysInMonth = getDaysInMonth();

  // 全体合計
  const grandTotalQuantity = products.reduce((sum, p) => sum + calculateTotals(p.id).totalQuantity, 0);
  const grandTotalAmount = products.reduce((sum, p) => sum + calculateTotals(p.id).totalAmount, 0);

  if (!mounted) return null;

  return (
    <div className="h-screen flex flex-col">
      {/* ヘッダー */}
      <header className="flex-shrink-0 bg-white shadow-sm border-b z-30">
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => router.push(`/wholesale/dashboard?year=${selectedYear}&month=${selectedMonth}`)}
              className="flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              ダッシュボードに戻る
            </Button>
            <div className="h-5 w-px bg-gray-300" />
            <h1 className="text-lg font-bold text-gray-900">日別売上入力</h1>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedYear}
              onChange={(e) => handleYearChange(e.target.value)}
              className="h-8 px-2 py-1 text-sm rounded-md border"
              disabled={loading}
            >
              {yearOptions.map(y => <option key={y} value={y}>{y}年</option>)}
            </select>
            <select
              value={selectedMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="h-8 px-2 py-1 text-sm rounded-md border"
              disabled={loading}
            >
              {monthOptions.map(m => <option key={m} value={m}>{m}月</option>)}
            </select>
            <div className="h-5 w-px bg-gray-300" />
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".csv"
              className="hidden"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || isImporting}
              className="flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              {isImporting ? 'インポート中...' : 'CSV読込'}
            </Button>
            {saving && (
              <span className="text-xs text-blue-600 flex items-center gap-1">
                <Save className="w-3 h-3 animate-spin" /> 保存中...
              </span>
            )}
          </div>
        </div>
        {/* サマリーバー */}
        <div className="px-4 py-1 bg-gray-50 border-t flex items-center gap-6 text-sm">
          <span className="text-gray-500">
            {selectedYear}年{selectedMonth}月 / {products.length}商品
          </span>
          <span className="font-medium">
            合計数量: <span className="text-blue-700">{grandTotalQuantity.toLocaleString()}</span>
          </span>
          <span className="font-medium">
            合計売上: <span className="text-green-700">¥{grandTotalAmount.toLocaleString()}</span>
          </span>
        </div>
      </header>

      {/* テーブル */}
      <main className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">データを読み込んでいます...</p>
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-100 border-b">
                <th className="p-2 text-left font-semibold text-gray-700 min-w-[200px] border-r sticky left-0 bg-gray-100 z-20">
                  商品情報
                </th>
                <th className="p-1.5 text-center font-semibold text-gray-700 min-w-[50px] border-l bg-blue-50">
                  合計
                </th>
                {Array.from({ length: daysInMonth }, (_, i) => (
                  <th key={i + 1} className="p-1 text-center font-semibold text-gray-600 min-w-[40px] border-l">
                    {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={daysInMonth + 2} className="text-center py-10 text-gray-500">
                    商品データがありません
                  </td>
                </tr>
              ) : products.map((product) => {
                const { totalQuantity, totalAmount } = calculateTotals(product.id);
                const colorDef = product.row_color ? COLOR_MAP[product.row_color] : null;
                const rowBg = colorDef ? colorDef.bg : '';
                const stickyBg = colorDef ? colorDef.bgSticky : 'bg-white';
                const totalBg = colorDef ? colorDef.bgCell : 'bg-blue-50';
                return (
                  <tr key={product.id} className={`border-b hover:bg-gray-50/50 ${rowBg}`}>
                    <td className={`p-2 border-r sticky left-0 z-10 ${stickyBg}`}>
                      <div className="flex items-center gap-1.5">
                        {/* カラーインジケータ */}
                        <div className="flex-shrink-0">
                          <button
                            onClick={(e) => setColorPickerOpen(
                              colorPickerOpen?.productId === product.id
                                ? null
                                : { productId: product.id, anchorEl: e.currentTarget }
                            )}
                            className={`w-3.5 h-3.5 rounded-full border transition-all hover:scale-125 ${
                              colorDef ? `${colorDef.dot} border-gray-400` : 'bg-gray-200 border-gray-300 hover:bg-gray-300'
                            }`}
                            title="行の色を変更"
                          />
                          {colorPickerOpen?.productId === product.id && (
                            <ColorPalette
                              currentColor={product.row_color}
                              onSelect={(color) => handleRowColorChange(product.id, color)}
                              onClose={() => setColorPickerOpen(null)}
                              anchorEl={colorPickerOpen.anchorEl}
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-800 flex items-center gap-1">
                            {product.product_name}
                            {linkedProductIds.has(product.id) && (
                              <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-green-100 text-green-700 rounded text-[9px] font-medium" title="レシピ紐付済">
                                <Link2 className="h-2.5 w-2.5" />
                              </span>
                            )}
                          </div>
                          <div className="text-gray-500">¥{product.price.toLocaleString()}</div>
                        </div>
                      </div>
                    </td>
                    <td className={`p-1 border-l text-center font-medium ${totalBg}`}>
                      <div className="text-gray-800">{totalQuantity || ''}</div>
                      <div className="text-[10px] text-gray-500">{totalAmount > 0 ? `¥${totalAmount.toLocaleString()}` : ''}</div>
                    </td>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const day = i + 1;
                      const daySales = salesData[product.id]?.[day];
                      const quantity = daySales?.quantity ?? '';
                      return (
                        <td key={day} className="p-0 border-l text-center">
                          <input
                            type="number"
                            value={quantity}
                            onChange={(e) => handleQuantityChange(product.id, day, e.target.value)}
                            onBlur={() => saveSalesData(product.id, day)}
                            onKeyDown={(e) => handleInputKeyDown(e, product.id, day)}
                            className={`w-full h-full p-1 text-center bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-blue-50`}
                            aria-label={`${product.product_name} ${day}日`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}

export default function SalesInputPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    }>
      <SalesInputContent />
    </Suspense>
  );
}
