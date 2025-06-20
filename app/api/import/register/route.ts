// /app/api/import/register/route.ts
// ver.4 (salesDataキー名対応版)
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ImportResult = {
  id: number;
  original: string;
  matched: string | null;
  salesData: { [key: string]: number };
};

export async function POST(request: Request) {
  try {
    const { results, report_month } = await request.json();

    if (!results || !report_month) {
      return NextResponse.json({ error: '必要なデータが不足しています。' }, { status: 400 });
    }

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name');

    if (productsError) {
      throw new Error(`商品マスタの取得に失敗: ${productsError.message}`);
    }
    
    const productNameToIdMap = new Map(products.map(p => [p.name, p.id]));

    // ECサイト名のマッピング（フロントエンド → DB）
    const ecSiteMapping: { [key: string]: string } = {
      'Amazon': 'amazon',
      '楽天': 'rakuten',
      'Yahoo': 'yahoo',
      'メルカリ': 'mercari',
      'BASE': 'base',
      'Qoo10': 'qoo10'
    };

    const dataToUpsert = results
      .map((result: ImportResult) => {
        if (result.matched && productNameToIdMap.has(result.matched)) {
          const productId = productNameToIdMap.get(result.matched);
          
          // salesDataのキー名を変換
          const convertedSalesData: { [key: string]: number } = {};
          for (const [frontendKey, quantity] of Object.entries(result.salesData)) {
            const dbKey = ecSiteMapping[frontendKey];
            if (dbKey && quantity > 0) {
              convertedSalesData[dbKey] = quantity;
            }
          }
          
          return {
            product_id: productId,
            report_month: `${report_month}-01`,
            ...convertedSalesData
          };
        }
        return null;
      })
      .filter((item: any): item is object => item !== null);

    if (dataToUpsert.length === 0) {
      return NextResponse.json({ message: '登録対象のデータがありませんでした。' }, { status: 200 });
    }

    console.log('登録予定データ:', JSON.stringify(dataToUpsert, null, 2));

    const { error: upsertError } = await supabase
      .from('web_sales_summary')
      .upsert(dataToUpsert, { onConflict: 'product_id,report_month' });

    if (upsertError) {
      console.error('Supabase Upsert Error:', JSON.stringify(upsertError, null, 2));
      throw new Error(`データベースへの登録に失敗しました。詳細はサーバーログを確認してください。`);
    }

    return NextResponse.json({
      message: `${dataToUpsert.length}件のデータが正常に登録・更新されました。`
    }, { status: 200 });

  } catch (error) {
    console.error('APIルート全体のエラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'サーバー内部でエラーが発生しました。';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
