// /app/api/import/rakuten-confirm/route.ts ver.6 - 楽天列のみ更新版

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
  console.log('🚨 楽天確定API開始 - 楽天列のみ更新版');
  
  try {
    const body: ConfirmRequest = await request.json();
    console.log('🔍 受信データ:', JSON.stringify(body, null, 2));
    
    const { saleDate, matchedProducts, newMappings } = body;
    const month = saleDate.substring(0, 7);
    console.log('🔍 処理月:', month);

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
          rakuten_title: mapping.rakutenTitle,
          product_id: mapping.productId
        }));

        const { error: mappingError } = await supabase
          .from('rakuten_product_mapping')
          .upsert(mappingsToInsert, { 
            onConflict: 'rakuten_title',
            ignoreDuplicates: false 
          });

        if (mappingError) {
          console.error('楽天マッピング学習エラー:', mappingError);
        } else {
          learnedCount = newMappings.length;
          console.log(`楽天学習データ保存完了: ${learnedCount}件`);
        }
      } catch (mappingError) {
        console.error('楽天マッピング処理エラー:', mappingError);
      }
    }

    // 2. 売上データを保存（楽天列のみ更新）
    const allSalesData = [...matchedProducts, ...(newMappings || [])];
    
    console.log(`🔍 楽天売上データ処理開始: ${allSalesData.length}件`);

    for (const result of allSalesData) {
      try {
        console.log(`🔍 処理中: product_id=${result.productId}, quantity=${result.quantity}`);
        
        // まず既存レコードを確認
        const { data: existingData, error: selectError } = await supabase
          .from('web_sales_summary')
          .select('*')
          .eq('product_id', result.productId)
          .eq('report_month', `${month}-01`)
          .single();

        if (selectError && selectError.code !== 'PGRST116') { // レコードなしエラー以外
          console.error('既存データ確認エラー:', selectError);
          errorCount++;
          continue;
        }

        if (existingData) {
          // 既存レコードがある場合は楽天列のみ更新
          const { error: updateError } = await supabase
            .from('web_sales_summary')
            .update({ 
              rakuten_count: result.quantity 
            })
            .eq('product_id', result.productId)
            .eq('report_month', `${month}-01`);

          if (updateError) {
            console.error(`❌ 楽天更新エラー:`, updateError);
            errorCount++;
          } else {
            console.log(`✅ 楽天列更新成功: quantity=${result.quantity}`);
            successCount++;
          }
        } else {
          // 新規レコードの場合
          const { error: insertError } = await supabase
            .from('web_sales_summary')
            .insert({
              product_id: result.productId,
              rakuten_count: result.quantity,
              amazon_count: 0,
              yahoo_count: 0,
              mercari_count: 0,
              base_count: 0,
              qoo10_count: 0,
              report_month: `${month}-01`
            });

          if (insertError) {
            console.error(`❌ 楽天新規挿入エラー:`, insertError);
            errorCount++;
          } else {
            console.log(`✅ 楽天新規挿入成功: quantity=${result.quantity}`);
            successCount++;
          }
        }
      } catch (itemError) {
        console.error(`❌ 楽天処理例外エラー:`, itemError);
        errorCount++;
      }
    }

    console.log(`楽天確定処理完了: 成功${successCount}件, エラー${errorCount}件, 学習${learnedCount}件`);

    return NextResponse.json({
      message: `楽天データの更新が完了しました (成功: ${successCount}件)`,
      success: successCount > 0,
      successCount,
      errorCount,
      totalCount: allSalesData.length,
      learnedMappings: learnedCount,
      insertedSales: successCount
    });

  } catch (error) {
    console.error('楽天確定API エラー:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました: ' + (error instanceof Error ? error.message : '不明なエラー') },
      { status: 500 }
    );
  }
}
