// /app/api/import/mercari-parse/route.ts ver.3
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const dynamic = 'force-dynamic';

// 安全な文字列検証関数
function isValidString(value: any): value is string {
  return value && typeof value === 'string' && value.trim().length > 0;
}

interface AggregatedProduct {
  productName: string;
  count: number;
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== メルカリマッチングAPI開始 ver.3 ===');
    
    const { aggregatedProducts } = await request.json();
    
    if (!aggregatedProducts || !Array.isArray(aggregatedProducts)) {
        console.error('集計済みデータがありません');
        return NextResponse.json({ success: false, error: '集計済みデータがありません' }, { status: 400 });
    }

    console.log('受信した集計データ:', aggregatedProducts.length, '商品');

    const { data: products, error: productsError } = await supabase.from('products').select('*');
    if (productsError) throw new Error(`商品マスターの取得に失敗: ${productsError.message}`);

    const validProducts = (products || []).filter(p => isValidString(p.name));
    console.log('有効な商品マスター数:', validProducts.length);

    const { data: learningData, error: learningDataError } = await supabase
        .from('mercari_product_mapping')
        .select('mercari_title, product_id');
    if (learningDataError) throw new Error(`学習データの取得に失敗: ${learningDataError.message}`);

    const validLearningData = (learningData || []).filter(l => isValidString(l.mercari_title));
    console.log('有効な学習データ数:', validLearningData.length);

    let matchedProducts: any[] = [];
    let unmatchedProducts: any[] = [];
    // ステートレス対応：このリクエスト内でのみ使用する一時的な記憶セットを作成
    const matchedMercariTitles = new Set<string>();

    for (const aggregatedProduct of aggregatedProducts) {
        const { productName, count } = aggregatedProduct;

        if (!isValidString(productName)) {
            console.log('無効な商品名をスキップ:', productName);
            continue;
        }

        console.log(`マッチング処理中: "${productName}"`);

        try {
            // 新しいヘルパー関数を呼び出す
            const productInfo = findBestMatchSimplified(
                productName,
                validProducts,
                validLearningData,
                'mercari', // [修正点1] channel引数を追加
                matchedMercariTitles // [修正点2] 一時的な記憶セットを渡す
            );

            if (productInfo) {
                // [修正点3] マッチした商品を記憶セットに追加
                matchedMercariTitles.add(productName);
                matchedProducts.push({ 
                    mercariTitle: productName, 
                    quantity: count, 
                    productInfo, 
                    matchType: productInfo.matchType 
                });
                console.log(`マッチ成功: "${productName}" -> ${productInfo.name}`);
            } else {
                unmatchedProducts.push({ mercariTitle: productName, quantity: count });
                console.log(`マッチ失敗: "${productName}"`);
            }
        } catch (error) {
            console.error(`マッチング処理エラー (${productName}):`, error);
            unmatchedProducts.push({ mercariTitle: productName, quantity: count });
        }
    }

    const processableQuantity = matchedProducts.reduce((sum, p) => sum + p.quantity, 0);
    const unmatchQuantity = unmatchedProducts.reduce((sum, p) => sum + p.quantity, 0);

    console.log('=== メルカリマッチングAPI完了 ===');
    console.log('マッチ商品数:', matchedProducts.length);
    console.log('未マッチ商品数:', unmatchedProducts.length);
    
    return NextResponse.json({
        success: true,
        matchedProducts,
        unmatchedProducts,
        summary: {
            totalProducts: matchedProducts.length + unmatchedProducts.length,
            totalQuantity: processableQuantity + unmatchQuantity,
            processableQuantity,
            blankTitleInfo: { count: 0, quantity: 0 }
        }
    });
  } catch (error) {
      console.error('メルカリマッチング処理で致命的なエラー:', error);
      return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
