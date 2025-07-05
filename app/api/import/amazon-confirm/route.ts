// /app/api/import/amazon-confirm/route.ts ver.18 (動作実績のあるver.10ベース)
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface AmazonConfirmRequest {
  saleDate: string;
  matchedProducts: Array<{
    amazonTitle: string;
    productId: string;
    quantity: number;
  }>;
  newMappings: Array<{
    amazonTitle: string;
    productId: string;
    quantity: number;
  }>;
}

export async function POST(request: NextRequest) {
  console.log('Amazon確定API開始 - ver.18');
  
  try {
    const body: AmazonConfirmRequest = await request.json();
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

    // 1. 新しいマッピングを学習
    if (newMappings && newMappings.length > 0) {
      try {
        const mappingsToInsert = newMappings.map(mapping => ({
          amazon_title: mapping.amazonTitle,
          product_id: mapping.productId
        }));

        const { error: mappingError } = await supabase
          .from('amazon_product_mapping')
          .upsert(mappingsToInsert, { onConflict: 'amazon_title' });

        if (mappingError) throw mappingError;
        learnedCount = newMappings.length;
        console.log(`✅ Amazon学習データ保存完了: ${learnedCount}件`);
      } catch (mappingError) {
        console.error('Amazonマッピング処理エラー:', mappingError);
      }
    }

    // 2. 売上データを商品IDごとに集計
    const allSalesData = [...matchedProducts, ...(newMappings || [])];
    const aggregatedSales = new Map<string, number>();

    for (const item of allSalesData) {
      const currentQuantity = aggregatedSales.get(item.productId) || 0;
      aggregatedSales.set(item.productId, currentQuantity + item.quantity);
    }

    // 3. 集計後のデータでDBを更新
    for (const [productId, totalQuantity] of aggregatedSales.entries()) {
      try {
        const reportMonth = `${month}-01`;
        
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
            .update({ amazon_count: totalQuantity })
            .eq('id', existingData.id);
          if (updateError) throw updateError;
        } else {
          // 新規挿入
          const { error: insertError } = await supabase
            .from('web_sales_summary')
            .insert({
              product_id: productId,
              report_month: reportMonth,
              amazon_count: totalQuantity,
            });
          if (insertError) throw insertError;
        }
        successCount++;
      } catch (itemError) {
        console.error(`DB処理エラー (product_id: ${productId}):`, itemError);
        errorCount++;
      }
    }

    console.log(`Amazon確定処理完了: 成功${successCount}件, エラー${errorCount}件, 学習${learnedCount}件`);

    return NextResponse.json({
      message: `Amazonデータの更新が完了しました (成功: ${successCount}件)`,
      success: successCount > 0 && errorCount === 0,
      successCount,
      errorCount,
      totalCount: aggregatedSales.size,
      learnedMappings: learnedCount,
    });

  } catch (error) {
    console.error('Amazon確定API エラー:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました: ' + (error instanceof Error ? error.message : '不明なエラー') },
      { status: 500 }
    );
  }
}
