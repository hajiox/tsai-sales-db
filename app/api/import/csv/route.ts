// /app/api/import/csv/route.ts ver.4 (エラーメッセージ改善)

import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import { supabase } from '@/lib/supabase';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'ファイルがありません。' }, { status: 400 });
    }

    const csvString = await file.text();
    const parsedData = Papa.parse(csvString, {
      header: true,
      skipEmptyLines: true,
    });

    if (parsedData.errors.length > 0) {
      return NextResponse.json({ error: 'CSVの解析に失敗しました。' }, { status: 400 });
    }

    const dataRows = parsedData.data as { [key: string]: string }[];
    if (dataRows.length === 0) {
      return NextResponse.json({ error: 'CSVにデータがありません。' }, { status: 400 });
    }
    
    // --- ▼ ここから修正 ▼ ---

    // CSVから検出されたヘッダー名（列名）の一覧を取得
    const detectedHeaders = Object.keys(dataRows[0]);
    console.log('CSVから検出されたヘッダー一覧:', detectedHeaders);

    // 「商品名」というキーが存在するかチェック
    const productNameKey = '商品名';
    if (!(productNameKey in dataRows[0])) {
      // 存在しない場合、検出されたヘッダー一覧をエラーメッセージに含めて返す
      return NextResponse.json({
        error: `CSVに「${productNameKey}」の列が見つかりません。検出された列名: [${detectedHeaders.join(', ')}]`
      }, { status: 400 });
    }
    
    const firstRowProductName = dataRows[0][productNameKey];
    if (!firstRowProductName) {
       return NextResponse.json({ error: 'CSVの1行目に商品名がありません。' }, { status: 400 });
    }

    // --- ▲ ここまで修正 ▲ ---

    const { data: productsMaster, error: dbError } = await supabase
      .from('products')
      .select('name');

    if (dbError) throw new Error(`商品マスタの取得に失敗: ${dbError.message}`);
    
    const productMasterNames = productsMaster.map(p => p.name);

    const prompt = `
      以下のCSVの商品名を、商品マスタリストの中から最も一致するものを1つだけ選んで、その名前だけを返してください。
      余計な説明や前置きは一切不要です。商品マスタリスト内の名前そのものを返してください。

      CSVの商品名: "${firstRowProductName}"

      商品マスタリスト:
      ${productMasterNames.join('\n')}
    `;

    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    });

    const matchedProductName = aiResponse.choices[0].message.content;

    return NextResponse.json({
      message: 'AIによる商品名のマッチング（テスト）に成功しました。',
      csvProductName: firstRowProductName,
      matchedProductName: matchedProductName,
    }, { status: 200 });

  } catch (error) {
    console.error('APIエラー:', error);
    return NextResponse.json({ error: 'ファイルの処理中にエラーが発生しました。' }, { status: 500 });
  }
}
