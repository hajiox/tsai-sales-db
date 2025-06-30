// /app/api/verify/yahoo-sales/route.ts ver.3
// 文字コード自動判定機能を追加した最終版

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    console.log('=== Yahoo売上検証API開始 (ver.3) ===');
    
    // FormDataからデータを取得
    const formData = await request.formData();
    const csvFile = formData.get('csvFile') as File;
    const targetMonth = formData.get('targetMonth') as string;

    if (!csvFile || !targetMonth) {
      return NextResponse.json({ success: false, error: 'CSVファイルと対象月が必要です' }, { status: 400 });
    }

    // 文字コードを自動判定してCSVデータを取得
    const buffer = await csvFile.arrayBuffer();
    const decoder = new TextDecoder('utf-8');
    let csvData;
    try {
      // UTF-8でデコードを試みる
      csvData = decoder.decode(buffer, { fatal: true });
    } catch (error) {
      // 失敗したらShift-JISでデコードする
      console.log('UTF-8デコード失敗, Shift-JISで再試行');
      const sjisDecoder = new TextDecoder('shift-jis');
      csvData = sjisDecoder.decode(buffer);
    }
    
    const formattedMonth = targetMonth.includes('-01') ? targetMonth : `${targetMonth}-01`;

    const lines = csvData.split('\n').filter((line: string) => line.trim()).slice(1);

    const [productsResponse, learnedMappingsResponse, dbSalesResponse] = await Promise.all([
      supabase.from('products').select('id, name'),
      supabase.from('yahoo_product_mapping').select('yahoo_title, product_id'),
      supabase
        .from('web_sales_summary')
        .select('product_id, yahoo_count')
        .eq('report_month', formattedMonth)
        .not('yahoo_count', 'is', null)
    ]);

    if (dbSalesResponse.error) throw new Error(`DB売上データの取得に失敗: ${dbSalesResponse.error.message}`);
    if (productsResponse.error) throw new Error(`商品データの取得に失敗: ${productsResponse.error.message}`);
    if (learnedMappingsResponse.error) throw new Error(`学習データの取得に失敗: ${learnedMappingsResponse.error.message}`);

    const products = productsResponse.data || [];
    const learningData = learnedMappingsResponse.data || [];
    const dbSales = dbSalesResponse.data || [];

    const csvProducts = new Map();
    for (const line of lines) {
      const columns = line.split(',').map(col => col.trim().replace(/"/g, ''));
      if (columns.length < 6) continue;
      const productTitle = columns[0];
      const quantity = parseInt(columns[5]) || 0;
      if (!productTitle || quantity <= 0) continue;
      
      const matchResult = findBestMatchSimplified(productTitle, products, learningData);
      if (matchResult?.id) {
        csvProducts.set(matchResult.id, (csvProducts.get(matchResult.id) || 0) + quantity);
      }
    }

    const dbProducts = new Map(dbSales.map(sale => [sale.product_id, sale.yahoo_count || 0]));
    const allProductIds = new Set([...csvProducts.keys(), ...dbProducts.keys()]);
    const comparisonResults = [];

    for (const productId of allProductIds) {
      const csvCount = csvProducts.get(productId) || 0;
      const dbCount = dbProducts.get(productId) || 0;
      const product = products.find(p => p.id === productId);
      comparisonResults.push({
        product_id: productId,
        product_name: product?.name || '商品名不明',
        csv_count: csvCount,
        db_count: dbCount,
        difference: csvCount - dbCount,
        is_match: csvCount === dbCount
      });
    }

    const csvTotal = Array.from(csvProducts.values()).reduce((sum, count) => sum + count, 0);
    const dbTotal = Array.from(dbProducts.values()).reduce((sum, count) => sum + count, 0);

    return NextResponse.json({
      success: true,
      verification_results: comparisonResults.sort((a, b) => (a.product_name || '').localeCompare(b.product_name || '')),
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
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '検証処理でエラーが発生しました' }, { status: 500 });
  }
}
