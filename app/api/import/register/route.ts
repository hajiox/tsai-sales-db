// /app/api/import/register/route.ts
// ver.9 (データ集約版)
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('受信データ:', JSON.stringify(body, null, 2));

    const { results, report_month } = body;

    if (!results || !Array.isArray(results)) {
      return NextResponse.json({ error: 'resultsが配列ではありません。' }, { status: 400 });
    }

    // 商品マスタを取得
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name');

    if (productsError) {
      return NextResponse.json({ error: `商品マスタの取得に失敗: ${productsError.message}` }, { status: 500 });
    }

    const productNameToIdMap = new Map(products.map(p => [p.name, p.id]));

    // ECサイト名のマッピング
    const ecSiteMapping: { [key: string]: string } = {
      'Amazon': 'amazon_count',
      '楽天': 'rakuten_count',
      'Yahoo': 'yahoo_count',
      'メルカリ': 'mercari_count',
      'BASE': 'base_count',
      'Qoo10': 'qoo10_count'
    };

    // 商品ごとにデータを集約
    const aggregatedData = new Map<string, any>();

    for (const result of results) {
      if (result.matched && productNameToIdMap.has(result.matched)) {
        const productId = productNameToIdMap.get(result.matched);
        const key = `${productId}_${report_month}`;
        
        if (!aggregatedData.has(key)) {
          aggregatedData.set(key, {
            product_id: productId,
            report_month: `${report_month}-01`,
            amazon_count: 0,
            rakuten_count: 0,
            yahoo_count: 0,
            mercari_count: 0,
            base_count: 0,
            qoo10_count: 0
          });
        }

        const data = aggregatedData.get(key);
        
        // 販売数を集約
        for (const [ecSite, quantity] of Object.entries(result.salesData)) {
          const dbColumn = ecSiteMapping[ecSite];
          if (dbColumn && quantity > 0) {
            data[dbColumn] += quantity;
          }
        }
      }
    }

    const dataToUpsert = Array.from(aggregatedData.values());

    console.log('集約後の登録予定データ:', JSON.stringify(dataToUpsert, null, 2));

    if (dataToUpsert.length === 0) {
      return NextResponse.json({ message: '登録対象のデータがありませんでした。' }, { status: 200 });
    }

    // 実際にDBに登録
    const { error: upsertError } = await supabase
      .from('web_sales_summary')
      .upsert(dataToUpsert, { onConflict: 'product_id,report_month' });

    if (upsertError) {
      console.error('DB登録エラー:', upsertError);
      return NextResponse.json({ error: `データベース登録エラー: ${upsertError.message}` }, { status: 500 });
    }

    return NextResponse.json({
      message: `${dataToUpsert.length}件のデータを正常に登録しました。`
    }, { status: 200 });

  } catch (error) {
    console.error('APIエラー:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'サーバーエラー' 
    }, { status: 500 });
  }
}
