// /app/api/import/base-confirm/route.ts
// ver.3 (実売金額対応版)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBulkProductUnitPrices } from '@/lib/unitPriceHelper';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })()
);

export const dynamic = 'force-dynamic';

interface ConfirmRequest {
  saleDate: string;
  matchedProducts: Array<{
    baseTitle: string;
    productInfo: {
      id: string;
    };
    quantity: number;
    amount?: number;
  }>;
  newMappings: Array<{
    baseTitle: string;
    productId: string;
    quantity: number;
    amount?: number;
  }>;
}

export async function POST(request: NextRequest) {
  console.log('🏪 BASE確定API開始 - ver.1 (楽天完全移植版)');

  try {
    const body: ConfirmRequest = await request.json();
    console.log('受信データ:', JSON.stringify(body, null, 2));

    const { saleDate, matchedProducts, newMappings } = body;
    const month = saleDate.substring(0, 7);

    if (!month) {
      console.error('月情報が不正:', saleDate);
      return NextResponse.json(
        { success: false, error: '売上月が不正です' },
        { status: 400 }
      );
    }

    if (!matchedProducts || !Array.isArray(matchedProducts)) {
      console.error('マッチ商品データが不正:', matchedProducts);
      return NextResponse.json(
        { success: false, error: 'マッチ商品データが不正です' },
        { status: 400 }
      );
    }

    let successCount = 0;
    let errorCount = 0;
    let learnedCount = 0;

    // 1. 新しいマッピングを学習
    if (newMappings && Array.isArray(newMappings) && newMappings.length > 0) {
      try {
        console.log('📚 新しいマッピング学習開始:', newMappings.length, '件');

        const mappingsToInsert = newMappings.map(mapping => ({
          base_title: mapping.baseTitle,
          product_id: mapping.productId
        }));

        const { error: mappingError } = await supabase
          .from('base_product_mapping')
          .upsert(mappingsToInsert, { onConflict: 'base_title' });

        if (mappingError) {
          console.error('マッピング保存エラー:', mappingError);
          throw mappingError;
        }

        learnedCount = newMappings.length;
        console.log(`📚 BASE学習データ保存完了: ${learnedCount}件`);
      } catch (mappingError) {
        console.error('BASEマッピング処理エラー:', mappingError);
        return NextResponse.json(
          { success: false, error: 'マッピング保存に失敗しました: ' + (mappingError as Error).message },
          { status: 500 }
        );
      }
    }

    // 2. 売上データを商品IDごとに【集計】する
    const allSalesData: Array<{ productId: string; quantity: number; amount: number }> = [];

    // マッチ済み商品を追加
    for (const item of matchedProducts) {
      if (item.productInfo && item.productInfo.id) {
        allSalesData.push({
          productId: item.productInfo.id,
          quantity: item.quantity || 0,
          amount: item.amount || 0
        });
      }
    }

    // 新規マッピング商品を追加
    if (newMappings && Array.isArray(newMappings)) {
      for (const item of newMappings) {
        if (item.productId) {
          allSalesData.push({
            productId: item.productId,
            quantity: item.quantity || 0,
            amount: item.amount || 0
          });
        }
      }
    }

    console.log('📊 処理対象データ:', allSalesData.length, '件');

    if (allSalesData.length === 0) {
      return NextResponse.json({
        success: true,
        message: '処理対象データがありませんでした',
        totalCount: 0,
        successCount: 0,
        errorCount: 0,
        learnedMappings: learnedCount
      });
    }

    const aggregatedSales = new Map<string, { quantity: number; amount: number }>();
    for (const item of allSalesData) {
      const current = aggregatedSales.get(item.productId) || { quantity: 0, amount: 0 };
      aggregatedSales.set(item.productId, {
        quantity: current.quantity + item.quantity,
        amount: current.amount + item.amount
      });
    }

    console.log(`🔍 元データ件数: ${allSalesData.length}件 → 集計後: ${aggregatedSales.size}件`);

    // 3. 集計後のデータでDBを更新
    const productIds = Array.from(aggregatedSales.keys());
    const unitPriceMap = await getBulkProductUnitPrices(supabase, productIds);

    for (const [productId, salesData] of aggregatedSales.entries()) {
      try {
        const reportMonth = `${month}-01`;
        const totalQuantity = salesData.quantity;
        const totalAmount = salesData.amount;
        // CSV実売金額から加重平均単価を計算
        const csvUnitPrice = totalQuantity > 0 ? Math.round(totalAmount / totalQuantity) : 0;
        console.log(`🔄 処理中: product_id=${productId}, quantity=${totalQuantity}, amount=${totalAmount}, csv_unit_price=${csvUnitPrice}, month=${reportMonth}`);

        // 既存レコード確認
        const { data: existingData, error: selectError } = await supabase
          .from('web_sales_summary')
          .select('id, base_count, unit_price')
          .eq('product_id', productId)
          .eq('report_month', reportMonth)
          .single();

        if (selectError && selectError.code !== 'PGRST116') {
          console.error('既存レコード検索エラー:', selectError);
          throw selectError;
        }

        // unit_price: CSV実売価格があればそれを使用、なければマスター価格
        const finalUnitPrice = csvUnitPrice > 0 ? csvUnitPrice : (unitPriceMap.get(productId)?.unit_price || 0);

        if (existingData) {
          // 更新
          console.log(`📝 既存レコード更新: id=${existingData.id}, 旧base_count=${existingData.base_count}`);
          const updateData: any = { base_count: totalQuantity };
          // CSV実売単価があればunit_priceも更新
          if (csvUnitPrice > 0) {
            updateData.unit_price = finalUnitPrice;
          }
          const { error: updateError } = await supabase
            .from('web_sales_summary')
            .update(updateData)
            .eq('id', existingData.id);

          if (updateError) {
            console.error('更新エラー:', updateError);
            throw updateError;
          }
          console.log(`✅ 更新成功: base_count=${totalQuantity}, unit_price=${finalUnitPrice}`);
        } else {
          // 新規挿入
          console.log(`📝 新規レコード挿入`);
          const unitPrice = unitPriceMap.get(productId) || { unit_price: 0, unit_profit_rate: 0 };
          const { error: insertError } = await supabase
            .from('web_sales_summary')
            .insert({
              product_id: productId,
              report_month: reportMonth,
              base_count: totalQuantity,
              unit_price: csvUnitPrice > 0 ? finalUnitPrice : unitPrice.unit_price,
              unit_profit_rate: unitPrice.unit_profit_rate,
            });

          if (insertError) {
            console.error('挿入エラー:', insertError);
            throw insertError;
          }
          console.log(`✅ 新規挿入成功: base_count=${totalQuantity}, unit_price=${finalUnitPrice}`);
        }
        successCount++;
      } catch (itemError) {
        console.error(`❌ DB処理エラー (product_id: ${productId}):`, itemError);
        errorCount++;
      }
    }

    const isSuccess = successCount > 0 && errorCount === 0;
    console.log(`BASE確定処理完了: 成功${successCount}件, エラー${errorCount}件, 学習${learnedCount}件`);

    return NextResponse.json({
      success: isSuccess,
      message: isSuccess
        ? `BASEデータの更新が完了しました (成功: ${successCount}件)`
        : `一部エラーが発生しました (成功: ${successCount}件, エラー: ${errorCount}件)`,
      successCount,
      errorCount,
      totalCount: aggregatedSales.size,
      learnedMappings: learnedCount,
    });

  } catch (error) {
    console.error('BASE確定API エラー:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました: ' + (error instanceof Error ? error.message : '不明なエラー') },
      { status: 500 }
    );
  }
}
