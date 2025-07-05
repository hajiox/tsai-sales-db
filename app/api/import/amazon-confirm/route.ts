// /app/api/import/amazon-confirm/route.ts ver.15 (詳細ログ版)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Supabaseクライアントの初期化
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  console.log('Amazon確定API開始 - ver.15');
  
  try {
    const body: AmazonConfirmRequest = await request.json();
    const { saleDate, matchedProducts, newMappings } = body;
    const month = saleDate.substring(0, 7);

    console.log('受信したnewMappings:', JSON.stringify(newMappings));

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
      console.log(`学習処理開始: ${newMappings.length}件のデータ`);
      
      // 1件ずつ処理
      for (const mapping of newMappings) {
        console.log('処理中のマッピング:', mapping);
        
        try {
          const insertData = {
            amazon_title: mapping.amazonTitle,
            product_id: mapping.productId
          };
          console.log('挿入データ:', insertData);
          
          const { data, error } = await supabase
            .from('amazon_product_mapping')
            .insert(insertData)
            .select();
          
          if (error) {
            console.error('挿入エラー:', error);
          } else {
            console.log('挿入成功:', data);
            learnedCount++;
          }
        } catch (e) {
          console.error('例外エラー:', e);
        }
      }
      
      console.log(`学習処理完了: ${learnedCount}件保存`);
    } else {
      console.log('newMappingsが空またはnull');
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

    const response = {
      message: `Amazonデータの更新が完了しました (成功: ${successCount}件)`,
      success: successCount > 0 && errorCount === 0,
      successCount,
      errorCount,
      totalCount: aggregatedSales.size,
      learnedMappings: learnedCount,
    };
    
    console.log('APIレスポンス:', response);
    return NextResponse.json(response);

  } catch (error) {
    console.error('Amazon確定API エラー:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました: ' + (error instanceof Error ? error.message : '不明なエラー') },
      { status: 500 }
    );
  }
}
