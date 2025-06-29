// /app/api/import/yahoo-parse/route.ts ver.1
// Yahoo CSV解析API（楽天パターンベース・CSV形式対応）

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
    console.log('=== Yahoo CSV解析API開始 ===');
    
    const { csvData } = await request.json();
    
    if (!csvData) {
      return NextResponse.json({ 
        success: false, 
        error: 'CSVデータが必要です' 
      }, { status: 400 });
    }

    // 1. CSVを行に分割（Yahoo：1行目ヘッダー）
    const lines = csvData.split('\n').filter(line => line.trim());
    console.log(`CSVファイル: ${lines.length}行（ヘッダー含む）`);
    
    if (lines.length < 2) {
      return NextResponse.json({ 
        success: false, 
        error: 'データが不足しています' 
      }, { status: 400 });
    }

    // 2. ヘッダーをスキップしてデータ行を処理
    const dataLines = lines.slice(1);
    console.log(`データ行数: ${dataLines.length}行`);

    // 3. 商品データと学習データを並行取得
    const [productsResponse, learnedMappingsResponse] = await Promise.all([
      supabase.from('products').select('id, name'),
      supabase.from('yahoo_product_mapping').select('yahoo_title, product_id')
    ]);

    if (productsResponse.error) {
      console.error('商品データ取得エラー:', productsResponse.error);
      throw new Error('商品データの取得に失敗しました');
    }

    if (learnedMappingsResponse.error) {
      console.error('学習データ取得エラー:', learnedMappingsResponse.error);
      throw new Error('学習データの取得に失敗しました');
    }

    const products = productsResponse.data || [];
    const learnedMappings = learnedMappingsResponse.data || [];
    
    // 4. 学習データをcsvHelpers期待形式に変換（yahoo_title → amazon_title）
    const learningData = learnedMappings.map(m => ({ 
      amazon_title: m.yahoo_title,  // 統一フィールド名に変換
      product_id: m.product_id 
    }));

    console.log(`商品マスタ: ${products.length}件, 学習データ: ${learningData.length}件`);

    // 5. CSV行を解析してマッチング
    const matchedProducts = [];
    const blankTitleProducts = [];
    
    for (const line of dataLines) {
      // CSVパース（カンマ区切り）
      const columns = line.split(',').map(col => col.trim().replace(/"/g, ''));
      
      if (columns.length < 6) {
        console.log(`列数不足の行をスキップ: ${columns.length}列`);
        continue;
      }

      // Yahoo仕様: A列=商品名(0), F列=数量(5)
      const productTitle = columns[0];
      const quantityStr = columns[5];
      const quantity = parseInt(quantityStr) || 0;

      if (quantity <= 0) {
        console.log(`数量0の商品をスキップ: ${productTitle}`);
        continue;
      }

      // 商品名空欄チェック
      if (!productTitle || productTitle.trim() === '') {
        blankTitleProducts.push({
          productTitle: '（空欄）',
          quantity,
          rawLine: line
        });
        console.log(`空欄商品名: 数量=${quantity}`);
        continue;
      }

      // 商品マッチング実行
      const matchResult = findBestMatchSimplified(productTitle, products, learningData);
      
      matchedProducts.push({
        productTitle,
        quantity,
        score: matchResult.score,
        productInfo: matchResult.product,
        isLearned: matchResult.isLearned,
        rawLine: line
      });

      console.log(`マッチング: ${productTitle} -> ${matchResult.product?.name || '未マッチ'} (スコア: ${matchResult.score})`);
    }

    // 6. 結果サマリー作成
    const matchedCount = matchedProducts.filter(p => p.productInfo).length;
    const unmatchedCount = matchedProducts.filter(p => !p.productInfo).length;
    const learnedCount = matchedProducts.filter(p => p.isLearned).length;

    const summary = {
      totalProducts: matchedProducts.length,
      matchedProducts: matchedCount,
      unmatchedProducts: unmatchedCount, 
      learnedMatches: learnedCount,
      blankTitleInfo: {
        count: blankTitleProducts.length,
        totalQuantity: blankTitleProducts.reduce((sum, p) => sum + p.quantity, 0)
      }
    };

    console.log('=== Yahoo CSV解析完了 ===');
    console.log('サマリー:', summary);

    // 7. 統一レスポンス構造（summaryオブジェクト必須）
    return NextResponse.json({
      success: true,
      summary,
      matchedProducts,
      blankTitleProducts,
      csvRowCount: dataLines.length
    });

  } catch (error) {
    console.error('Yahoo CSV解析エラー:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : '不明なエラーが発生しました' 
    }, { status: 500 });
  }
}
