// /app/api/verify/yahoo-sales/route.ts ver.6
// 数量パースの修正版

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

const supabase = createClient(
 process.env.NEXT_PUBLIC_SUPABASE_URL!,
 process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 安全な文字列検証関数
function isValidString(value: any): value is string {
 return value && typeof value === 'string' && value.trim().length > 0;
}

// 引用符付きCSVをパースする関数
function parseCsvLine(line: string): string[] {
 const columns: string[] = [];
 let currentColumn = '';
 let inQuotes = false;
 for (let i = 0; i < line.length; i++) {
   const char = line[i];
   if (char === '"' && inQuotes && line[i + 1] === '"') {
     currentColumn += '"';
     i++;
   } else if (char === '"') {
     inQuotes = !inQuotes;
   } else if (char === ',' && !inQuotes) {
     columns.push(currentColumn.trim());
     currentColumn = '';
   } else {
     currentColumn += char;
   }
 }
 columns.push(currentColumn.trim());
 return columns;
}

export async function POST(request: NextRequest) {
 try {
   console.log('=== Yahoo売上検証API開始 (ver.6) ===');
   
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
   const lines = csvData.split('\n').filter((line: string) => line.trim()).slice(1);

   // データベースからデータを取得
   const [productsResponse, learnedMappingsResponse, dbSalesResponse] = await Promise.all([
     supabase.from('products').select('id, name, series'),
     supabase.from('yahoo_product_mapping').select('yahoo_title, product_id'),
     supabase
       .from('web_sales_summary')
       .select('product_id, yahoo_count')
       .eq('report_month', formattedMonth)
   ]);

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

   // CSVデータを集計
   const csvProducts = new Map<string, number>();
   let unmatchedCount = 0;
   
   for (const line of lines) {
     const columns = parseCsvLine(line);
     if (columns.length < 6) continue;

     const productTitle = columns[0]?.replace(/"/g, '').trim();
     // 修正: "個"を削除してから数値に変換
     const quantityStr = columns[5]?.replace(/"/g, '').trim() || '0';
     const quantity = parseInt(quantityStr.replace('個', ''), 10);

     if (!isValidString(productTitle) || quantity <= 0) continue;
     
     const matchResult = findBestMatchSimplified(productTitle, products, learningData);
     if (matchResult?.id) {
       const productId = matchResult.id;
       csvProducts.set(productId, (csvProducts.get(productId) || 0) + quantity);
     } else {
       unmatchedCount++;
       console.log(`未マッチ商品: ${productTitle}`);
     }
   }

   console.log(`CSVから${csvProducts.size}商品を集計。未マッチ: ${unmatchedCount}件`);

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
