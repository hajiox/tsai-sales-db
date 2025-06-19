// /app/api/import/csv/route.ts ver.3 (AIによる商品名マッチング機能を追加)

import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import { supabase } from '@/lib/supabase'; // Supabaseクライアントをインポート
import OpenAI from 'openai'; // OpenAIクライアントをインポート

export const dynamic = 'force-dynamic';

// OpenAIクライアントの初期化
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
    
    // --- ▼ ここからAIマッチング処理を追加 ▼ ---

    // 1. データベースから商品マスタを取得
    const { data: productsMaster, error: dbError } = await supabase
      .from('products')
      .select('name'); // 商品名だけを取得

    if (dbError) throw new Error(`商品マスタの取得に失敗: ${dbError.message}`);
    
    const productMasterNames = productsMaster.map(p => p.name);

    // 2. CSVの1行目の商品名を取得 (列名が「商品名」であることを想定)
    const firstRowProductName = dataRows[0]['商品名'];
    if (!firstRowProductName) {
      return NextResponse.json({ error: 'CSVに「商品名」の列が見つかりません。' }, { status: 400 });
    }

    // 3. AIに問い合わせるプロンプトを作成
    const prompt = `
      以下のCSVの商品名を、商品マスタリストの中から最も一致するものを1つだけ選んで、その名前だけを返してください。
      余計な説明や前置きは一切不要です。商品マスタリスト内の名前そのものを返してください。

      CSVの商品名: "${firstRowProductName}"

      商品マスタリスト:
      ${productMasterNames.join('\n')}
    `;

    // 4. OpenAI APIを呼び出す
    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0, // 創造性を低くして、正確な回答を促す
    });

    const matchedProductName = aiResponse.choices[0].message.content;

    // --- ▲ ここまでAIマッチング処理を追加 ▲ ---

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
