// /app/api/import/yahoo-confirm/route.ts ver.6
// 既存データを上書き方式に変更（Amazon/楽天と統一）

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface MatchedProduct {
  productInfo?: { id: string };
  yahooTitle: string;
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
    console.log('=== Yahoo CSV確定処理開始 ver.6 (上書き方式) ===');
    
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

    // 商品IDごとに数量を集計
    for (const item of allProducts) {
        if (!item.productInfo?.id) continue;
        const currentQuantity = productSummary.get(item.productInfo.id) || 0;
        productSummary.set(item.productInfo.id, currentQuantity + (item.quantity || 0));
        
        // 学習データの収集
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

    let successCount = 0;
    let errorCount = 0;

    // 売上サマリーの更新（上書き方式）
    for (const [productId, totalQuantity] of productSummary) {
      try {
        const { error: selectError, data: existing } = await supabase
          .from('web_sales_summary')
          .select('id')
          .eq('product_id', productId)
          .eq('report_month', formattedMonth)
          .single();

        if (selectError && selectError.code !== 'PGRST116') {
          throw selectError;
        }

        if (existing) {
          // 既存レコードを上書き（加算ではない）
          console.log(`📝 既存レコード更新: product_id=${productId}, yahoo_count=${totalQuantity}`);
          const { error: updateError } = await supabase
            .from('web_sales_summary')
            .update({ yahoo_count: totalQuantity })
            .eq('id', existing.id);
          
          if (updateError) throw updateError;
        } else {
          // 新規挿入
          console.log(`📝 新規レコード挿入: product_id=${productId}, yahoo_count=${totalQuantity}`);
          const { error: insertError } = await supabase
            .from('web_sales_summary')
            .insert({ 
              product_id: productId, 
              report_month: formattedMonth, 
              yahoo_count: totalQuantity 
            });
          
          if (insertError) throw insertError;
        }
        successCount++;
      } catch (itemError) {
        console.error(`❌ DB処理エラー (product_id: ${productId}):`, itemError);
        errorCount++;
      }
    }
    
    console.log(`DB更新完了: 成功${successCount}件, エラー${errorCount}件`);

    // 学習データの保存
    let learnedCount = 0;
    if (learningMappings.length > 0) {
      console.log(`📚 学習データを保存します: ${learningMappings.length}件`, learningMappings);
      const { count, error } = await supabase
        .from('yahoo_product_mapping')
        .upsert(learningMappings, { onConflict: 'yahoo_title', count: 'estimated' });
      
      if (error) {
        console.error('学習データ保存エラー:', error);
        throw error;
      }
      learnedCount = count || learningMappings.length;
      console.log(`✅ Yahoo学習データ保存完了: ${learnedCount}件`);
    }

    const isSuccess = successCount > 0 && errorCount === 0;
    console.log(`=== Yahoo CSV確定処理完了 ver.6: 成功${successCount}件, エラー${errorCount}件, 学習${learnedCount}件 ===`);
    
    return NextResponse.json({
      success: isSuccess,
      message: isSuccess 
        ? `Yahoo売上データを正常に登録しました (成功: ${successCount}件)` 
        : `一部エラーが発生しました (成功: ${successCount}件, エラー: ${errorCount}件)`,
      totalCount: productSummary.size,
      successCount,
      errorCount,
      learnedCount,
      learnedMappings: learnedCount,
    });

  } catch (error) {
    console.error('Yahoo CSV確定処理で重大なエラー:', error);
    const errorMessage = error instanceof Error ? error.message : '不明なサーバーエラーが発生しました。';
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
