// /app/api/import/yahoo-confirm/route.ts ver.1
// Yahoo CSV確定処理API（統一アーキテクチャ適用）

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase直接初期化
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    console.log('=== Yahoo CSV確定処理開始 ===');
    
    const { matchedProducts, targetMonth } = await request.json();
    
    if (!matchedProducts || !targetMonth) {
      return NextResponse.json({ 
        success: false, 
        error: 'マッチング結果と対象月が必要です' 
      }, { status: 400 });
    }

    console.log(`確定処理: ${matchedProducts.length}件, 対象月: ${targetMonth}`);

    // 1. 商品IDごとにデータを集約
    const productSummary = new Map();
    const learningMappings = [];

    for (const item of matchedProducts) {
      // 統一データ構造: productInfo.id参照
      if (!item.productInfo?.id) {
        console.log(`商品ID未特定をスキップ: ${item.productTitle}`);
        continue;
      }

      const productId = item.productInfo.id;
      const quantity = item.quantity || 0;

      // 商品別数量集約
      if (productSummary.has(productId)) {
        productSummary.set(productId, productSummary.get(productId) + quantity);
      } else {
        productSummary.set(productId, quantity);
      }

      // 学習データ収集（重複回避）
      if (!item.isLearned) {
        const existingMapping = learningMappings.find(m => 
          m.yahoo_title === item.productTitle && m.product_id === productId
        );
        
        if (!existingMapping) {
          learningMappings.push({
            yahoo_title: item.productTitle,
            product_id: productId
          });
        }
      }
    }

    console.log(`集約結果: ${productSummary.size}商品, 学習データ: ${learningMappings.length}件`);

    // 2. データベース更新処理
    let successCount = 0;
    let errorCount = 0;

    for (const [productId, totalQuantity] of productSummary) {
      try {
        // 既存レコード確認
        const { data: existingRecord } = await supabase
          .from('web_sales_summary')
          .select('id, yahoo_count')
          .eq('product_id', productId)
          .eq('month', targetMonth)
          .single();

        if (existingRecord) {
          // 更新処理
          const newYahooCount = (existingRecord.yahoo_count || 0) + totalQuantity;
          
          const { error: updateError } = await supabase
            .from('web_sales_summary')
            .update({ yahoo_count: newYahooCount })
            .eq('id', existingRecord.id);

          if (updateError) {
            console.error(`更新エラー (${productId}):`, updateError);
            errorCount++;
          } else {
            console.log(`更新成功: ${productId} -> yahoo_count: ${newYahooCount}`);
            successCount++;
          }
        } else {
          // 新規挿入
          const { error: insertError } = await supabase
            .from('web_sales_summary')
            .insert({
              product_id: productId,
              month: targetMonth,
              yahoo_count: totalQuantity
            });

          if (insertError) {
            console.error(`挿入エラー (${productId}):`, insertError);
            errorCount++;
          } else {
            console.log(`挿入成功: ${productId} -> yahoo_count: ${totalQuantity}`);
            successCount++;
          }
        }
      } catch (error) {
        console.error(`処理エラー (${productId}):`, error);
        errorCount++;
      }
    }

    // 3. 学習データ保存（upsert使用）
    let learnedMappingsCount = 0;
    
    if (learningMappings.length > 0) {
      const { error: learningError, count } = await supabase
        .from('yahoo_product_mapping')
        .upsert(learningMappings, { 
          onConflict: 'yahoo_title',
          count: 'estimated'
        });

      if (learningError) {
        console.error('学習データ保存エラー:', learningError);
      } else {
        learnedMappingsCount = count || learningMappings.length;
        console.log(`学習データ保存成功: ${learnedMappingsCount}件`);
      }
    }

    const totalCount = successCount + errorCount;

    console.log('=== Yahoo CSV確定処理完了 ===');
    console.log(`成功: ${successCount}件, エラー: ${errorCount}件, 学習: ${learnedMappingsCount}件`);

    // 4. 統一レスポンス構造（successフィールド必須）
    return NextResponse.json({
      success: true,
      message: `Yahoo売上データを正常に登録しました`,
      successCount,
      errorCount,
      totalCount,
      learnedMappings: learnedMappingsCount
    });

  } catch (error) {
    console.error('Yahoo CSV確定処理エラー:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : '確定処理でエラーが発生しました' 
    }, { status: 500 });
  }
}
