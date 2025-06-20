// /app/api/import/csv/route.ts ver.10
import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import { supabase } from '@/lib/supabase';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // [ADD] Node.jsランタイムを明示的に指定

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// CSVの列名とDBの列名を対応させるためのマップ
const columnMap: { [key: string]: string } = {
  'Amazon': 'amazon_count',
  '楽天': 'rakuten_count',
  'Yahoo': 'yahoo_count',
  'メルカリ': 'mercari_count',
  'BASE': 'base_count',
  'Qoo10': 'qoo10_count',
};

export async function POST(request: Request) {
  try {
    // 1. ファイル受付とCSV解析
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'ファイルがありません。' }, { status: 400 });
    }
    const fileBuffer = await file.arrayBuffer();
    const decoder = new TextDecoder('shift-jis');
    const csvString = decoder.decode(fileBuffer);
    const parsedData = Papa.parse(csvString, { header: true, skipEmptyLines: true });
    if (parsedData.errors.length > 0) {
      return NextResponse.json({ error: 'CSVの解析に失敗しました。', details: parsedData.errors }, { status: 400 });
    }
    const dataRows = parsedData.data as { [key: string]: string }[];
    if (dataRows.length === 0) {
      return NextResponse.json({ error: 'CSVにデータがありません。' }, { status: 400 });
    }
    
    // 2. CSVヘッダーと商品名の抽出
    const detectedHeaders = Object.keys(dataRows[0]);
    const productNameHeader = detectedHeaders.find(h => h.trim().startsWith('商品名'));
    if (!productNameHeader) {
      return NextResponse.json({ error: `CSVに「商品名」で始まる列が見つかりません。` }, { status: 400 });
    }
    const uniqueCsvProductNames = [...new Set(dataRows.map(row => row[productNameHeader]).filter(Boolean))];
    if (uniqueCsvProductNames.length === 0) {
        return NextResponse.json({ error: 'CSV内に有効な商品名が見つかりません。' }, { status: 400 });
    }

    // 3. 商品マスタの取得とAIによるマッチング
    const { data: productsMaster, error: dbError } = await supabase.from('products').select('name');
    if (dbError) throw new Error(`商品マスタの取得に失敗: ${dbError.message}`);
    const productMasterNames = productsMaster.map(p => p.name);

    const prompt = `以下の「CSV商品名リスト」の各商品名に対して、最も一致するものを「商品マスタリスト」の中から1つだけ選び、結果をJSON形式で返してください。 # 命令 - 返却形式は必ず {"CSV商品名1": "マスター上の商品名1", "CSV商品名2": "マスター上の商品名2"} というJSONオブジェクトにしてください。 - もし「商品マスタリスト」に一致するものがなければ、そのCSV商品名の値は null にしてください。 - 余計な説明や前置き、\`\`\`json ... \`\`\`のようなマークダウンは一切含めないでください。JSONオブジェクトそのものを返してください。 # CSV商品名リスト ${uniqueCsvProductNames.join('\n')} # 商品マスタリスト ${productMasterNames.join('\n')}`;

    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      response_format: { type: "json_object" },
    });
    const resultJsonString = aiResponse.choices[0].message.content;
    if (!resultJsonString) throw new Error("AIからの応答が空です。");
    const matchedProductsMap = JSON.parse(resultJsonString);

    // 4. 販売数データを含めた最終結果を生成
    const results = dataRows.map((row, index) => {
      const originalName = row[productNameHeader];
      const salesData: { [key: string]: number } = {};
      
      for (const csvHeader in columnMap) {
        if (row[csvHeader]) {
          const dbColumn = columnMap[csvHeader];
          salesData[dbColumn] = parseInt(row[csvHeader], 10) || 0;
        }
      }

      return {
        id: index,
        original: originalName,
        matched: matchedProductsMap[originalName] || null,
        salesData: salesData,
      };
    });

    return NextResponse.json({
      message: `CSV全${dataRows.length}行のAIによる商品名マッチングとデータ読み込みが完了しました。`,
      results: results,
    }, { status: 200 });

  } catch (error) {
    console.error('APIエラー:', error);
    const errorMessage = error instanceof Error ? error.message : 'ファイルの処理中にエラーが発生しました。';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
