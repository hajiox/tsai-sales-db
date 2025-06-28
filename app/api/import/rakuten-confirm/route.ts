// /app/api/import/rakuten-confirm/route.ts ver.7 - 数量集計機能追加版

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface ConfirmRequest {
  saleDate: string;
  matchedProducts: Array<{
    rakutenTitle: string;
    productId: string;
    quantity: number;
  }>;
  newMappings: Array<{
    rakutenTitle: string;
    productId: string;
    quantity: number;
  }>;
}

export async function POST(request: NextRequest) {
  console.log('🚨 楽天確定API開始 - ver.7 (数量集計機能付き)');
  
  try {
    const body: ConfirmRequest = await request.json();
    const { saleDate, matchedProducts, newMappings } = body;
    const month = saleDate.substring(0, 7);

    if (!month || !matchedProducts || !Array.isArray(matchedProducts)) {
      return NextResponse.json(
        { error: '必要なデータが不足しています' },
        { status: 400 }
      );
    }

    let successCount = 0;
    let errorCount = 0;
    let learnedCount = 0;

    // 1. 新しいマッピングを学習（変更なし）
    if (newMappings && newMappings.length > 0) {
      try {
        const mappingsToInsert = newMappings.map(mapping => ({
          rakuten_title: mapping.rakutenTitle,
          product_id: mapping.productId
        }));

        const { error: mappingError } = await supabase
          .from('rakuten_product_mapping')
          .upsert(mappingsToInsert, { onConflict: 'rakuten_title' });

        if (mappingError) throw mappingError;
        learnedCount = newMappings.length;
        console.log(`📚 楽天学習データ保存完了: ${learnedCount}件`);
      } catch (mappingError) {
        console.error('楽天マッピング処理エラー:', mappingError);
      }
    }

    // 2. 売上データを商品IDごとに【集計】する
    const allSalesData = [...matchedProducts, ...(newMappings || [])];
    const aggregatedSales = new Map<string, number>();

    for (const item of allSalesData) {
      const currentQuantity = aggregatedSales.get(item.productId) || 0;
      aggregatedSales.set(item.productId, currentQuantity + item.quantity);
    }
    console.log(`🔍 元データ件数: ${allSalesData.length}件 → 集計後: ${aggregatedSales.size}件`);

    // 3. 集計後のデータでDBを更新
    for (const [productId, totalQuantity] of aggregatedSales.entries()) {
      try {
        const reportMonth = `${month}-01`;
        console.log(`🔄 処理中: product_id=${productId}, quantity=${totalQuantity}`);
        
        const { data: existingData, error: selectError } = await supabase
          .from('web_sales_summary')
          .select('id')
          .eq('product_id', productId)
          .eq('report_month', reportMonth)
          .single();

        if (selectError && selectError.code !== 'PGRST116') {
          throw selectError;
        }

        if (existingData) {
          // 更新
          const { error: updateError } = await supabase
            .from('web_sales_summary')
            .update({ rakuten_count: totalQuantity })
            .eq('id', existingData.id);
          if (updateError) throw updateError;
          console.log(`✅ 更新成功`);
        } else {
          // 新規挿入
          const { error: insertError } = await supabase
            .from('web_sales_summary')
            .insert({
              product_id: productId,
              report_month: reportMonth,
              rakuten_count: totalQuantity,
            });
          if (insertError) throw insertError;
          console.log(`✅ 新規挿入成功`);
        }
        successCount++;
      } catch (itemError) {
        console.error(`❌ DB処理エラー (product_id: ${productId}):`, itemError);
        errorCount++;
      }
    }

    console.log(`楽天確定処理完了: 成功${successCount}件, エラー${errorCount}件, 学習${learnedCount}件`);

    return NextResponse.json({
      message: `楽天データの更新が完了しました (成功: ${successCount}件)`,
      success: successCount > 0 && errorCount === 0,
      successCount,
      errorCount,
      totalCount: aggregatedSales.size,
      learnedMappings: learnedCount,
    });

  } catch (error) {
    console.error('楽天確定API エラー:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました: ' + (error instanceof Error ? error.message : '不明なエラー') },
      { status: 500 }
    );
  }
}
