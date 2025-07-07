// /app/api/import/mercari-parse/route.ts ver.3
// 中間データ処理専用API - ステートレス、チャネル対応版

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';

function isValidString(value: any): value is string {
  return value && typeof value === 'string' && value.trim().length > 0;
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== メルカリ マッチングAPI開始 ver.3 (ステートレス/チャネル対応版) ===');
    
    const { aggregatedProducts } = await request.json();
    if (!aggregatedProducts || !Array.isArray(aggregatedProducts)) {
        return NextResponse.json({ success: false, error: '集計済みデータがありません' }, { status: 400 });
    }
    console.log(`[Mercari Parse] 受信した集計データ: ${aggregatedProducts.length}商品`);

    // 商品マスターとメルカリ専用の学習データを並行して取得
    const [productsResponse, learningDataResponse] = await Promise.all([
      supabase.from('products').select('*'),
      supabase.from('mercari_product_mapping').select('mercari_title, product_id')
    ]);

    if (productsResponse.error) throw new Error(`商品マスターの取得に失敗: ${productsResponse.error.message}`);
    const validProducts = (productsResponse.data || []).filter(p => p && isValidString(p.name));
    
    if (learningDataResponse.error) throw new Error(`メルカリ学習データの取得に失敗: ${learningDataResponse.error.message}`);
    const validLearningData = (learningDataResponse.data || []).filter(l => l && isValidString(l.mercari_title));

    console.log(`[Mercari Parse] 有効な商品マスター: ${validProducts.length}件`);
    console.log(`[Mercari Parse] 有効なメルカリ学習データ: ${validLearningData.length}件`);

    let matchedProducts: any[] = [];
    let unmatchedProducts: any[] = [];

    // この処理専用の「マッチ済みID記憶セット」を作成（ステートレス化）
    const matchedProductIdsThisTime = new Set<string>();

    for (const aggregatedProduct of aggregatedProducts) {
        const { productName, count } = aggregatedProduct;

        if (!isValidString(productName)) {
            console.warn(`[Mercari Parse] 無効な商品名をスキップ: ${productName}`);
            continue;
        }

        try {
            // ★★★【最重要修正】★★★
            // 汎用ヘルパー関数に 'mercari' という channel と記憶用Setを渡す
            const result = findBestMatchSimplified(
              productName,
              validProducts,
              validLearningData,
              matchedProductIdsThisTime,
              'mercari' // <--- どのECサイトかを伝える
            );

            if (result) {
                matchedProducts.push({ 
                    mercariTitle: productName, 
                    quantity: count, 
                    productInfo: result.product, 
                    isLearned: result.matchType === 'learned'
                });
            } else {
                unmatchedProducts.push({ mercariTitle: productName, quantity: count });
            }
        } catch (error) {
            console.error(`[Mercari Parse] マッチング処理でエラーが発生 (${productName}):`, error);
            unmatchedProducts.push({ mercariTitle: productName, quantity: count });
        }
    }

    const processableQuantity = matchedProducts.reduce((sum, p) => sum + p.quantity, 0);
    const unmatchQuantity = unmatchedProducts.reduce((sum, p) => sum + p.quantity, 0);

    console.log('--- メルカリマッチングAPI完了 ---');
    console.log(`マッチ成功: ${matchedProducts.length}商品 / マッチ失敗: ${unmatchedProducts.length}商品`);
    console.log(`処理可能数量: ${processableQuantity}個 / 未マッチ数量: ${unmatchQuantity}個`);

    return NextResponse.json({
        success: true,
        matchedProducts,
        unmatchedProducts,
        summary: {
            totalProducts: matchedProducts.length + unmatchedProducts.length,
            totalQuantity: processableQuantity + unmatchQuantity,
            processableQuantity,
            matchedCount: matchedProducts.length,
            unmatchedCount: unmatchedProducts.length,
            learnedMatchCount: matchedProducts.filter(p => p.isLearned).length,
            blankTitleInfo: { count: 0, quantity: 0 } // 集計段階で処理済みのため0
        }
    });
  } catch (error) {
      console.error('❌ メルカリ マッチングAPIで予期せぬエラー:', error);
      return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
