// /app/api/verify/yahoo-sales/route.ts ver.12
// 日付フォーマット確認版

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

const supabase = createClient(
 process.env.NEXT_PUBLIC_SUPABASE_URL!,
 process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isValidString(value: any): value is string {
 return value && typeof value === 'string' && value.trim().length > 0;
}

export async function POST(request: NextRequest) {
 try {
   console.log('=== Yahoo売上検証API開始 (ver.12) ===');
   
   const formData = await request.formData();
   const csvFile = formData.get('csvFile') as File;
   const targetMonth = formData.get('targetMonth') as string;

   if (!csvFile || !targetMonth) {
     return NextResponse.json({ success: false, error: 'CSVファイルと対象月が必要です' }, { status: 400 });
   }

   const buffer = await csvFile.arrayBuffer();
   let csvData;
   try {
     csvData = new TextDecoder('utf-8').decode(buffer, { fatal: true });
   } catch (error) {
     csvData = new TextDecoder('shift-jis').decode(buffer);
   }
   
   const formattedMonth = targetMonth.includes('-01') ? targetMonth : `${targetMonth}-01`;
   console.log(`対象月: ${targetMonth} → フォーマット後: ${formattedMonth}`);
   
   const lines = csvData.split('\n').slice(1).filter((line: string) => line.trim() !== '');

   // データベースからデータを取得
   const [productsResponse, learnedMappingsResponse, dbSalesResponse] = await Promise.all([
     supabase.from('products').select('id, name, series'),
     supabase.from('yahoo_product_mapping').select('yahoo_title, product_id'),
     supabase
       .from('web_sales_summary')
       .select('product_id, yahoo_count')
       .eq('report_month', formattedMonth)
   ]);

   console.log(`DBクエリ結果: ${dbSalesResponse.data?.length || 0}件`);
   if (dbSalesResponse.data && dbSalesResponse.data.length > 0) {
     console.log(`最初のレコード:`, dbSalesResponse.data[0]);
   }

   if (dbSalesResponse.error) throw new Error(`DB売上データの取得に失敗: ${dbSalesResponse.error.message}`);
   if (productsResponse.error) throw new Error(`商品データの取得に失敗: ${productsResponse.error.message}`);
   if (learnedMappingsResponse.error) throw new Error(`学習データの取得に失敗: ${learnedMappingsResponse.error.message}`);

   const products = productsResponse.data || [];
   const learningData = (learnedMappingsResponse.data || []).map(m => ({ 
     amazon_title: m.yahoo_title, 
     product_id: m.product_id 
   }));
   const dbSales = dbSalesResponse.data || [];

   console.log(`商品マスタ: ${products.length}件, 学習データ: ${learningData.length}件, DB売上: ${dbSales.length}件`);

   // デバッグ: 最初の3行をテスト
   for (let i = 0; i < lines.length && i < 3; i++) {
     const columns = lines[i].split(',').map((col: string) => col.trim().replace(/"/g, ''));
     if (columns.length < 6) continue;
     
     const productTitle = columns[0];
     const quantity = parseInt(columns[5], 10) || 0;
     
     console.log(`=== テスト行${i + 1} ===`);
     console.log(`CSV商品名: "${productTitle}"`);
     console.log(`数量: ${quantity}`);
     
     if (productTitle && quantity > 0) {
       const matchResult = findBestMatchSimplified(productTitle, products, learningData);
       console.log(`マッチ結果: ${matchResult ? matchResult.name : '未マッチ'}`);
       console.log(`マッチタイプ: ${matchResult ? matchResult.matchType : '-'}`);
     }
   }

   // CSVデータを集計
   const csvProducts = new Map<string, number>();
   let unmatchedCount = 0;
   let matchedCount = 0;
   
   for (let i = 0; i < lines.length; i++) {
     const columns = lines[i].split(',').map((col: string) => col.trim().replace(/"/g, ''));
     if (columns.length < 6) continue;

     const productTitle = columns[0];
     const quantity = parseInt(columns[5], 10) || 0;

     if (!isValidString(productTitle) || quantity <= 0) continue;
     
     const matchResult = findBestMatchSimplified(productTitle, products, learningData);
     if (matchResult?.id) {
       const productId = matchResult.id;
       csvProducts.set(productId, (csvProducts.get(productId) || 0) + quantity);
       matchedCount++;
     } else {
       unmatchedCount++;
       if (unmatchedCount <= 5) {
         console.log(`未マッチ商品: ${productTitle} (数量: ${quantity})`);
       }
     }
   }

   console.log(`CSVマッチング結果: マッチ${matchedCount}件、未マッチ${unmatchedCount}件`);
   console.log(`CSVから${csvProducts.size}商品を集計`);

   // DBデータを集計
   const dbProducts = new Map<string, number>();
   dbSales.forEach(row => {
     dbProducts.set(row.product_id, row.yahoo_count || 0);
   });

   // 比較結果を作成
   const allProductIds = new Set([...csvProducts.keys(), ...dbProducts.keys()]);
   const comparisonResults = [];

   for (const productId of allProductIds) {
     const csvCount = csvProducts.get(productId) || 0;
     const dbCount = dbProducts.get(productId) || 0;
     const product = products.find(p => p.id === productId);
     
     comparisonResults.push({
       product_id: productId,
       product_name: product?.name || '商品名不明',
       series: product?.series || '未分類',
       csv_count: csvCount,
       db_count: dbCount,
       difference: csvCount - dbCount,
       is_match: csvCount === dbCount
     });
   }

   // シリーズ順でソート
   comparisonResults.sort((a, b) => {
     if (a.series !== b.series) return a.series.localeCompare(b.series);
     return a.product_name.localeCompare(b.product_name);
   });

   const csvTotal = Array.from(csvProducts.values()).reduce((sum, count) => sum + count, 0);
   const dbTotal = Array.from(dbProducts.values()).reduce((sum, count) => sum + count, 0);

   console.log(`最終結果: CSV合計${csvTotal}、DB合計${dbTotal}`);

   return NextResponse.json({
     success: true,
     verification_results: comparisonResults,
     summary: {
       total_products: comparisonResults.length,
       matched_products: comparisonResults.filter(r => r.is_match).length,
       mismatched_products: comparisonResults.filter(r => !r.is_match).length,
       csv_total_quantity: csvTotal,
       db_total_quantity: dbTotal,
       total_difference: csvTotal - dbTotal
     }
   });

 } catch (error) {
   console.error('Yahoo売上検証エラー:', error);
   return NextResponse.json({ 
     success: false, 
     error: error instanceof Error ? error.message : '検証処理でエラーが発生しました' 
   }, { status: 500 });
 }
}
