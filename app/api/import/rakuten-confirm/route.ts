// /app/api/import/rakuten-confirm/route.ts ver.5 - Amazon方式完全準拠版

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
  console.log('🚨 楽天確定API開始 - 完全デバッグモード');
  
  try {
    const body: ConfirmRequest = await request.json();
    console.log('🔍 受信した生データ:', JSON.stringify(body, null, 2));
    
    const { saleDate, matchedProducts, newMappings } = body;

    console.log('🔍 分解後データ:', { 
      saleDate, 
      matchedLength: matchedProducts?.length, 
      newMappingsLength: newMappings?.length,
      matchedProducts: matchedProducts?.slice(0, 3),
      newMappings: newMappings?.slice(0, 3)
    });

    // 月形式に変換（Amazon方式と同じ）
    const month = saleDate.substring(0, 7); // YYYY-MM
    console.log('🔍 処理月:', month);

    if (!month || !matchedProducts || !Array.isArray(matchedProducts)) {
      console.log('❌ バリデーション失敗:', { month, matchedProducts: !!matchedProducts, isArray: Array.isArray(matchedProducts) });
      return NextResponse.json(
        { error: '必要なデータが不足しています' },
        { status: 400 }
      );
    }

    let successCount = 0;
    let errorCount = 0;
    let learnedCount = 0;

    // 1. 新しいマッピングを学習（Amazon方式準拠）
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

    // 2. 売上データを保存（Amazon方式完全準拠）
    const allSalesData = [...matchedProducts, ...(newMappings || [])];
    
    console.log(`🔍 楽天売上データ処理開始: ${allSalesData.length}件`);
    console.log('🔍 処理対象データ:', JSON.stringify(allSalesData.slice(0, 3), null, 2)); // 最初の3件をログ

    for (const result of allSalesData) {
      try {
        console.log(`🔍 楽天処理中: product_id=${result.productId}, quantity=${result.quantity}, month=${month}`);
        
        // シンプルなupsert処理
        const { data, error } = await supabase
          .from('web_sales_summary')
          .upsert({
            product_id: result.productId,
            rakuten_count: result.quantity,
            report_month: `${month}-01`
          }, {
            onConflict: 'product_id,report_month'
          })
          .select();

        console.log(`🔍 楽天upsert実行結果:`, { data, error });

        if (error) {
          console.error(`❌ 楽天upsertエラー (${result.productId}):`, error.message);
          console.error(`❌ エラー詳細:`, JSON.stringify(error, null, 2));
          errorCount++;
        } else {
          console.log(`✅ 楽天upsert成功 (${result.productId}): 数量=${result.quantity}`);
          console.log('✅ upsert結果データ:', JSON.stringify(data, null, 2));
          
          // 処理後確認
          const { data: afterData, error: afterError } = await supabase
            .from('web_sales_summary')
            .select('*')
            .eq('product_id', result.productId)
            .eq('report_month', `${month}-01`);
          
          console.log(`🔍 処理後データ:`, afterData);
          if (afterError) console.log(`🔍 処理後エラー:`, afterError);
          
          successCount++;
        }
      } catch (itemError) {
        console.error(`❌ 楽天処理例外エラー (${result.productId}):`, itemError);
        errorCount++;
      }
    }

    console.log(`楽天確定処理完了: 成功${successCount}件, エラー${errorCount}件, 学習${learnedCount}件`);

    // Amazon方式と同じレスポンス形式
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
