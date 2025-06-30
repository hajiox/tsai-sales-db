// /app/api/import/yahoo-parse/route.ts ver.2
// 数量サマリー計算機能を追加した修正版

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    console.log('=== Yahoo CSV解析API開始 ver.2 ===');
    
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

        const matchedProduct = findBestMatchSimplified(productTitle, products, learnedMappings);
        
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

    // ★★★ ここからが修正・追加箇所 ★★★
    
    // 6. 結果をマッチ済みと未マッチに分類
    const matchedProducts = allParsedProducts.filter(p => p.productInfo);
    const unmatchedProducts = allParsedProducts.filter(p => !p.productInfo);

    // 7. 数量サマリーを計算
    const totalQuantity = allParsedProducts.reduce((sum, p) => sum + p.quantity, 0) +
                        blankTitleProducts.reduce((sum, p) => sum + p.quantity, 0);

    const processableQuantity = matchedProducts.reduce((sum, p) => sum + p.quantity, 0);
    
    const summary = {
      totalProducts: allParsedProducts.length,
      totalQuantity: totalQuantity, // 【追加】総販売数量
      processableQuantity: processableQuantity, // 【追加】処理可能数量（マッチ済み数量）
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

    // 8. 統一レスポンス構造で返す
    return NextResponse.json({
      success: true,
      summary,
      matchedProducts,
      unmatchedProducts, // 未マッチ商品を明確に分離
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
