// /app/api/import/csv/route.ts
// ver2 (商品名ヘッダーの検索を柔軟化)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { matchProducts } from '@/lib/db/productMatcher';
import { Readable } from 'stream';
import { Buffer } from 'buffer';

// Node.jsランタイムを明示的に指定
export const runtime = 'nodejs';

// Vercel KVから設定を読み込む
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL or Anon Key is not defined');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ストリームをバッファに変換するヘルパー関数
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const reportMonth = formData.get('reportMonth') as string | null;
    const ecSite = formData.get('ecSite') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'ファイルがアップロードされていません。' }, { status: 400 });
    }
    if (!reportMonth) {
      return NextResponse.json({ error: 'レポート月が指定されていません。' }, { status: 400 });
    }
    if (!ecSite) {
        return NextResponse.json({ error: 'ECサイトが指定されていません。' }, { status: 400 });
    }

    // ファイルをテキストとして読み込む
    const fileBuffer = await streamToBuffer(file.stream() as any);
    
    // 文字コード判定（Shift_JISを優先的に試す）
    let fileContent = '';
    try {
        // UTF-8でまず試す
        fileContent = new TextDecoder('utf-8', { fatal: true }).decode(fileBuffer);
    } catch (e) {
        try {
            // UTF-8で失敗したらShift_JISで試す
            fileContent = new TextDecoder('shift-jis', { fatal: true }).decode(fileBuffer);
        } catch (sjisError) {
            return NextResponse.json({ error: 'ファイルの文字コードがUTF-8またはShift_JISではありません。' }, { status: 400 });
        }
    }

    const lines = fileContent.split(/\r\n|\n/).filter(line => line.trim() !== '');
    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSVにヘッダー行またはデータ行がありません。' }, { status: 400 });
    }

    // ヘッダー行を検証し、必要な列のインデックスを取得
    const header = lines[0].split(',').map(h => h.replace(/"/g, '').trim());

    // ★★★★★★★★★★★★★★★★★★★★ 修正点 ★★★★★★★★★★★★★★★★★★★★
    // 'startsWith' から 'includes' に変更し、より柔軟なヘッダー名に対応
    const productNameIndex = header.findIndex(h => h.includes('商品名'));
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★

    const quantityIndex = header.findIndex(h => h.includes('個数') || h.includes('数量'));
    const amountIndex = header.findIndex(h => h.includes('売上') || h.includes('金額'));

    if (productNameIndex === -1) {
      // エラーメッセージも修正に合わせて変更
      return NextResponse.json({ error: 'CSVに「商品名」を含む列が見つかりません。' }, { status: 400 });
    }
    if (quantityIndex === -1) {
        return NextResponse.json({ error: 'CSVに「個数」または「数量」を含む列が見つかりません。' }, { status: 400 });
    }
    if (amountIndex === -1) {
        return NextResponse.json({ error: 'CSVに「売上」または「金額」を含む列が見つかりません。' }, { status: 400 });
    }

    // CSVデータを解析
    const csvData = lines.slice(1).map(line => {
      const columns = line.split(',').map(c => c.replace(/"/g, '').trim());
      return {
        productName: columns[productNameIndex],
        quantity: parseInt(columns[quantityIndex], 10) || 0,
        amount: parseInt(columns[amountIndex], 10) || 0,
      };
    }).filter(item => item.productName && item.productName.length > 0); // 商品名が空の行は除外


    // 商品名を一括でベクトル検索にかける
    const productNames = csvData.map(d => d.productName);
    const matchedProducts = await matchProducts(productNames);
    
    // マッチング結果を元のデータに結合
    const responseData = csvData.map((item, index) => {
      const match = matchedProducts[index];
      return {
        csvProductName: item.productName,
        productId: match.id,
        masterProductName: match.name,
        seriesId: match.series_id,
        price: match.price,
        similarity: match.similarity,
        quantity: item.quantity,
        amount: item.amount,
      };
    });

    return NextResponse.json(responseData, { status: 200 });

  } catch (error: any) {
    console.error('APIエラー:', error);
    // エラーオブジェクトがErrorインスタンスであるかを確認
    const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました。';
    return NextResponse.json({ error: `APIエラー: ${errorMessage}` }, { status: 500 });
  }
}
