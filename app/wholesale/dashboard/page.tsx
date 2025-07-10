// /app/wholesale/dashboard/page.tsx ver.28 OEMサマリー表示版
"use client"

export const dynamic = 'force-dynamic';

import { useState, useEffect, KeyboardEvent, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Users, TrendingUp, FileText, Upload, Trash2, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import SummaryCards from '@/components/wholesale/summary-cards';
import RankingCards from '@/components/wholesale/ranking-cards';
import OEMSummary from '@/components/wholesale/oem-summary';

interface Product {
  id: string;
  product_name: string;
  price: number;
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
  [productId: string]: { [date: string]: number | undefined; };
}

export default function WholesaleDashboard() {
  const router = useRouter();
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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const now = new Date();
    
    // 年のオプション（過去3年分）
    const years: string[] = [];
    for (let i = 0; i < 3; i++) {
      years.push(String(now.getFullYear() - i));
    }
    setYearOptions(years);
    setSelectedYear(String(now.getFullYear()));
    
    // 月のオプション
    const months: string[] = [];
    for (let i = 1; i <= 12; i++) {
      months.push(String(i).padStart(2, '0'));
    }
    setMonthOptions(months);
    setSelectedMonth(String(now.getMonth() + 1).padStart(2, '0'));
  }, [mounted]);

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
  };

  const fetchOemProducts = async () => {
    try {
      const response = await fetch('/api/wholesale/oem-products');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setOemProducts(data);
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
            formatted[sale.product_id][day] = sale.quantity;
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
      const response = await fetch(`/api/wholesale/oem-sales?month=${month}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.sales)) {
          setOemSales(data.sales);
        } else {
          setOemSales([]);
        }
      }
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
            formatted[sale.product_id][day] = sale.quantity;
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
            if (quantity > 0) {
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

  const handleQuantityChange = (productId: string, day: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    setSalesData(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [day]: value === '' ? undefined : parseInt(value, 10),
      }
    }));
  };

  const saveSalesData = async (productId: string, day: number) => {
    const quantity = salesData[productId]?.[day] || 0;
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

  const calculateTotals = (productId: string) => {
    const sales = salesData[productId] || {};
    const totalQuantity = Object.values(sales).reduce((sum, qty) => sum + (qty || 0), 0);
    const product = products.find(p => p.id === productId);
    const totalAmount = totalQuantity * (product?.price || 0);
    return { totalQuantity, totalAmount };
  };

  // 卸商品の合計金額
  const wholesaleTotal = products.reduce((sum, product) => {
    const { totalAmount } = calculateTotals(product.id);
    return sum + totalAmount;
  }, 0);

  // OEM商品の合計金額（売上データから直接計算）
  const oemTotal = oemSales.reduce((sum, sale) => sum + sale.amount, 0);

  // 総合計金額
  const grandTotal = wholesaleTotal + oemTotal;

  if (!mounted) {
    return <div className="flex items-center justify-center h-screen bg-gray-50"><p className="text-gray-500">ページを準備しています...</p></div>;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="flex-shrink-0 bg-white shadow-sm border-b z-30">
        <div className="px-4 py-2 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">卸販売管理システム</h1>
          <div className="flex items-center gap-3">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="h-8 px-2 py-1 text-sm rounded-md border border-input bg-background"
              disabled={loading}
            >
              {yearOptions.map(year => <option key={year} value={year}>{year}年</option>)}
            </select>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-8 px-2 py-1 text-sm rounded-md border border-input bg-background"
              disabled={loading}
            >
              {monthOptions.map(month => <option key={month} value={month}>{month}月</option>)}
            </select>
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
      </header>

      <main className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><p className="text-gray-500">データを読み込んでいます...</p></div>
        ) : (
          <>
            <div className="flex-shrink-0 space-y-4">
              <SummaryCards 
                products={products} 
                oemProducts={oemProducts}
                wholesaleTotal={wholesaleTotal}
                oemTotal={oemTotal}
                grandTotal={grandTotal} 
              />
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <RankingCards products={products} salesData={salesData} previousMonthData={previousMonthData} />
                </div>
                <div className="col-span-1">
                  <OEMSummary oemProducts={oemProducts} oemSales={oemSales} />
                </div>
              </div>
            </div>

            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardHeader className="flex-shrink-0 py-2 px-4 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> 日別売上実績
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push('/wholesale/products')}
                      className="flex items-center gap-2"
                    >
                      <Settings className="w-4 h-4" />
                      卸商品管理
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push('/wholesale/oem-products')}
                      className="flex items-center gap-2"
                    >
                      <Settings className="w-4 h-4" />
                      OEM商品管理
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto p-0">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-gray-100">
                    <tr className="border-b">
                      <th className="sticky left-0 bg-gray-100 z-20 p-2 text-left font-semibold text-gray-700 min-w-[180px] border-r">商品情報</th>
                      {Array.from({ length: getDaysInMonth() }, (_, i) => (
                        <th key={i + 1} className="p-1 text-center font-semibold text-gray-600 min-w-[40px] border-l">{i + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products.length === 0 ? (
                      <tr>
                        <td colSpan={getDaysInMonth() + 1} className="text-center py-10 text-gray-500">商品データがありません。</td>
                      </tr>
                    ) : products.map(product => {
                      const { totalQuantity, totalAmount } = calculateTotals(product.id);
                      return (
                        <tr key={product.id} className="border-b hover:bg-gray-50">
                          <td className="sticky left-0 bg-white hover:bg-gray-50 z-20 p-2 border-r">
                            <div className="w-[160px]">
                              <div className="font-medium text-gray-900 break-words">{product.product_name}</div>
                              <div className="text-xs text-gray-600 mt-1">
                                <span>卸価格: ¥{product.price.toLocaleString()}</span>
                                <span className="font-semibold text-blue-600 ml-2">合計: {totalQuantity}</span>
                              </div>
                              <div className="text-xs text-gray-600 font-semibold text-green-600">
                                <span>金額: ¥{totalAmount.toLocaleString()}</span>
                              </div>
                            </div>
                          </td>
                          {Array.from({ length: getDaysInMonth() }, (_, i) => {
                            const day = i + 1;
                            const value = salesData[product.id]?.[day];
                            return (
                              <td key={day} className="text-center p-0 border-l">
                                <input
                                  type="text"
                                  pattern="\d*"
                                  value={value ?? ''}
                                  onChange={(e) => handleQuantityChange(product.id, day, e.target.value)}
                                  onBlur={() => saveSalesData(product.id, day)}
                                  onKeyDown={(e) => handleInputKeyDown(e, product.id, day)}
                                  className="w-full h-full text-center p-1 bg-transparent border-0 focus:bg-blue-100 focus:ring-1 focus:ring-blue-400 focus:outline-none"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
