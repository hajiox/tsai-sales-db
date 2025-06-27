// /app/api/import/rakuten-confirm/route.ts ver.4 - web_sales_summaryテーブル対応版

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

interface ConfirmResult {
  success: boolean;
  insertedSales?: number;
  learnedMappings?: number;
  error?: string;
  successCount?: number;
  errorCount?: number;
  totalCount?: number;
}

export async function POST(request: NextRequest): Promise<NextResponse<ConfirmResult>> {
  try {
    const body: ConfirmRequest = await request.json();
    const { saleDate, matchedProducts, newMappings } = body;

    console.log('楽天確定処理開始:', { saleDate, matchedLength: matchedProducts?.length, newMappingsLength: newMappings?.length });

    // 月形式に変換（YYYY-MM-01形式）
    const month = saleDate.substring(0, 7); // YYYY-MM

    try {
      // 1. 新しいマッピングを学習
      let learnedCount = 0;
      if (newMappings.length > 0) {
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
          console.error('マッピング学習エラー:', mappingError);
        } else {
          learnedCount = newMappings.length;
          console.log(`楽天学習データ保存完了: ${learnedCount}件`);
        }
      }

      // 2. 売上データをweb_sales_summaryテーブルに保存（Amazonと同じ方式）
      const allSalesData = [...matchedProducts, ...newMappings];
      
      let successCount = 0;
      let errorCount = 0;

      for (const item of allSalesData) {
        try {
          console.log(`楽天処理中: product_id=${item.productId}, quantity=${item.quantity}`);
          
          // upsert処理（Amazon方式と同じ）
          const { data, error } = await supabase
            .from('web_sales_summary')
            .upsert({
              product_id: item.productId,
              rakuten_count: item.quantity, // Amazon → amazon_count, 楽天 → rakuten_count
              report_month: `${month}-01`
            }, {
              onConflict: 'product_id,report_month'
            })
            .select();

          if (error) {
            console.error(`楽天upsertエラー (${item.productId}):`, error.message);
            errorCount++;
          } else {
            console.log(`楽天upsert成功 (${item.productId}):`, item.quantity);
            successCount++;
          }
        } catch (itemError) {
          console.error(`楽天処理エラー (${item.productId}):`, itemError);
          errorCount++;
        }
      }

      console.log(`楽天確定処理完了: 成功${successCount}件, エラー${errorCount}件`);

      return NextResponse.json({
        success: successCount > 0,
        insertedSales: successCount,
        learnedMappings: learnedCount,
        successCount,
        errorCount,
        totalCount: allSalesData.length,
        message: `楽天データの更新が完了しました (成功: ${successCount}件)`
      });

    } catch (error) {
      console.error('楽天確定処理エラー:', error);
      throw error;
    }

  } catch (error) {
    console.error('楽天CSV確定エラー:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー'
    });
  }
}
