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
  try {
    const body: ConfirmRequest = await request.json();
    const { saleDate, matchedProducts, newMappings } = body;

    console.log('楽天確定処理開始 (Amazon方式):', { 
      saleDate, 
      matchedLength: matchedProducts?.length, 
      newMappingsLength: newMappings?.length 
    });

    // 月形式に変換（Amazon方式と同じ）
    const month = saleDate.substring(0, 7); // YYYY-MM

    if (!month || !matchedProducts || !Array.isArray(matchedProducts)) {
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
    
    console.log(`楽天売上データ処理開始: ${allSalesData.length}件`);

    for (const result of allSalesData) {
      try {
        console.log(`楽天処理中: product_id=${result.productId}, quantity=${result.quantity}`);
        
        // Amazon方式と同じupsert処理
        const { data, error } = await supabase
          .from('web_sales_summary')
          .upsert({
            product_id: result.productId,
            rakuten_count: result.quantity, // 楽天専用列
            report_month: `${month}-01`
          }, {
            onConflict: 'product_id,report_month'
          })
          .select();

        if (error) {
          console.error(`楽天upsertエラー (${result.productId}):`, error.message);
          errorCount++;
        } else {
          console.log(`楽天upsert成功 (${result.productId}):`, result.quantity);
          console.log('楽天upsert結果データ:', data);
          successCount++;
        }
      } catch (itemError) {
        console.error(`楽天処理エラー (${result.productId}):`, itemError);
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
