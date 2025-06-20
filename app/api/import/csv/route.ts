// /app/api/import/csv/route.ts ver.11 (ベクトル検索対応版)
import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import { supabase } from '@/lib/supabase';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    // 1. CSV解析 (変更なし)
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) throw new Error('ファイルがありません。');
    
    const csvString = await file.text(); // 文字コードはここで自動的にUTF-8として扱われることを期待
    const parsedData = Papa.parse(csvString, { header: true, skipEmptyLines: true });
    if (parsedData.errors.length > 0) throw new Error('CSVの解析に失敗しました。');
    
    const dataRows = parsedData.data as { [key: string]: string }[];
    if (dataRows.length === 0) throw new Error('CSVにデータがありません。');
    
    const productNameHeader = Object.keys(dataRows[0]).find(h => h.trim().startsWith('商品名'));
    if (!productNameHeader) throw new Error('CSVに「商品名」で始まる列が見つかりません。');
    
    const uniqueCsvProductNames = [...new Set(dataRows.map(row => row[productNameHeader]).filter(Boolean))];
    if (uniqueCsvProductNames.length === 0) throw new Error('CSV内に有効な商品名が見つかりません。');

    // 2. [NEW] CSVの商品名をベクトル化
    const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: uniqueCsvProductNames,
    });
    
    const csvNameToEmbeddingMap = new Map(
        uniqueCsvProductNames.map((name, i) => [name, embeddingResponse.data[i].embedding])
    );

    // 3. [NEW] ベクトルを使ってDB関数で類似商品を検索
    const matchedProductsMap = new Map<string, string | null>();

    for (const [name, embedding] of csvNameToEmbeddingMap.entries()) {
        const { data: matchResult, error: rpcError } = await supabase.rpc('match_products', {
            query_embedding: embedding,
            match_threshold: 0.5, // 類似度の閾値 (0.0〜1.0)
            match_count: 1,       // 最も近いものを1件だけ取得
        });

        if (rpcError) {
            console.error(`RPC Error for "${name}":`, rpcError);
            matchedProductsMap.set(name, null);
            continue;
        }

        if (matchResult && matchResult.length > 0) {
            matchedProductsMap.set(name, matchResult[0].name);
        } else {
            matchedProductsMap.set(name, null);
        }
    }

    // 4. 最終結果を生成 (変更なし)
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
        matched: matchedProductsMap.get(originalName) || null,
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
