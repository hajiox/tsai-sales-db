// /app/api/import/register/route.ts ver.1
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

    // 1. 商品マスタから「商品名→ID」の対応マップを作成
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name');

    if (productsError) {
      throw new Error(`商品マスタの取得に失敗: ${productsError.message}`);
    }
    
    const productNameToIdMap = new Map(products.map(p => [p.name, p.id]));

    // 2. 登録用のデータ配列を作成
    const dataToUpsert = results
      .map((result: ImportResult) => {
        // マッチした商品名があり、かつマスタに存在する場合のみ処理
        if (result.matched && productNameToIdMap.has(result.matched)) {
          const productId = productNameToIdMap.get(result.matched);
          return {
            product_id: productId,
            report_month: report_month,
            ...result.salesData
          };
        }
        return null;
      })
      .filter((item: any): item is object => item !== null); // nullの項目を除外

    if (dataToUpsert.length === 0) {
      return NextResponse.json({ message: '登録対象のデータがありませんでした。' }, { status: 200 });
    }

    // 3. Supabaseのupsert機能で一括登録・更新
    // onConflictで指定したキーが重複した場合にUPDATEが実行される
    const { error: upsertError } = await supabase
      .from('web_sales_summary')
      .upsert(dataToUpsert, { onConflict: 'product_id,report_month' });

    if (upsertError) {
      console.error('Upsert error:', upsertError);
      throw new Error(`データベースへの登録に失敗しました: ${upsertError.message}`);
    }

    return NextResponse.json({
      message: `${dataToUpsert.length}件のデータが正常に登録・更新されました。`
    }, { status: 200 });

  } catch (error) {
    console.error('APIエラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'サーバー内部でエラーが発生しました。';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
