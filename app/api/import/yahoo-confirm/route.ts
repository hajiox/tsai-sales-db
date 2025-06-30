// /app/api/import/yahoo-confirm/route.ts ver.5
// 学習データ保存時の変数名不一致を修正した最終版

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ★★★ 修正ポイント1: 正しいプロパティ名 `yahooTitle` を使用する ★★★
interface MatchedProduct {
  productInfo?: { id: string };
  yahooTitle: string; // `productTitle` から `yahooTitle` に変更
  quantity: number;
  isLearned: boolean;
}

interface NewMapping {
  yahooTitle: string;
  productId: string;
  quantity: number;
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== Yahoo CSV確定処理開始 ver.5 (最終修正版) ===');
    
    const { matchedProducts, newMappings, targetMonth } = await request.json() as {
        matchedProducts: MatchedProduct[],
        newMappings: NewMapping[],
        targetMonth: string
    };
    
    if ((!matchedProducts || matchedProducts.length === 0) && (!newMappings || newMappings.length === 0)) {
        return NextResponse.json({ success: true, message: "処理対象のデータがありませんでした。", totalCount: 0 });
    }
    
    if (!targetMonth) {
      return NextResponse.json({ success: false, error: '対象月が必要です' }, { status: 400 });
    }
    
    const formattedMonth = targetMonth.includes('-01') ? targetMonth : `${targetMonth}-01`;

    const productSummary = new Map<string, number>();
    const learningMappings: { yahoo_title: string; product_id: string }[] = [];

    // newMappingsには手動で紐付けた未学習データが含まれる
    const allProducts = [
        ...matchedProducts,
        ...newMappings.map(p => ({
            productId: p.productId,
            yahooTitle: p.yahooTitle,
            quantity: p.quantity,
            isLearned: false, // newMappingsは常に学習対象
            productInfo: { id: p.productId, name: '' } // productInfoを擬似的に作成
        }))
    ];

    for (const item of allProducts) {
        if (!item.productInfo?.id) continue;
        const currentQuantity = productSummary.get(item.productInfo.id) || 0;
        productSummary.set(item.productInfo.id, currentQuantity + (item.quantity || 0));
        
        // ★★★ 修正ポイント2: isLearnedフラグを尊重し、かつyahooTitleを正しく参照する ★★★
        if (!item.isLearned) {
            const title = item.yahooTitle;
            const productId = item.productInfo.id;
            
            // yahooTitleが空やnullでないことを確認
            if (title && productId) {
                const existing = learningMappings.find(m => m.yahoo_title === title);
                if (!existing) {
                    learningMappings.push({ yahoo_title: title, product_id: productId });
                }
            }
        }
    }

    // 売上サマリーの更新
    for (const [productId, totalQuantity] of productSummary) {
      const { error: selectError, data: existing } = await supabase
        .from('web_sales_summary')
        .select('id, yahoo_count')
        .eq('product_id', productId)
        .eq('report_month', formattedMonth)
        .limit(1);

      if (selectError) throw selectError;

      if (existing && existing.length > 0) {
        const newCount = (existing[0].yahoo_count || 0) + totalQuantity;
        const { error: updateError } = await supabase
          .from('web_sales_summary')
          .update({ yahoo_count: newCount })
          .eq('id', existing[0].id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('web_sales_summary')
          .insert({ product_id: productId, report_month: formattedMonth, yahoo_count: totalQuantity });
        if (insertError) throw insertError;
      }
    }
    console.log(`DB更新成功: ${productSummary.size}件`);

    // 学習データの保存
    let learnedCount = 0;
    if (learningMappings.length > 0) {
      console.log(`学習データを保存します: ${learningMappings.length}件`, learningMappings);
      const { count, error } = await supabase
        .from('yahoo_product_mapping')
        .upsert(learningMappings, { onConflict: 'yahoo_title', count: 'estimated' });
      if (error) throw error; // ここでエラーが発生していた
      learnedCount = count || 0;
    }

    console.log('=== Yahoo CSV確定処理完了 ver.5 ===');
    return NextResponse.json({
      success: true,
      message: 'Yahoo売上データを正常に登録しました。',
      totalCount: productSummary.size,
      learnedCount: learnedCount,
    });

  } catch (error) {
    console.error('Yahoo CSV確定処理で重大なエラー:', error);
    const errorMessage = error instanceof Error ? error.message : '不明なサーバーエラーが発生しました。';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
