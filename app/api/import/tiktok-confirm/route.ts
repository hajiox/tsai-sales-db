// app/api/import/tiktok-confirm/route.ts ver.3
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface ConfirmItem {
  title: string;
  count: number;
  saleDate: string;
  productId: string;
}

export async function POST(request: NextRequest) {
  try {
    const { items } = await request.json();

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '確定するアイテムが必要です' }, { status: 400 });
    }

    console.log(`[TikTok Confirm] 確定処理開始: ${items.length}件`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 商品IDごとに集計
    const productSummary = new Map<string, { count: number; saleDate: string }>();

    items.forEach((item: ConfirmItem) => {
      if (productSummary.has(item.productId)) {
        const existing = productSummary.get(item.productId)!;
        existing.count += item.count;
      } else {
        productSummary.set(item.productId, {
          count: item.count,
          saleDate: item.saleDate
        });
      }
    });

    console.log(`[TikTok Confirm] 商品ID別集計: ${productSummary.size}件`);

    // web_sales_summaryに保存（upsert方式）
    const upsertPromises = Array.from(productSummary.entries()).map(
      async ([productId, data]) => {
        const reportMonth = data.saleDate + '-01'; // YYYY-MM-01形式に変換
        const reportDate = new Date().toISOString().split('T')[0]; // 今日の日付

        // 既存データを確認（report_monthとproduct_idで検索）
        const { data: existing, error: selectError } = await supabase
          .from('web_sales_summary')
          .select('*')
          .eq('product_id', productId)
          .eq('report_month', reportMonth)
          .single();

        if (selectError && selectError.code !== 'PGRST116') {
          console.error(`[TikTok Confirm] 既存データ確認エラー:`, selectError);
          throw selectError;
        }

        if (existing) {
          // 既存データがある場合は上書き
          const { error: updateError } = await supabase
            .from('web_sales_summary')
            .update({
              tiktok_count: data.count,
              report_date: reportDate
            })
            .eq('product_id', productId)
            .eq('report_month', reportMonth);

          if (updateError) {
            console.error(`[TikTok Confirm] 更新エラー:`, updateError);
            throw updateError;
          }

          console.log(`[TikTok Confirm] 更新: ${productId} (${data.count}個)`);
        } else {
          // 新規データの場合は挿入
          const { error: insertError } = await supabase
            .from('web_sales_summary')
            .insert({
              product_id: productId,
              report_month: reportMonth,
              amazon_count: 0,
              rakuten_count: 0,
              yahoo_count: 0,
              mercari_count: 0,
              base_count: 0,
              qoo10_count: 0,
              tiktok_count: data.count,
              report_date: reportDate
            });

          if (insertError) {
            console.error(`[TikTok Confirm] 挿入エラー:`, insertError);
            throw insertError;
          }

          console.log(`[TikTok Confirm] 新規追加: ${productId} (${data.count}個)`);
        }
      }
    );

    await Promise.all(upsertPromises);

    console.log(`[TikTok Confirm] 確定処理完了`);

    return NextResponse.json({
      success: true,
      message: `${items.length}件のデータを確定しました`,
      summary: {
        totalItems: items.length,
        uniqueProducts: productSummary.size
      }
    });

  } catch (error) {
    console.error('[TikTok Confirm] エラー:', error);
    return NextResponse.json({
      error: 'データの確定中にエラーが発生しました',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
