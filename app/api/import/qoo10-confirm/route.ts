// /app/api/import/qoo10-confirm/route.ts
// ver.4 (単価スナップショット対応)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getBulkProductUnitPrices } from '@/lib/unitPriceHelper';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })()
);

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  console.log('🟣 Qoo10確定API開始 - ver.3');

  try {
    const body = await request.json();
    console.log('受信データ（全体）:', JSON.stringify(body, null, 2));

    const { saleDate, matchedProducts, newMappings } = body;

    // 【修正】saleDateのエラーハンドリング強化
    let month: string;
    if (!saleDate || typeof saleDate !== 'string' || saleDate.length < 7) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      console.warn('saleDateが不正なため、現在の年月を使用:', month);
    } else {
      month = saleDate.substring(0, 7);
    }

    // 【修正】より詳細なデータ検証
    console.log('matchedProducts の型:', typeof matchedProducts);
    console.log('matchedProducts の配列チェック:', Array.isArray(matchedProducts));
    console.log('matchedProducts の中身:', matchedProducts);

    if (!matchedProducts) {
      console.error('matchedProducts が undefined/null です');
      return NextResponse.json(
        { success: false, error: 'マッチ商品データがありません' },
        { status: 400 }
      );
    }

    if (!Array.isArray(matchedProducts)) {
      console.error('matchedProducts が配列ではありません:', typeof matchedProducts);
      return NextResponse.json(
        { success: false, error: 'マッチ商品データの形式が正しくありません' },
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
          qoo10_title: mapping.qoo10Title,
          product_id: mapping.productId
        }));

        const { error: mappingError } = await supabase
          .from('qoo10_product_mapping')
          .upsert(mappingsToInsert, { onConflict: 'qoo10_title' });

        if (mappingError) {
          console.error('マッピング保存エラー:', mappingError);
          throw mappingError;
        }

        learnedCount = newMappings.length;
        console.log(`📚 Qoo10学習データ保存完了: ${learnedCount}件`);
      } catch (mappingError) {
        console.error('Qoo10マッピング処理エラー:', mappingError);
        return NextResponse.json(
          { success: false, error: 'マッピング保存に失敗しました: ' + (mappingError as Error).message },
          { status: 500 }
        );
      }
    }

    // 2. 売上データを商品IDごとに【集計】する
    const allSalesData: Array<{ productId: string; quantity: number }> = [];

    console.log('📊 マッチ商品データの処理開始:', matchedProducts.length, '件');

    // マッチ済み商品を追加
    for (let i = 0; i < matchedProducts.length; i++) {
      const item = matchedProducts[i];
      console.log(`項目 ${i}:`, JSON.stringify(item, null, 2));

      // 【修正】より柔軟なデータ構造対応
      let productId: string | undefined;
      let quantity: number = 0;

      // productInfo.id の取得（複数パターンに対応）
      if (item.productInfo && item.productInfo.id) {
        productId = item.productInfo.id;
      } else if (item.productId) {
        productId = item.productId;
      }

      // quantity の取得
      if (typeof item.quantity === 'number') {
        quantity = item.quantity;
      } else if (typeof item.count === 'number') {
        quantity = item.count;
      }

      if (productId && quantity > 0) {
        allSalesData.push({
          productId: productId,
          quantity: quantity
        });
        console.log(`✅ 処理対象に追加: productId=${productId}, quantity=${quantity}`);
      } else {
        console.warn(`⚠️ スキップ: productId=${productId}, quantity=${quantity}`);
      }
    }

    // 新規マッピング商品を追加
    if (newMappings && Array.isArray(newMappings)) {
      for (const item of newMappings) {
        if (item.productId) {
          allSalesData.push({
            productId: item.productId,
            quantity: item.quantity || 0
          });
        }
      }
    }

    console.log('📊 最終処理対象データ:', allSalesData.length, '件');

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

    const aggregatedSales = new Map<string, number>();
    for (const item of allSalesData) {
      const currentQuantity = aggregatedSales.get(item.productId) || 0;
      aggregatedSales.set(item.productId, currentQuantity + item.quantity);
    }

    console.log(`🔍 元データ件数: ${allSalesData.length}件 → 集計後: ${aggregatedSales.size}件`);

    // 3. 集計後のデータでDBを更新
    const productIds = Array.from(aggregatedSales.keys());
    const unitPriceMap = await getBulkProductUnitPrices(supabase, productIds);

    for (const [productId, totalQuantity] of aggregatedSales.entries()) {
      try {
        const reportMonth = `${month}-01`;
        console.log(`🔄 処理中: product_id=${productId}, quantity=${totalQuantity}, month=${reportMonth}`);

        // 既存レコード確認
        const { data: existingData, error: selectError } = await supabase
          .from('web_sales_summary')
          .select('id, qoo10_count')
          .eq('product_id', productId)
          .eq('report_month', reportMonth)
          .single();

        if (selectError && selectError.code !== 'PGRST116') {
          console.error('既存レコード検索エラー:', selectError);
          throw selectError;
        }

        if (existingData) {
          // 更新
          console.log(`📝 既存レコード更新: id=${existingData.id}, 旧qoo10_count=${existingData.qoo10_count}`);
          const { error: updateError } = await supabase
            .from('web_sales_summary')
            .update({ qoo10_count: totalQuantity })
            .eq('id', existingData.id);

          if (updateError) {
            console.error('更新エラー:', updateError);
            throw updateError;
          }
          console.log(`✅ 更新成功: qoo10_count=${totalQuantity}`);
        } else {
          // 新規挿入
          console.log(`📝 新規レコード挿入`);
          const unitPrice = unitPriceMap.get(productId) || { unit_price: 0, unit_profit_rate: 0 };
          const { error: insertError } = await supabase
            .from('web_sales_summary')
            .insert({
              product_id: productId,
              report_month: reportMonth,
              qoo10_count: totalQuantity,
              unit_price: unitPrice.unit_price,
              unit_profit_rate: unitPrice.unit_profit_rate,
            });

          if (insertError) {
            console.error('挿入エラー:', insertError);
            throw insertError;
          }
          console.log(`✅ 新規挿入成功: qoo10_count=${totalQuantity}`);
        }
        successCount++;
      } catch (itemError) {
        console.error(`❌ DB処理エラー (product_id: ${productId}):`, itemError);
        errorCount++;
      }
    }

    const isSuccess = successCount > 0 && errorCount === 0;
    console.log(`Qoo10確定処理完了: 成功${successCount}件, エラー${errorCount}件, 学習${learnedCount}件`);

    return NextResponse.json({
      success: isSuccess,
      message: isSuccess
        ? `Qoo10データの更新が完了しました (成功: ${successCount}件)`
        : `一部エラーが発生しました (成功: ${successCount}件, エラー: ${errorCount}件)`,
      successCount,
      errorCount,
      totalCount: aggregatedSales.size,
      learnedMappings: learnedCount,
    });

  } catch (error) {
    console.error('Qoo10確定API エラー:', error);
    return NextResponse.json(
      { success: false, error: 'サーバーエラーが発生しました: ' + (error instanceof Error ? error.message : '不明なエラー') },
      { status: 500 }
    );
  }
}
