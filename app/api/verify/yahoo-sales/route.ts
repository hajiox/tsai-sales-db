// /app/api/verify/yahoo-sales/route.ts ver.1
// Yahoo売上検証API（Amazon/楽天統合パターン適用）

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

// Supabase直接初期化
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    console.log('=== Yahoo売上検証API開始 ===');
    
    const { csvData, targetMonth } = await request.json();
    
    if (!csvData || !targetMonth) {
      return NextResponse.json({ 
        success: false, 
        error: 'CSVデータと対象月が必要です' 
      }, { status: 400 });
    }

    console.log(`検証対象月: ${targetMonth}`);

    // 1. CSV解析（Yahoo仕様：CSV、1行目ヘッダー）
    const lines = csvData.split('\n').filter(line => line.trim());
    const dataLines = lines.slice(1); // ヘッダースキップ
    console.log(`CSV行数: ${dataLines.length}行`);

    // 2. 必要データを並行取得
    const [productsResponse, learnedMappingsResponse, dbSalesResponse] = await Promise.all([
      supabase.from('products').select('id, name'),
      supabase.from('yahoo_product_mapping').select('yahoo_title, product_id'),
      supabase
        .from('web_sales_summary')
        .select('product_id, yahoo_count')
        .eq('month', targetMonth)
        .not('yahoo_count', 'is', null)
    ]);

    if (productsResponse.error || learnedMappingsResponse.error || dbSalesResponse.error) {
      throw new Error('データベースからの情報取得に失敗しました');
    }

    const products = productsResponse.data || [];
    const learnedMappings = learnedMappingsResponse.data || [];
    const dbSales = dbSalesResponse.data || [];

    // 3. 学習データ変換（yahoo_title → amazon_title統一）
    const learningData = learnedMappings.map(m => ({ 
      amazon_title: m.yahoo_title,
      product_id: m.product_id 
    }));

    console.log(`商品: ${products.length}件, 学習: ${learningData.length}件, DB売上: ${dbSales.length}件`);

    // 4. CSV商品の解析とマッチング
    const csvProducts = new Map(); // product_id -> quantity

    for (const line of dataLines) {
      const columns = line.split(',').map(col => col.trim().replace(/"/g, ''));
      
      if (columns.length < 6) continue;

      // Yahoo仕様: A列=商品名(0), F列=数量(5)
      const productTitle = columns[0];
      const quantity = parseInt(columns[5]) || 0;

      if (!productTitle || quantity <= 0) continue;

      // 商品マッチング
      const matchResult = findBestMatchSimplified(productTitle, products, learningData);
      
      if (matchResult.product?.id) {
        const productId = matchResult.product.id;
        csvProducts.set(productId, (csvProducts.get(productId) || 0) + quantity);
        console.log(`CSVマッチング: ${productTitle} -> ${matchResult.product.name} (数量: ${quantity})`);
      }
    }

    // 5. DB売上データをMap化
    const dbProducts = new Map();
    dbSales.forEach(sale => {
      dbProducts.set(sale.product_id, sale.yahoo_count || 0);
    });

    // 6. 比較結果生成
    const allProductIds = new Set([...csvProducts.keys(), ...dbProducts.keys()]);
    const comparisonResults = [];

    for (const productId of allProductIds) {
      const csvCount = csvProducts.get(productId) || 0;
      const dbCount = dbProducts.get(productId) || 0;
      const isMatch = csvCount === dbCount;

      const product = products.find(p => p.id === productId);
      
      comparisonResults.push({
        product_id: productId,
        product_name: product?.name || '商品名不明',
        csv_count: csvCount,
        db_count: dbCount,
        difference: csvCount - dbCount,
        is_match: isMatch
      });
    }

    // 7. 結果サマリー
    const totalProducts = comparisonResults.length;
    const matchedProducts = comparisonResults.filter(r => r.is_match).length;
    const mismatchedProducts = totalProducts - matchedProducts;
    const csvTotal = Array.from(csvProducts.values()).reduce((sum, count) => sum + count, 0);
    const dbTotal = Array.from(dbProducts.values()).reduce((sum, count) => sum + count, 0);

    console.log('=== Yahoo売上検証完了 ===');
    console.log(`商品数: ${totalProducts}, 一致: ${matchedProducts}, 不一致: ${mismatchedProducts}`);
    console.log(`CSV合計: ${csvTotal}, DB合計: ${dbTotal}`);

    return NextResponse.json({
      success: true,
      verification_results: comparisonResults,
      summary: {
        total_products: totalProducts,
        matched_products: matchedProducts,
        mismatched_products: mismatchedProducts,
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
