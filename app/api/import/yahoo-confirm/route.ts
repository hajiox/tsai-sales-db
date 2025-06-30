// /app/api/import/yahoo-confirm/route.ts ver.4
// APIロジックのみを修正し、エラーハンドリングを堅牢にした代替案

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface MatchedProduct {
  productInfo?: { id: string };
  productTitle: string;
  quantity: number;
  isLearned: boolean;
}

interface NewMapping {
  yahooTitle: string;
  productId: string;
  quantity: number;
}

export async function POST(request: NextRequest) {
  // ★修正ポイント：処理全体を一つのtry...catchで囲む
  try {
    console.log('=== Yahoo CSV確定処理開始 ver.4 (API修正版) ===');
    
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

    // 1. 全ての更新対象データを集約
    const productSummary = new Map<string, number>();
    const learningMappings: { yahoo_title: string; product_id: string }[] = [];

    const allProducts = [
        ...matchedProducts.map(p => ({
            productId: p.productInfo?.id,
            productTitle: p.productTitle,
            quantity: p.quantity,
            isLearned: p.isLearned,
        })),
        ...newMappings.map(p => ({
            productId: p.productId,
            productTitle: p.yahooTitle,
            quantity: p.quantity,
            isLearned: false,
        }))
    ];

    for (const item of allProducts) {
        if (!item.productId) continue;
        const currentQuantity = productSummary.get(item.productId) || 0;
        productSummary.set(item.productId, currentQuantity + (item.quantity || 0));
        if (!item.isLearned) {
            const existing = learningMappings.find(m => m.yahoo_title === item.productTitle);
            if (!existing) {
                learningMappings.push({ yahoo_title: item.productTitle, product_id: item.productId });
            }
        }
    }

    // 2. データベース更新処理 (ループ処理だがエラーハンドリングを修正)
    for (const [productId, totalQuantity] of productSummary) {
      // ★修正ポイント: .single()を使わず、エラーを内部で握りつぶさない
      const { data: existing, error: selectError } = await supabase
        .from('web_sales_summary')
        .select('id, yahoo_count')
        .eq('product_id', productId)
        .eq('report_month', formattedMonth)
        .limit(1);

      if (selectError) throw selectError; // DBエラーがあれば処理を中断

      if (existing && existing.length > 0) {
        // 更新
        const newCount = (existing[0].yahoo_count || 0) + totalQuantity;
        const { error: updateError } = await supabase
          .from('web_sales_summary')
          .update({ yahoo_count: newCount })
          .eq('id', existing[0].id);
        if (updateError) throw updateError; // DBエラーがあれば処理を中断
      } else {
        // 新規挿入
        const { error: insertError } = await supabase
          .from('web_sales_summary')
          .insert({ product_id: productId, report_month: formattedMonth, yahoo_count: totalQuantity });
        if (insertError) throw insertError; // DBエラーがあれば処理を中断
      }
    }
    console.log(`DB更新成功: ${productSummary.size}件`);

    // 3. 学習データを保存
    let learnedCount = 0;
    if (learningMappings.length > 0) {
      const { count, error } = await supabase
        .from('yahoo_product_mapping')
        .upsert(learningMappings, { onConflict: 'yahoo_title', count: 'estimated' });
      if (error) throw error;
      learnedCount = count || 0;
    }

    console.log('=== Yahoo CSV確定処理完了 ver.4 ===');
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
