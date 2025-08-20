// /app/wholesale/dashboard/page.tsx ver.39 利益率履歴対応版
"use client"

export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { useState, useEffect, KeyboardEvent, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Upload, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import SummaryCards from '@/components/wholesale/summary-cards';
import RankingCards from '@/components/wholesale/ranking-cards';
import OEMArea from '@/components/wholesale/oem-area';
import PriceHistoryControls from '@/components/wholesale/price-history-controls';
import SalesDataTable from '@/components/wholesale/sales-data-table';
import ProductStatistics from '@/components/wholesale/product-statistics';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'; // ver.40 (2025-08-19 JST) - browser singleton client

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
 [productId: string]: { [date: string]: number | undefined; };
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

 // 価格履歴関連の状態
 const [isHistoricalMode, setIsHistoricalMode] = useState(false);
 const [historicalPriceData, setHistoricalPriceData] = useState<HistoricalPriceData[]>([]);
 const [loadingHistorical, setLoadingHistorical] = useState(false);
 const [priceChangeDates, setPriceChangeDates] = useState<PriceChangeDate[]>([]);
 const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);

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
   
   const urlYear = searchParams.get('year') || String(now.getFullYear());
   const urlMonth = searchParams.get('month') || String(now.getMonth() + 1).padStart(2, '0');
   
   setSelectedYear(urlYear);
   setSelectedMonth(urlMonth);
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
         fetchPreviousMonthData(`${selectedYear}-${selectedMonth}`),
         fetchPriceChangeDates()
       ]);
     } catch (error) {
       console.error('一括データ取得エラー:', error);
     } finally {
       setLoading(false);
     }
   };
   fetchAllData();
 }, [selectedYear, selectedMonth, mounted]);

 // 価格履歴関連の関数
const fetchPriceChangeDates = async () => {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('wholesale_product_price_history')
       .select('valid_from, product_id')
       .order('valid_from', { ascending: false });
     
     if (error) throw error;
     
     const dateMap = new Map<string, Set<string>>();
     data?.forEach(item => {
       const date = new Date(item.valid_from).toISOString().split('T')[0];
       if (!dateMap.has(date)) {
         dateMap.set(date, new Set());
       }
       dateMap.get(date)?.add(item.product_id);
     });
     
     const dates = Array.from(dateMap.entries())
       .map(([date, products]) => ({
         change_date: date,
         product_count: products.size
       }))
       .slice(0, 5);
     
     setPriceChangeDates(dates);
   } catch (error) {
     console.error('価格変更日付の取得に失敗しました:', error);
   }
 };

const showPriceAtDate = async (date: string) => {
  setLoadingHistorical(true);
  setSelectedHistoryDate(date);
  try {
    const supabase = getSupabaseBrowserClient();
    const { data: historicalData, error } = await supabase.rpc(
      'calculate_wholesale_sales_with_historical_prices',
       { 
         p_month: `${selectedYear}-${selectedMonth}`,
         p_target_date: new Date(date + 'T00:00:00Z').toISOString()
       }
     );
     
     if (error) throw error;
     
     setHistoricalPriceData(historicalData || []);
     setIsHistoricalMode(true);
   } catch (error) {
     console.error('過去価格データの取得に失敗しました:', error);
     alert('過去価格データの取得に失敗しました');
   } finally {
     setLoadingHistorical(false);
   }
 };

const fetchHistoricalPrices = async () => {
  setLoadingHistorical(true);
  try {
    const supabase = getSupabaseBrowserClient();
    const { data: historicalData, error } = await supabase.rpc(
      'calculate_wholesale_sales_with_historical_prices',
      { p_month: `${selectedYear}-${selectedMonth}` }
    );
     
     if (error) throw error;
     
     setHistoricalPriceData(historicalData || []);
   } catch (error) {
     console.error('過去価格データの取得に失敗しました:', error);
     alert('過去価格データの取得に失敗しました');
   } finally {
     setLoadingHistorical(false);
   }
 };

 const toggleHistoricalMode = () => {
   if (!isHistoricalMode && historicalPriceData.length === 0) {
     fetchHistoricalPrices();
   }
   setIsHistoricalMode(!isHistoricalMode);
   setSelectedHistoryDate(null);
 };

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

 // 合計計算（価格・利益率履歴考慮）
 const calculateTotals = (productId: string) => {
   const sales = salesData[productId] || {};
   const totalQuantity = Object.values(sales).reduce((sum, qty) => sum + (qty || 0), 0);
   
   let price = 0;
   let profitRate = 0;
   
   if (isHistoricalMode || selectedHistoryDate) {
     const historicalProduct = historicalPriceData.find(p => p.product_id === productId);
     price = historicalProduct?.historical_price || 0;
     profitRate = historicalProduct?.historical_profit_rate || 0;
   } else {
     const product = products.find(p => p.id === productId);
     price = product?.price || 0;
     profitRate = product?.profit_rate || 0;
   }
   
   const totalAmount = totalQuantity * price;
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

 const formatDate = (dateString: string) => {
   const date = new Date(dateString);
   return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
 };

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
             isHistoricalMode={isHistoricalMode || !!selectedHistoryDate}
             historicalPriceData={historicalPriceData}
           />
           
           <RankingCards products={products} salesData={salesData} previousMonthData={previousMonthData} />
           
           <PriceHistoryControls
             isHistoricalMode={isHistoricalMode}
             selectedHistoryDate={selectedHistoryDate}
             loadingHistorical={loadingHistorical}
             priceChangeDates={priceChangeDates}
             onToggleHistoricalMode={toggleHistoricalMode}
             onShowPriceAtDate={showPriceAtDate}
           />
           
           {(isHistoricalMode || selectedHistoryDate) && historicalPriceData.length > 0 && (
             <div className="text-sm text-amber-600 font-medium">
               ※ 売上金額・利益は{selectedHistoryDate ? formatDate(selectedHistoryDate) : `${selectedYear}年${selectedMonth}月1日`}時点の価格・利益率で計算されています
             </div>
           )}

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
             isHistoricalMode={isHistoricalMode}
             selectedHistoryDate={selectedHistoryDate}
             historicalPriceData={historicalPriceData}
             daysInMonth={getDaysInMonth()}
             onQuantityChange={handleQuantityChange}
             onSave={saveSalesData}
             onInputKeyDown={handleInputKeyDown}
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
