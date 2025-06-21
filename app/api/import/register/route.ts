// /app/api/import/register/route.ts
// ver.7 (完全デバッグ版)
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('=== デバッグ開始 ===');
    console.log('1. 受信データ:', JSON.stringify(body, null, 2));

    const { results, report_month } = body;

    console.log('2. results配列:', results);
    console.log('3. results配列の長さ:', results?.length);
    console.log('4. 最初のresult:', results?.[0]);

    if (!results || !Array.isArray(results)) {
      console.log('5. resultsが配列ではない');
      return NextResponse.json({ error: 'resultsが配列ではありません。' }, { status: 400 });
    }

    console.log('6. 各resultの確認:');
    results.forEach((result, index) => {
      console.log(`   result[${index}]:`, {
        matched: result?.matched,
        hasMatched: !!result?.matched,
        salesData: result?.salesData
      });
    });

    // マッチした商品を取得
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name');

    if (productsError) {
      console.log('7. 商品取得エラー:', productsError);
      return NextResponse.json({ error: `商品マスタの取得に失敗: ${productsError.message}` }, { status: 500 });
    }

    console.log('8. 商品マスタ件数:', products?.length);
    console.log('9. 商品マスタサンプル:', products?.slice(0, 3));

    const productNameToIdMap = new Map(products.map(p => [p.name, p.id]));
    console.log('10. 商品名マップサンプル:', Array.from(productNameToIdMap.entries()).slice(0, 3));

    const validResults = results.filter(result => {
      const isValid = result?.matched && productNameToIdMap.has(result.matched);
      console.log(`    商品「${result?.matched}」: ${isValid ? '有効' : '無効'}`);
      return isValid;
    });

    console.log('11. 有効なresults数:', validResults.length);

    if (validResults.length === 0) {
      console.log('12. 有効なデータなし');
      return NextResponse.json({ 
        error: '登録対象のデータがありませんでした。',
        debug: {
          totalResults: results.length,
          validResults: validResults.length,
          firstResultMatched: results[0]?.matched,
          hasProductInMap: results[0]?.matched ? productNameToIdMap.has(results[0].matched) : false
        }
      }, { status: 400 });
    }

    return NextResponse.json({
      message: 'デバッグ成功',
      validResults: validResults.length
    }, { status: 200 });

  } catch (error) {
    console.error('=== APIエラー ===', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'サーバーエラー',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}
