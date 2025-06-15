'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Supabase RPC関数の戻り値型を明確に定義
type SupabaseRpcResult = {
 id: string;
 product_id: string;
 product_name: string;
 series_name: string;
 product_number: number;  // 商品番号を追加
 price: number;
 amazon_count: number;
 rakuten_count: number;
 yahoo_count: number;
 mercari_count: number;
 base_count: number;
 qoo10_count: number;
};

// フロント側で使用する型
type Row = {
 id: string | null;
 product_id: string;
 product_name: string;
 series_name: string;
 product_number: number;  // 商品番号を追加
 price: number;
 amazon_count: number;
 rakuten_count: number;
 yahoo_count: number;
 mercari_count: number;
 base_count: number;
 qoo10_count: number;
};

const WebSalesInputView = () => {
 const [rows, setRows] = useState<Row[]>([]);
 const [loading, setLoading] = useState(false);
 const [ym, setYm] = useState('2025-04');
 const [error, setError] = useState<string | null>(null);

 const load = async (month: string) => {
   setLoading(true);
   setError(null);
   
   try {
     console.log(`Loading data for month: ${month}`);
     
     // 型を明示してRPC関数を呼び出し
     const { data, error } = await supabase
       .rpc('web_sales_full_month', { 
         target_month: month 
       })
       .returns<SupabaseRpcResult[]>();

     if (error) {
       console.error('Supabase RPC Error:', error);
       throw new Error(`Supabase RPC Error: ${error.message} (Code: ${error.code})`);
     }

     console.log(`Received ${data?.length || 0} rows from RPC function`);
     console.log('First 3 rows of raw data:', data?.slice(0, 3));
     
     // 販売数が0以外のデータをカウント
     const nonZeroSales = data?.filter(item => 
       (item.amazon_count || 0) + (item.rakuten_count || 0) + (item.yahoo_count || 0) + 
       (item.mercari_count || 0) + (item.base_count || 0) + (item.qoo10_count || 0) > 0
     );
     console.log(`Non-zero sales rows: ${nonZeroSales?.length || 0}`);

     if (!data) {
       setRows([]);
       return;
     }

     // データの変換と型安全性の確保
     const mapped: Row[] = data.map((item: SupabaseRpcResult, index: number) => {
       try {
         return {
           id: item.id || null,
           product_id: String(item.product_id || ''),
           product_name: String(item.product_name || ''),
           series_name: String(item.series_name || ''),
           product_number: Number(item.product_number) || 0,
           price: Number(item.price) || 0,
           amazon_count: Number(item.amazon_count) || 0,
           rakuten_count: Number(item.rakuten_count) || 0,
           yahoo_count: Number(item.yahoo_count) || 0,
           mercari_count: Number(item.mercari_count) || 0,
           base_count: Number(item.base_count) || 0,
           qoo10_count: Number(item.qoo10_count) || 0,
         };
       } catch (mappingError) {
         console.error(`Error mapping row ${index}:`, mappingError, item);
         throw new Error(`データの変換に失敗しました (行 ${index + 1})`);
       }
     });

     setRows(mapped);
     console.log(`Successfully mapped ${mapped.length} rows`);

   } catch (e: any) {
     const errorMessage = e.message || 'データの読み込みに失敗しました';
     setError(errorMessage);
     console.error('Load error details:', {
       error: e,
       month,
       timestamp: new Date().toISOString()
     });
     setRows([]);
   } finally {
     setLoading(false);
   }
 };

 useEffect(() => {
   load(ym);
 }, [ym]);

 // 合計値を計算
 const grandTotal = rows.reduce((sum, row) => {
   const totalCount = row.amazon_count + row.rakuten_count + row.yahoo_count + 
                     row.mercari_count + row.base_count + row.qoo10_count;
   return sum + (totalCount * row.price);
 }, 0);

 const grandTotalCount = rows.reduce((sum, row) => {
   return sum + row.amazon_count + row.rakuten_count + row.yahoo_count + 
          row.mercari_count + row.base_count + row.qoo10_count;
 }, 0);

 return (
   <div className="p-6 space-y-4">
     <div className="flex items-center gap-4">
       <div className="flex items-center gap-2">
         <label className="font-medium">対象月:</label>
         <input
           type="month"
           value={ym}
           onChange={(e) => setYm(e.target.value)}
           className="border rounded px-3 py-2"
           disabled={loading}
         />
       </div>
       <button
         onClick={() => load(ym)}
         disabled={loading}
         className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded transition-colors"
       >
         {loading ? '読み込み中...' : '再読み込み'}
       </button>
       <div className="text-sm text-gray-600">
         {rows.length > 0 && `${rows.length}件のデータを表示中`}
       </div>
     </div>

     {/* エラー表示 */}
     {error && (
       <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
         <strong>エラー:</strong> {error}
       </div>
     )}

     {/* ローディング表示 */}
     {loading && (
       <div className="text-center py-8">
         <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
         <p className="mt-2 text-gray-600">データを読み込んでいます...</p>
       </div>
     )}

     {/* サマリー表示 */}
     {!loading && rows.length > 0 && (
       <div className="bg-gray-100 p-4 rounded">
         <div className="grid grid-cols-3 gap-4 text-sm">
           <div>
             <span className="font-medium">商品数:</span> {rows.length}件
           </div>
           <div>
             <span className="font-medium">総販売数:</span> {grandTotalCount.toLocaleString()}個
           </div>
           <div>
             <span className="font-medium">総売上:</span> ¥{grandTotal.toLocaleString()}
           </div>
         </div>
       </div>
     )}

     {/* メインテーブル */}
     {!loading && (
       <div className="overflow-x-auto">
         <table className="w-full border-collapse border text-sm">
           <thead>
             <tr className="bg-gray-100">
               <th className="border px-2 py-2 text-left">商品名</th>
               <th className="border px-2 py-2 text-center">シリーズ</th>
               <th className="border px-2 py-2 text-center">商品番号</th>
               <th className="border px-2 py-2 text-right">単価</th>
               <th className="border px-2 py-2 text-right">Amazon</th>
               <th className="border px-2 py-2 text-right">楽天</th>
               <th className="border px-2 py-2 text-right">Yahoo!</th>
               <th className="border px-2 py-2 text-right">メルカリ</th>
               <th className="border px-2 py-2 text-right">BASE</th>
               <th className="border px-2 py-2 text-right">Qoo10</th>
               <th className="border px-2 py-2 text-right">合計数</th>
               <th className="border px-2 py-2 text-right">売上</th>
             </tr>
           </thead>
           <tbody>
             {rows.length === 0 ? (
               <tr>
                 <td colSpan={12} className="border px-4 py-8 text-center text-gray-500">
                   選択した月のデータがありません
                 </td>
               </tr>
             ) : (
               rows.map((r, i) => {
                 const total_count =
                   r.amazon_count +
                   r.rakuten_count +
                   r.yahoo_count +
                   r.mercari_count +
                   r.base_count +
                   r.qoo10_count;
                 const total_price = total_count * r.price;

                 return (
                   <tr key={r.id || r.product_id || i} className="hover:bg-gray-50">
                     <td className="border px-2 py-1">{r.product_name}</td>
                     <td className="border px-2 py-1 text-center">{r.series_name}</td>
                     <td className="border px-2 py-1 text-center">{r.product_number}</td>
                     <td className="border px-2 py-1 text-right">¥{r.price.toLocaleString()}</td>
                     <td className="border px-2 py-1 text-right">{r.amazon_count}</td>
                     <td className="border px-2 py-1 text-right">{r.rakuten_count}</td>
                     <td className="border px-2 py-1 text-right">{r.yahoo_count}</td>
                     <td className="border px-2 py-1 text-right">{r.mercari_count}</td>
                     <td className="border px-2 py-1 text-right">{r.base_count}</td>
                     <td className="border px-2 py-1 text-right">{r.qoo10_count}</td>
                     <td className="border px-2 py-1 text-right font-semibold">
                       {total_count}
                     </td>
                     <td className="border px-2 py-1 text-right font-semibold">
                       ¥{total_price.toLocaleString()}
                     </td>
                   </tr>
                 );
               })
             )}
           </tbody>
         </table>
       </div>
     )}
   </div>
 );
};

export default WebSalesInputView;
