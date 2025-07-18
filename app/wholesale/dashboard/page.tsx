// /app/wholesale/dashboard/page.tsx ver.34 価格履歴機能追加版
"use client"

export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { useState, useEffect, KeyboardEvent, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Users, TrendingUp, FileText, Upload, Trash2, Settings, History, Calendar } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import SummaryCards from '@/components/wholesale/summary-cards';
import RankingCards from '@/components/wholesale/ranking-cards';
import OEMArea from '@/components/wholesale/oem-area';
import { createClient } from '@supabase/supabase-js';

// Supabaseクライアントの初期化
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// インターフェース定義は同じ
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

// 過去価格データの型定義
interface HistoricalPriceData {
  product_id: string;
  product_name: string;
  current_price: number;
  historical_price: number;
  total_quantity: number;
  current_amount: number;
  historical_amount: number;
  price_difference: number;
}

// 価格変更日の型定義
interface PriceChangeDate {
  change_date: string;
  product_count: number;
}

// メインコンポーネントを分離
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
   
   // 年のオプション（過去3年分）
   const years: string[] = [];
   for (let i = 0; i < 3; i++) {
     years.push(String(now.getFullYear() - i));
   }
   setYearOptions(years);
   
   // 月のオプション
   const months: string[] = [];
   for (let i = 1; i <= 12; i++) {
     months.push(String(i).padStart(2, '0'));
   }
   setMonthOptions(months);
   
   // URLパラメータから年月を取得、なければ現在の年月を使用
   const urlYear = searchParams.get('year') || String(now.getFullYear());
   const urlMonth = searchParams.get('month') || String(now.getMonth() + 1).padStart(2, '0');
   
   setSelectedYear(urlYear);
   setSelectedMonth(urlMonth);
 }, [mounted, searchParams]);

 // 年月が変更されたときにURLを更新
 const updateURL = (year: string, month: string) => {
   if (year && month) {
     router.push(`/wholesale/dashboard?year=${year}&month=${month}`);
   }
 };

 // 年の選択が変更されたとき
 const handleYearChange = (year: string) => {
   setSelectedYear(year);
   updateURL(year, selectedMonth);
 };

 // 月の選択が変更されたとき
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

 // 価格変更日付の取得
 const fetchPriceChangeDates = async () => {
   try {
     const { data, error } = await supabase
       .from('wholesale_product_price_history')
       .select('valid_from, product_id')
       .order('valid_from', { ascending: false });
     
     if (error) throw error;
     
     // 日付ごとにグループ化
     const dateMap = new Map<string, Set<string>>();
     data?.forEach(item => {
       const date = new Date(item.valid_from).toISOString().split('T')[0];
       if (!dateMap.has(date)) {
         dateMap.set(date, new Set());
       }
       dateMap.get(date)?.add(item.product_id);
     });
     
     // 最新5件の日付を取得
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

 // 特定日付の価格で表示
 const showPriceAtDate = async (date: string) => {
   setLoadingHistorical(true);
   setSelectedHistoryDate(date);
   try {
     const { data: historicalData, error } = await supabase.rpc(
       'calculate_wholesale_sales_with_historical_prices',
       { 
         target_month: `${selectedYear}-${selectedMonth}`,
         target_date: date
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

 // 過去価格データの取得
 const fetchHistoricalPrices = async () => {
   setLoadingHistorical(true);
   try {
     const { data: historicalData, error } = await supabase.rpc(
       'calculate_wholesale_sales_with_historical_prices',
       { target_month: `${selectedYear}-${selectedMonth}` }
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

 // 過去価格モードの切り替え
 const toggleHistoricalMode = () => {
   if (!isHistoricalMode && historicalPriceData.length === 0) {
     fetchHistoricalPrices();
   }
   setIsHistoricalMode(!isHistoricalMode);
   setSelectedHistoryDate(null);
 };

 const formatDate = (dateString: string) => {
   const date = new Date(dateString);
   return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
 };

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
   
   // 過去価格モードの場合は履歴価格を使用
   let price = 0;
   if (isHistoricalMode || selectedHistoryDate) {
     const historicalProduct = historicalPriceData.find(p => p.product_id === productId);
     price = historicalProduct?.historical_price || 0;
   } else {
     const product = products.find(p => p.id === productId);
     price = product?.price || 0;
   }
   
   const totalAmount = totalQuantity * price;
   return { totalQuantity, totalAmount };
 };

 // 価格差分の表示用関数
 const getPriceDifference = (productId: string) => {
   if (!isHistoricalMode && !selectedHistoryDate) return null;
   const historicalProduct = historicalPriceData.find(p => p.product_id === productId);
   if (!historicalProduct) return null;
   
   const diff = historicalProduct.price_difference;
   const percent = historicalProduct.current_price > 0 
     ? (diff / historicalProduct.current_price * 100).toFixed(1)
     : '0';
   
   return { diff, percent };
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
             oemProducts={oemProducts}
             oemSalesCount={oemSales.length}
             wholesaleTotal={wholesaleTotal}
             oemTotal={oemTotal}
             grandTotal={grandTotal} 
           />
           <RankingCards products={products} salesData={salesData} previousMonthData={previousMonthData} />
           
           {/* 過去価格表示モードボタンと価格変更履歴 */}
           <div className="flex items-center gap-2 flex-wrap">
             <button
               onClick={toggleHistoricalMode}
               disabled={loadingHistorical}
               className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                 isHistoricalMode && !selectedHistoryDate
                   ? 'bg-amber-600 text-white hover:bg-amber-700' 
                   : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
               } ${loadingHistorical ? 'opacity-50 cursor-not-allowed' : ''}`}
             >
               <History className="h-4 w-4" />
               {loadingHistorical ? '読み込み中...' : isHistoricalMode && !selectedHistoryDate ? '過去価格表示中' : '過去価格で表示'}
             </button>
             
             {/* 価格変更日付ボタン */}
             {priceChangeDates.map((dateInfo) => (
               <button
                 key={dateInfo.change_date}
                 onClick={() => showPriceAtDate(dateInfo.change_date)}
                 disabled={loadingHistorical}
                 className={`flex items-center gap-1 px-3 py-2 rounded-md text-sm transition-colors ${
                   selectedHistoryDate === dateInfo.change_date
                     ? 'bg-blue-600 text-white hover:bg-blue-700'
                     : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                 } ${loadingHistorical ? 'opacity-50 cursor-not-allowed' : ''}`}
                 title={`${dateInfo.product_count}商品の価格変更`}
               >
                 <Calendar className="h-3 w-3" />
                 {formatDate(dateInfo.change_date)}
               </button>
             ))}
             
             {/* 履歴の管理ボタン */}
             <button
               onClick={() => router.push('/wholesale/price-history')}
               className="flex items-center gap-1 px-3 py-2 bg-gray-600 text-white rounded-md text-sm hover:bg-gray-700"
             >
               <History className="h-4 w-4" />
               履歴の管理
             </button>
           </div>
           
           {(isHistoricalMode || selectedHistoryDate) && historicalPriceData.length > 0 && (
             <div className="text-sm text-amber-600 font-medium">
               ※ 売上金額は{selectedHistoryDate ? formatDate(selectedHistoryDate) : `${selectedYear}年${selectedMonth}月1日`}時点の価格で計算されています
             </div>
           )}

           <OEMArea 
             oemProducts={oemProducts} 
             oemSales={oemSales}
             selectedYear={selectedYear}
             selectedMonth={selectedMonth}
           />

           <Card>
             <CardHeader className="py-2 px-4 border-b">
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
             <CardContent className="p-0">
               <table className="w-full text-xs border-collapse">
                 <thead>
                   <tr className="bg-gray-100 border-b">
                     <th className="p-2 text-left font-semibold text-gray-700 min-w-[180px] border-r">商品情報</th>
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
                   ) : products.map((product, productIndex) => {
                     const { totalQuantity, totalAmount } = calculateTotals(product.id);
                     const priceDiff = getPriceDifference(product.id);
                     const rows = [];
                     
                     // 10商品ごとに日付ヘッダーを挿入
                     if (productIndex > 0 && productIndex % 10 === 0) {
                       rows.push(
                         <tr key={`date-header-${productIndex}`} className="bg-gray-100 border-t-2 border-gray-400">
                           <td className="p-1 text-center font-semibold text-gray-600 border-r">（日付）</td>
                           {Array.from({ length: getDaysInMonth() }, (_, i) => (
                             <td key={i + 1} className="p-1 text-center font-semibold text-gray-600 text-xs border-l">{i + 1}</td>
                           ))}
                         </tr>
                       );
                     }
                     
                     rows.push(
                       <tr key={product.id} className="border-b hover:bg-gray-50">
                         <td className="p-2 border-r">
                           <div className="w-[160px]">
                             <div className="font-medium text-gray-900 break-words">{product.product_name}</div>
                             <div className="text-xs text-gray-600 mt-1">
                               <span>卸価格: ¥{product.price.toLocaleString()}</span>
                               {priceDiff && (
                                 <span className={`ml-2 font-semibold ${priceDiff.diff > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                   {priceDiff.diff > 0 ? '↑' : '↓'} {Math.abs(priceDiff.diff).toLocaleString()} ({priceDiff.percent}%)
                                 </span>
                               )}
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
                     
                     return rows;
                   })}
                 </tbody>
               </table>
             </CardContent>
           </Card>
         </div>
       )}
     </main>
   </div>
 );
}

// Suspenseでラップしたメインコンポーネント
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
