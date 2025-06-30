// /app/api/verify/yahoo-sales/route.ts ver.4
// データ取得時の安全チェックを追加した最終版

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ★★★ 修正点1: 安全な文字列検証関数を追加 ★★★
function isValidString(value: any): value is string {
  return value && typeof value === 'string' && value.trim().length > 0;
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== Yahoo売上検証API開始 (ver.4) ===');
    
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

    // ★★★ 修正点2: 取得したデータに安全チェックを適用 ★★★
    const products = (productsResponse.data || []).filter(p => p && isValidString(p.name));
    const learningData = (learnedMappingsResponse.data || []).filter(l => l && isValidString(l.yahoo_title));
    const dbSales = dbSalesResponse.data || [];

    console.log(`有効な商品: ${products.length}件, 有効な学習データ: ${learningData.length}件, DB売上: ${dbSales.length}件`);

    const csvProducts = new Map<string, number>();
    for (const line of lines) {
      const columns = line.split(',').map(col => col.trim().replace(/"/g, ''));
      if (columns.length < 6) continue;

      const productTitle = columns[0];
      const quantity = parseInt(columns[5]) || 0;

      if (!isValidString(productTitle) || quantity <= 0) continue;
      
      const matchResult = findBestMatchSimplified(productTitle, products, learningData);
      if (matchResult?.id) {
        const productId = matchResult.id;
        csvProducts.set(productId, (csvProducts.get(productId) || 0) + quantity);
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
