// /app/api/import/register/route.ts ver.2 (詳細なエラーログ出力付き)
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

    const dataToUpsert = results
      .map((result: ImportResult) => {
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
      .filter((item: any): item is object => item !== null);

    if (dataToUpsert.length === 0) {
      return NextResponse.json({ message: '登録対象のデータがありませんでした。' }, { status: 200 });
    }
    
    // [MODIFIED] エラーハンドリングを強化
    const { error: upsertError } = await supabase
      .from('web_sales_summary')
      .upsert(dataToUpsert, { onConflict: 'product_id,report_month' });

    if (upsertError) {
      // Supabaseからの詳細なエラーをサーバーログに出力
      console.error('Supabase Upsert Error:', JSON.stringify(upsertError, null, 2));
      // フロントエンドには分かりやすいメッセージを返す
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
