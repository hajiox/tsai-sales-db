// app/api/import/tiktok-confirm/route.ts ver.5 (単価スナップショット対応)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBulkProductUnitPrices } from '@/lib/unitPriceHelper';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface ConfirmItem {
  title: string;
  count: number;
  saleDate: string;
  productId: string;
  amount?: number;
}

export async function POST(request: NextRequest) {
  try {
    const { items } = await request.json();

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '確定するアイテムが必要です' }, { status: 400 });
    }

    console.log(`[TikTok Confirm] 確定処理開始: ${items.length}件`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 商品ID・月ごとに集計（月次WEB販売管理用）
    const productSummary = new Map<string, { productId: string; count: number; reportMonth: string }>();
    // 売上日ごとに集計（DocScanner日別速報用）
    const dailySummary = new Map<string, { count: number; amount: number }>();

    items.forEach((item: ConfirmItem) => {
      const normalizedDate = normalizeSaleDate(item.saleDate);
      const reportMonth = `${normalizedDate.slice(0, 7)}-01`;
      const monthKey = `${item.productId}::${reportMonth}`;

      if (productSummary.has(monthKey)) {
        const existing = productSummary.get(monthKey)!;
        existing.count += item.count;
      } else {
        productSummary.set(monthKey, {
          productId: item.productId,
          count: item.count,
          reportMonth
        });
      }

      const existingDaily = dailySummary.get(normalizedDate) || { count: 0, amount: 0 };
      existingDaily.count += item.count;
      existingDaily.amount += Number(item.amount || 0);
      dailySummary.set(normalizedDate, existingDaily);
    });

    console.log(`[TikTok Confirm] 商品ID別集計: ${productSummary.size}件`);

    // web_sales_summaryに保存（upsert方式）
    // 新規挿入時にunit_priceを保存するため、商品価格を一括取得
    const productIds = Array.from(new Set(Array.from(productSummary.values()).map(data => data.productId)));
    const unitPriceMap = await getBulkProductUnitPrices(supabase, productIds);

    // CSV側の金額が取れない古いデータでも日別金額が出るよう、商品単価で補完する。
    items.forEach((item: ConfirmItem) => {
      const normalizedDate = normalizeSaleDate(item.saleDate);
      const daily = dailySummary.get(normalizedDate);
      if (!daily || Number(item.amount || 0) > 0) return;
      const unitPrice = unitPriceMap.get(item.productId)?.unit_price || 0;
      daily.amount += unitPrice * item.count;
    });

    const upsertPromises = Array.from(productSummary.values()).map(
      async (data) => {
        const productId = data.productId;
        const reportMonth = data.reportMonth;
        // report_dateは売上月の末日を設定
        const reportDate = getMonthEndDate(reportMonth.slice(0, 7));

        console.log(`[TikTok Confirm] 処理中: product_id=${productId}, report_month=${reportMonth}, report_date=${reportDate}`);

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
          const unitPrice = unitPriceMap.get(productId) || { unit_price: 0, unit_profit_rate: 0 };
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
              report_date: reportDate,
              unit_price: unitPrice.unit_price,
              unit_profit_rate: unitPrice.unit_profit_rate,
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

    const dailyUpsertRows = Array.from(dailySummary.entries()).map(([date, data]) => ({
      date,
      tiktok_count: data.count,
      tiktok_amount: Math.round(data.amount),
    }));

    if (dailyUpsertRows.length > 0) {
      const { error: dailyError } = await supabase
        .from('daily_sales_report')
        .upsert(dailyUpsertRows, { onConflict: 'date' });

      if (dailyError) {
        console.error('[TikTok Confirm] 日別売上保存エラー:', dailyError);
        throw dailyError;
      }
      console.log(`[TikTok Confirm] 日別売上保存: ${dailyUpsertRows.length}日分`);
    }

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

function normalizeSaleDate(value: string): string {
  const trimmed = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
  return new Date().toISOString().slice(0, 10);
}

// 月末日を取得する関数
function getMonthEndDate(yearMonth: string): string {
  // YYYY-MM形式の文字列から月末日を取得
  const [year, month] = yearMonth.split('-').map(Number);
  // 翌月の0日 = 当月の末日
  const lastDay = new Date(year, month, 0);

  const yyyy = lastDay.getFullYear();
  const mm = String(lastDay.getMonth() + 1).padStart(2, '0');
  const dd = String(lastDay.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}
