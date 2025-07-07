// /app/api/import/mercari-parse/route.ts ver.4
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

interface AggregatedProduct {
  productName: string;
  count: number;
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== メルカリマッチングAPI開始 ver.4 ===');
    
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

    // [修正点] select句でmercari_titleに'title'というエイリアス（別名）を付ける
    const { data: learningData, error: learningDataError } = await supabase
        .from('mercari_product_mapping')
        .select('title:mercari_title, product_id');

    if (learningDataError) throw new Error(`学習データの取得に失敗: ${learningDataError.message}`);

    const validLearningData = (learningData || []).filter(l => isValidString(l.title));
    console.log('有効な学習データ数:', validLearningData.length);
    if(validLearningData.length > 0) {
      console.log('学習データのサンプル:', validLearningData[0]);
    }

    let matchedProducts: any[] = [];
    let unmatchedProducts: any[] = [];
    const matchedMercariTitles = new Set<string>();

    for (const aggregatedProduct of aggregatedProducts) {
        const { productName, count } = aggregatedProduct;

        if (!isValidString(productName)) {
            console.log('無効な商品名をスキップ:', productName);
            continue;
        }

        try {
            const productInfo = findBestMatchSimplified(
                productName,
                validProducts,
                validLearningData,
                'mercari', 
                matchedMercariTitles
            );

            if (productInfo) {
                matchedMercariTitles.add(productName);
                matchedProducts.push({ 
                    mercariTitle: productName, 
                    quantity: count, 
                    productInfo, 
                    matchType: productInfo.matchType 
                });
            } else {
                unmatchedProducts.push({ mercariTitle: productName, quantity: count });
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
