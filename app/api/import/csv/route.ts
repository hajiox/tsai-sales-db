// /app/api/import/csv/route.ts
// ver3 (一括インポート対応版)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { matchProducts } from '@/lib/db/productMatcher';
import { Readable } from 'stream';
import { Buffer } from 'buffer';

// Node.jsランタイムを明示的に指定
export const runtime = 'nodejs';

// Supabaseクライアントを初期化
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

// ECサイト名とDBカラム名のマッピング
const ecSiteColumnMap: { [key: string]: string } = {
  'Amazon': 'amazon',
  '楽天': 'rakuten',
  'Yahoo!': 'yahoo',
  'Yahoo': 'yahoo', // Yahooの別表記にも対応
  'メルカリ': 'mercari',
  'BASE': 'base',
  'Qoo10': 'qoo10'
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const reportMonth = formData.get('reportMonth') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'ファイルがアップロードされていません。' }, { status: 400 });
    }
    if (!reportMonth) {
      return NextResponse.json({ error: 'レポート月が指定されていません。' }, { status: 400 });
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

    // ヘッダー行を解析
    const header = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    
    // 必要な列のインデックスを取得
    const productNameIndex = header.findIndex(h => h.includes('商品名'));
    const seriesIndex = header.findIndex(h => h.includes('シリーズ'));
    const priceIndex = header.findIndex(h => h.includes('価格'));
    
    if (productNameIndex === -1) {
      return NextResponse.json({ error: 'CSVに「商品名」を含む列が見つかりません。' }, { status: 400 });
    }

    // 各ECサイトの列インデックスを取得
    const ecSiteIndices: { [key: string]: number } = {};
    for (const [csvName, dbName] of Object.entries(ecSiteColumnMap)) {
      const index = header.findIndex(h => h === csvName);
      if (index !== -1) {
        ecSiteIndices[dbName] = index;
      }
    }

    // CSVデータを解析
    const csvData = lines.slice(1).map(line => {
      const columns = line.split(',').map(c => c.replace(/"/g, '').trim());
      
      // 各ECサイトの販売数を取得
      const salesByEcSite: { [key: string]: number } = {};
      for (const [ecSite, index] of Object.entries(ecSiteIndices)) {
        const value = parseInt(columns[index], 10) || 0;
        if (value > 0) {
          salesByEcSite[ecSite] = value;
        }
      }
      
      return {
        productName: columns[productNameIndex],
        seriesName: seriesIndex !== -1 ? columns[seriesIndex] : null,
        price: priceIndex !== -1 ? parseInt(columns[priceIndex], 10) || 0 : 0,
        salesByEcSite: salesByEcSite
      };
    }).filter(item => item.productName && item.productName.length > 0);

    // 商品名を一括でベクトル検索にかける
    const productNames = csvData.map(d => d.productName);
    const matchedProducts = await matchProducts(productNames);
    
    // マッチング結果を整形（ECサイトごとに分割）
    const responseData: any[] = [];
    
    csvData.forEach((item, index) => {
      const match = matchedProducts[index];
      
      // 各ECサイトのデータを個別のレコードとして作成
      for (const [ecSite, quantity] of Object.entries(item.salesByEcSite)) {
        responseData.push({
          csvProductName: item.productName,
          productId: match?.id || null,
          masterProductName: match?.name || null,
          seriesId: match?.series_id || null,
          seriesName: item.seriesName,
          price: match?.price || item.price,
          similarity: match?.similarity || 0,
          quantity: quantity,
          ecSite: ecSite,
          reportMonth: reportMonth
        });
      }
    });

    return NextResponse.json({
      message: `CSV全${csvData.length}商品、${responseData.length}件のデータを読み込みました。`,
      data: responseData
    }, { status: 200 });

  } catch (error: any) {
    console.error('APIエラー:', error);
    const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました。';
    return NextResponse.json({ error: `APIエラー: ${errorMessage}` }, { status: 500 });
  }
}
