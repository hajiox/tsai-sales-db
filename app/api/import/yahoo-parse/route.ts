// /app/api/import/yahoo-parse/route.ts ver.3
// 学習データが正しく使用されるように形式を整える修正版

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    console.log('=== Yahoo CSV解析API開始 ver.3 ===');
    
    const { csvData } = await request.json();
    if (!csvData) {
      return NextResponse.json({ success: false, error: 'CSVデータが必要です' }, { status: 400 });
    }

    const lines = csvData.split('\n').filter((line: string) => line.trim());
    if (lines.length < 2) {
      return NextResponse.json({ success: false, error: 'データが不足しています' }, { status: 400 });
    }

    const dataLines = lines.slice(1);
    const [productsResponse, learnedMappingsResponse] = await Promise.all([
      supabase.from('products').select('id, name'),
      supabase.from('yahoo_product_mapping').select('yahoo_title, product_id')
    ]);

    if (productsResponse.error) throw new Error('商品データの取得に失敗しました');
    if (learnedMappingsResponse.error) throw new Error('学習データの取得に失敗しました');

    const products = productsResponse.data || [];
    const learnedMappings = learnedMappingsResponse.data || [];
    
    // ★★★ ここからが修正箇所 ★★★
    // 共通のマッチング関数が理解できるよう、プロパティ名を汎用的な 'title' に変換する
    const preparedLearningData = learnedMappings.map(m => ({
      title: m.yahoo_title,
      product_id: m.product_id
    }));
    console.log(`学習データを共通関数向けに変換: ${preparedLearningData.length}件`);
    // ★★★ 修正箇所ここまで ★★★

    const allParsedProducts = [];
    const blankTitleProducts = [];
    
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      try {
        const columns = line.split(',').map((col: string) => col.trim().replace(/"/g, ''));
        if (columns.length < 6) continue;

        const productTitle = columns[0];
        const quantity = parseInt(columns[5]) || 0;
        if (quantity <= 0) continue;

        if (!productTitle || productTitle.trim() === '') {
          blankTitleProducts.push({ productTitle: '（空欄）', quantity });
          continue;
        }

        // 修正した `preparedLearningData` を使用する
        const matchedProduct = findBestMatchSimplified(productTitle, products, preparedLearningData);
        
        allParsedProducts.push({
          yahooTitle: productTitle,
          quantity,
          productInfo: matchedProduct ? { id: matchedProduct.id, name: matchedProduct.name } : null,
          isLearned: matchedProduct?.matchType === 'learned' || false,
        });

      } catch (lineError) {
        console.error(`行${i + 2}の処理エラー:`, lineError, `問題の行: "${line}"`);
        continue;
      }
    }

    const matchedProducts = allParsedProducts.filter(p => p.productInfo);
    const unmatchedProducts = allParsedProducts.filter(p => !p.productInfo);

    const totalQuantity = allParsedProducts.reduce((sum, p) => sum + p.quantity, 0) +
                        blankTitleProducts.reduce((sum, p) => sum + p.quantity, 0);

    const processableQuantity = matchedProducts.reduce((sum, p) => sum + p.quantity, 0);
    
    const summary = {
      totalProducts: allParsedProducts.length,
      totalQuantity: totalQuantity,
      processableQuantity: processableQuantity,
      matchedProducts: matchedProducts.length,
      unmatchedProducts: unmatchedProducts.length, 
      learnedMatches: matchedProducts.filter(p => p.isLearned).length,
      blankTitleInfo: {
        count: blankTitleProducts.length,
        totalQuantity: blankTitleProducts.reduce((sum, p) => sum + p.quantity, 0)
      }
    };
    
    console.log('=== Yahoo CSV解析完了 ===');
    console.log('サマリー:', summary);

    return NextResponse.json({
      success: true,
      summary,
      matchedProducts,
      unmatchedProducts,
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
