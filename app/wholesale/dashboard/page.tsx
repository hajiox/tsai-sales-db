// /app/wholesale/dashboard/page.tsx ver.41 ヘッダーUI改善
"use client"

export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { useState, useEffect, KeyboardEvent, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Upload, Trash2, Settings, Users, TrendingUp, BarChart3 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import SummaryCards from '@/components/wholesale/summary-cards';
import RankingCards from '@/components/wholesale/ranking-cards';
import OEMArea from '@/components/wholesale/oem-area';
import SalesDataTable from '@/components/wholesale/sales-data-table';
import ProductStatistics from '@/components/wholesale/product-statistics';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

// インターフェース定義
interface Product {
  id: string;
  product_name: string;
  price: number;
  profit_rate: number;
  [key: string]: any;
}

interface OEMProduct {
  id: string;
  product_name: string;
  price: number;
  [key: string]: any;
}

interface OEMSale {
  id: string;
  product_id: string;
  customer_id: string;
  sale_date: string;
  quantity: number;
  unit_price: number;
  amount: number;
  oem_products?: {
    product_name: string;
    product_code: string;
  };
  oem_customers?: {
    customer_name: string;
    customer_code: string;
  };
}

interface SalesData {
  [productId: string]: { [date: string]: { quantity: number; unit_price: number; amount: number } | undefined; };
}

interface HistoricalPriceData {
  product_id: string;
  product_code: string;
  product_name: string;
  total_quantity: number;
  current_price: number;
  historical_price: number;
  current_profit_rate: number;
  historical_profit_rate: number;
  current_amount: number;
  historical_amount: number;
  current_profit: number;
  historical_profit: number;
  amount_difference: number;
  profit_difference: number;
}

interface PriceChangeDate {
  change_date: string;
  product_count: number;
}

function WholesaleDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [yearOptions, setYearOptions] = useState<string[]>([]);
  const [monthOptions, setMonthOptions] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [oemProducts, setOemProducts] = useState<OEMProduct[]>([]);
  const [oemSales, setOemSales] = useState<OEMSale[]>([]);
  const [salesData, setSalesData] = useState<SalesData>({});
  const [previousMonthData, setPreviousMonthData] = useState<SalesData>({});
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkedProductIds, setLinkedProductIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const now = new Date();

    const years: string[] = [];
    for (let i = 0; i < 3; i++) {
      years.push(String(now.getFullYear() - i));
    }
    setYearOptions(years);

    const months: string[] = [];
    for (let i = 1; i <= 12; i++) {
      months.push(String(i).padStart(2, '0'));
    }
    setMonthOptions(months);

    const urlYear = searchParams.get('year');
    const urlMonth = searchParams.get('month');

    if (urlYear && urlMonth) {
      setSelectedYear(urlYear);
      setSelectedMonth(urlMonth);
    } else {
      // URLパラメータがない場合、データのある最新月を取得
      const fetchLatestMonth = async () => {
        try {
          const supabase = getSupabaseBrowserClient();
          const { data, error } = await supabase
            .from('wholesale_sales')
            .select('sale_date')
            .order('sale_date', { ascending: false })
            .limit(1);

          if (!error && data && data.length > 0) {
            const latestDate = new Date(data[0].sale_date);
            const latestYear = String(latestDate.getUTCFullYear());
            const latestMonth = String(latestDate.getUTCMonth() + 1).padStart(2, '0');
            setSelectedYear(latestYear);
            setSelectedMonth(latestMonth);
          } else {
            // データがない場合は当月
            setSelectedYear(String(now.getFullYear()));
            setSelectedMonth(String(now.getMonth() + 1).padStart(2, '0'));
          }
        } catch {
          setSelectedYear(String(now.getFullYear()));
          setSelectedMonth(String(now.getMonth() + 1).padStart(2, '0'));
        }
      };
      fetchLatestMonth();
    }
  }, [mounted, searchParams]);

  const updateURL = (year: string, month: string) => {
    if (year && month) {
      router.push(`/wholesale/dashboard?year=${year}&month=${month}`);
    }
  };

  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    updateURL(year, selectedMonth);
  };

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
    updateURL(selectedYear, month);
  };

  useEffect(() => {
    if (!selectedYear || !selectedMonth || !mounted) return;
    const fetchAllData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchProducts(),
          fetchOemProducts(),
          fetchSalesData(`${selectedYear}-${selectedMonth}`),
          fetchOemSalesData(`${selectedYear}-${selectedMonth}`),
          fetchPreviousMonthData(`${selectedYear}-${selectedMonth}`)
        ]);
      } catch (error) {
        console.error('一括データ取得エラー:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchAllData();
  }, [selectedYear, selectedMonth, mounted]);



  // データ取得関数（簡素化のため一部のみ記載）
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
    }
    // レシピ紐付け情報も取得（サーバーサイドAPI経由でRLSバイパス）
    try {
      const linkRes = await fetch('/api/recipe/sync-wholesale');
      if (linkRes.ok) {
        const linkData = await linkRes.json();
        if (linkData.recipes) {
          const linked = new Set<string>();
          linkData.recipes.forEach((r: { linked_wholesale_product_id: string | null }) => {
            if (r.linked_wholesale_product_id) linked.add(r.linked_wholesale_product_id);
          });
          setLinkedProductIds(linked);
        }
      }
    } catch (error) {
      console.error('紐付け情報取得エラー:', error);
    }
  };

  const fetchOemProducts = async () => {
    try {
      const response = await fetch('/api/wholesale/products?type=OEM');
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.products)) {
          setOemProducts(data.products.map((p: any) => ({
            id: p.id,
            product_name: p.product_name,
            price: p.price,
          })));
        }
      }
    } catch (error) {
      console.error('OEM商品データ取得エラー:', error);
    }
  };

  const fetchSalesData = async (month: string) => {
    try {
      const response = await fetch(`/api/wholesale/sales?month=${month}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.sales)) {
          const formatted: SalesData = {};
          data.sales.forEach((sale: any) => {
            if (!formatted[sale.product_id]) {
              formatted[sale.product_id] = {};
            }
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
      }
    } catch (error) {
      console.error('売上データ取得エラー:', error);
      setSalesData({});
    }
  };

  const fetchOemSalesData = async (month: string) => {
    try {
      const startDate = `${month}-01`;
      const [year, monthNum] = month.split('-').map(Number);
      const lastDay = new Date(year, monthNum, 0).getDate();
      const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

      const supabase = getSupabaseBrowserClient();
      const { data: sales, error } = await supabase
        .from('wholesale_sales')
        .select('*')
        .not('customer_id', 'is', null)
        .gte('sale_date', startDate)
        .lte('sale_date', endDate)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('OEM売上データ取得エラー:', error);
        setOemSales([]);
        return;
      }

      setOemSales(sales || []);
    } catch (error) {
      console.error('OEM売上データ取得エラー:', error);
      setOemSales([]);
    }
  };

  const fetchPreviousMonthData = async (month: string) => {
    try {
      const [year, monthNum] = month.split('-').map(Number);
      const prevDate = new Date(year, monthNum - 2, 1);
      const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      const response = await fetch(`/api/wholesale/sales?month=${prevMonth}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.sales)) {
          const formatted: SalesData = {};
          data.sales.forEach((sale: any) => {
            if (!formatted[sale.product_id]) {
              formatted[sale.product_id] = {};
            }
            const day = new Date(sale.sale_date).getUTCDate();
            formatted[sale.product_id][day] = {
              quantity: sale.quantity,
              unit_price: sale.unit_price || 0,
              amount: sale.amount || 0
            };
          });
          setPreviousMonthData(formatted);
        } else {
          setPreviousMonthData({});
        }
      }
    } catch (error) {
      console.error('前月データ取得エラー:', error);
      setPreviousMonthData({});
    }
  };

  // CSV読み込み処理（簡略化）
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
          alert('CSVファイルに「商品名」列が見つかりません。');
          setIsImporting(false);
          return;
        }

        const dayColumns: { [key: string]: number } = {};
        headers.forEach((header, index) => {
          const match = header.match(/^(\d+)日$/);
          if (match) {
            dayColumns[match[1]] = index;
          }
        });

        const importData: any[] = [];

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          const values = line.split(',').map(v => v.trim());
          const productName = values[productNameIndex];
          if (!productName) continue;

          const price = priceIndex !== -1 ? parseInt(values[priceIndex]) || 0 : 0;

          Object.entries(dayColumns).forEach(([day, index]) => {
            const quantity = parseInt(values[index]) || 0;
            if (quantity !== 0) {
              importData.push({
                productName,
                price,
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
          alert(`CSV読み込みが完了しました。\n処理件数: ${result.processed}件`);
          await fetchProducts();
          await fetchSalesData(`${selectedYear}-${selectedMonth}`);
        } else {
          alert(`エラーが発生しました: ${result.error}`);
        }

      } catch (error) {
        console.error('CSV読み込みエラー:', error);
        alert('CSV読み込み中にエラーが発生しました。');
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };

    reader.readAsText(file, 'UTF-8');
  };

  // 月削除処理
  const handleDeleteMonth = async () => {
    const confirmMessage = `${selectedYear}年${selectedMonth}月のデータを全て削除します。\nこの操作は取り消せません。\n\n本当に削除しますか？`;

    if (!confirm(confirmMessage)) {
      return;
    }

    const secondConfirm = prompt(`確認のため「削除」と入力してください。`);
    if (secondConfirm !== '削除') {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/wholesale/sales/delete-month`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: `${selectedYear}-${selectedMonth}` })
      });

      const result = await response.json();

      if (result.success) {
        alert(`${result.deleted}件のデータを削除しました。`);
        await fetchSalesData(`${selectedYear}-${selectedMonth}`);
      } else {
        alert(`エラーが発生しました: ${result.error}`);
      }
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除中にエラーが発生しました。');
    } finally {
      setIsDeleting(false);
    }
  };

  // 売上データ操作関数
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
      await saveSalesData(productId, day);
      (e.target as HTMLInputElement).blur();
    }
  };

  const getDaysInMonth = () => {
    if (!selectedYear || !selectedMonth) return new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    return new Date(parseInt(selectedYear), parseInt(selectedMonth), 0).getDate();
  };

  // 合計計算（wholesale_salesのamountを直接使用）
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

    const product = products.find(p => p.id === productId);
    const profitRate = product?.profit_rate || 0;
    const totalProfit = Math.round(totalAmount * profitRate / 100);

    return { totalQuantity, totalAmount, totalProfit };
  };

  const wholesaleTotal = products.reduce((sum, product) => {
    const { totalAmount } = calculateTotals(product.id);
    return sum + totalAmount;
  }, 0);

  const wholesaleProfit = products.reduce((sum, product) => {
    const { totalProfit } = calculateTotals(product.id);
    return sum + totalProfit;
  }, 0);

  const oemTotal = oemSales.reduce((sum, sale) => sum + sale.amount, 0);
  const grandTotal = wholesaleTotal + oemTotal;



  if (!mounted) {
    return <div className="flex items-center justify-center h-screen bg-gray-50"><p className="text-gray-500">ページを準備しています...</p></div>;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="flex-shrink-0 bg-white shadow-sm border-b z-30">
        {/* 上段：タイトル・年月選択・データ操作 */}
        <div className="px-4 py-2 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">卸販売管理システム</h1>
          <div className="flex items-center gap-3">
            <select
              value={selectedYear}
              onChange={(e) => handleYearChange(e.target.value)}
              className="h-8 px-2 py-1 text-sm rounded-md border border-input bg-background"
              disabled={loading}
            >
              {yearOptions.map(year => <option key={year} value={year}>{year}年</option>)}
            </select>
            <select
              value={selectedMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="h-8 px-2 py-1 text-sm rounded-md border border-input bg-background"
              disabled={loading}
            >
              {monthOptions.map(month => <option key={month} value={month}>{month}月</option>)}
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
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDeleteMonth}
              disabled={loading || isDeleting}
              className="flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {isDeleting ? '削除中...' : '月削除'}
            </Button>
          </div>
        </div>
        {/* 下段：ナビゲーションバー */}
        <div className="px-4 py-1.5 bg-gray-50 border-t flex items-center gap-2">
          <Link href="/wholesale/products">
            <Button size="sm" variant="outline" className="flex items-center gap-1.5 h-7 text-xs">
              <Settings className="w-3.5 h-3.5" />
              商品マスター
            </Button>
          </Link>
          <Link href="/wholesale/oem-customers">
            <Button size="sm" variant="outline" className="flex items-center gap-1.5 h-7 text-xs">
              <Users className="w-3.5 h-3.5" />
              OEM顧客管理
            </Button>
          </Link>
          <Link href={`/wholesale/oem-sales?year=${selectedYear}&month=${selectedMonth}`}>
            <Button size="sm" variant="outline" className="flex items-center gap-1.5 h-7 text-xs bg-green-50 border-green-300 text-green-700 hover:bg-green-100">
              <TrendingUp className="w-3.5 h-3.5" />
              OEM売上入力
            </Button>
          </Link>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><p className="text-gray-500">データを読み込んでいます...</p></div>
        ) : (
          <div className="space-y-4">
            <SummaryCards
              products={products}
              salesData={salesData}
              oemSalesCount={oemSales.length}
              oemTotal={oemTotal}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
            />

            <RankingCards products={products} salesData={salesData} previousMonthData={previousMonthData} />

            <OEMArea
              oemProducts={oemProducts}
              oemSales={oemSales}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
            />

            <ProductStatistics selectedYear={selectedYear} selectedMonth={selectedMonth} />

            <SalesDataTable
              products={products}
              salesData={salesData}
              daysInMonth={getDaysInMonth()}
              onQuantityChange={handleQuantityChange}
              onSave={saveSalesData}
              onInputKeyDown={handleInputKeyDown}
              linkedProductIds={linkedProductIds}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default function WholesaleDashboard() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    }>
      <WholesaleDashboardContent />
    </Suspense>
  );
}
