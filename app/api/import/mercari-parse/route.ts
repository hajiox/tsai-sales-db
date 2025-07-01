// /app/api/import/mercari-parse/route.ts ver.2
// 中間データ処理専用API - 集計済みデータ → マッチング

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
    console.log('=== メルカリマッチングAPI開始 ver.2 ===');
    
    const { aggregatedProducts } = await request.json();
    console.log('集計済みデータ受信:', aggregatedProducts ? 'OK' : 'NG');
    
    if (!aggregatedProducts || !Array.isArray(aggregatedProducts)) {
        return NextResponse.json({ success: false, error: '集計済みデータがありません' }, { status: 400 });
    }

    console.log('受信した集計データ:', aggregatedProducts.length, '商品');

    const { data: products, error: productsError } = await supabase.from('products').select('*');
    if (productsError) throw new Error(`商品マスターの取得に失敗: ${productsError.message}`);

    // 商品データの厳密な検証
    const validProducts = (products || []).filter(p => {
      if (!p || !isValidString(p.name)) {
        console.log('無効な商品データを除外:', p);
        return false;
      }
      return true;
    });
    console.log('有効な商品数:', validProducts.length);

    const { data: learningData } = await supabase.from('mercari_product_mapping').select('mercari_title, product_id');

    // 学習データの厳密な検証
    const validLearningData = (learningData || []).filter(l => {
      if (!l || !isValidString(l.mercari_title)) {
        console.log('無効な学習データを除外:', l);
        return false;
      }
      return true;
    });
    console.log('有効な学習データ数:', validLearningData.length);

    let matchedProducts: any[] = [];
    let unmatchedProducts: any[] = [];

    // 集計済みデータでマッチング処理
    for (const aggregatedProduct of aggregatedProducts) {
        const { productName, count } = aggregatedProduct;

        if (!isValidString(productName)) {
            console.log('無効な商品名をスキップ:', productName);
            continue;
        }

        console.log(`マッチング処理中: "${productName}" (${count}個)`);

        try {
            const productInfo = findBestMatchSimplified(productName, validProducts, validLearningData);

            if (productInfo) {
                matchedProducts.push({ 
                    mercariTitle: productName, 
                    quantity: count, 
                    productInfo, 
                    matchType: productInfo.matchType 
                });
                console.log(`マッチ成功: "${productName}" -> ${productInfo.name} (${count}個)`);
            } else {
                unmatchedProducts.push({ mercariTitle: productName, quantity: count });
                console.log(`マッチ失敗: "${productName}" (${count}個)`);
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
    console.log('処理可能数量:', processableQuantity);
    console.log('未マッチ数量:', unmatchQuantity);

    return NextResponse.json({
        success: true,
        matchedProducts,
        unmatchedProducts,
        summary: {
            totalProducts: matchedProducts.length + unmatchedProducts.length,
            totalQuantity: processableQuantity + unmatchQuantity,
            processableQuantity,
            blankTitleInfo: {
                count: 0, // 集計段階で処理済み
                quantity: 0
            }
        }
    });
  } catch (error) {
      console.error('メルカリマッチング処理エラー:', error);
      return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
