// /app/api/import/csv/route.ts
// ver.11 (Supabase統一版) - クライアント重複警告解決
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { Readable } from 'stream';
import { Buffer } from 'buffer';

// Vercelでの静的キャッシュを無効化（重要！）
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Node.jsランタイムを明示的に指定
export const runtime = 'nodejs';

// ストリームをバッファに変換するヘルパー関数
async function streamToBuffer(stream: Readable): Promise<Buffer> {
 const chunks: Buffer[] = [];
 for await (const chunk of stream) {
   chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
 }
 return Buffer.concat(chunks);
}

// 正しいCSVパース関数（カンマとクォート対応）
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

// 改善された商品マッチング関数
async function matchProductsByName(productNames: string[]) {
 console.log('🚀 VER.11 Supabase統一版が実行されています！');
 
 const { data: products, error } = await supabase
   .from('products')
   .select('id, name, series, price');

 if (error) {
   throw new Error(`商品マスタの取得に失敗しました: ${error.message}`);
 }

 console.log('📦 取得した商品マスタ数:', products?.length);
 
 return productNames.map(csvName => {
   console.log(`\n🔍 マッチング対象: "${csvName}"`);
   
   // 1. 完全一致を最優先
   let match = products?.find(p => p.name === csvName);
   if (match) {
     console.log(`  ✅ 完全一致: "${match.name}"`);
     return {
       id: match.id,
       name: match.name,
       series: match.series,
       price: match.price,
       similarity: 1.0
     };
   }
   
   // 2. 部分一致（CSVの商品名がマスタ商品名を含む）- より長い商品名を優先
   const partialMatches = products?.filter(p => csvName.includes(p.name)) || [];
   console.log(`  🔎 部分一致候補数: ${partialMatches.length}`);
   
   if (partialMatches.length > 0) {
     // 商品名の長い順にソートして、最も具体的なものを選択
     const sortedMatches = partialMatches.sort((a, b) => b.name.length - a.name.length);
     match = sortedMatches[0];
     
     console.log(`  🎯 部分一致(CSV⊃マスタ): "${match.name}" (長さ: ${match.name.length})`);
     console.log(`    📝 全候補: ${sortedMatches.map(p => `"${p.name}"(${p.name.length})`).join(', ')}`);
     console.log(`    🏆 選択理由: 最も長い商品名を優先選択`);
     
     return {
       id: match.id,
       name: match.name,
       series: match.series,
       price: match.price,
       similarity: 0.8
     };
   }
   
   // 3. 部分一致（マスタ商品名がCSVの商品名を含む）
   match = products?.find(p => p.name.includes(csvName));
   if (match) {
     console.log(`  🔄 部分一致(マスタ⊃CSV): "${match.name}"`);
     return {
       id: match.id,
       name: match.name,
       series: match.series,
       price: match.price,
       similarity: 0.6
     };
   }
   
   console.log(`  ❌ マッチなし`);
   return null;
 });
}

// ECサイト名とDBカラム名のマッピング（フロアを除外）
const ecSiteColumnMap: { [key: string]: string } = {
 'Amazon': 'amazon',
 '楽天市場': 'rakuten',
 '楽天': 'rakuten',
 'Yahoo!': 'yahoo',
 'Yahoo': 'yahoo',
 'メルカリ': 'mercari',
 'BASE': 'base',
 'Qoo10': 'qoo10'
};

export async function POST(req: NextRequest) {
 try {
   console.log('🚀🚀🚀 CSV IMPORT API VER.11 START 🚀🚀🚀');
   
   const formData = await req.formData();
   const file = formData.get('file') as File | null;
   const reportMonth = formData.get('reportMonth') as string | null;

   if (!file) {
     return NextResponse.json({ error: 'ファイルがアップロードされていません。' }, { status: 400 });
   }
   if (!reportMonth) {
     return NextResponse.json({ error: 'レポート月が指定されていません。' }, { status: 400 });
   }

   console.log('📅 レポート月:', reportMonth);

   // ファイルをバッファとして読み込む
   const fileBuffer = await streamToBuffer(file.stream() as any);
   
   // 文字コード判定（Shift_JISを優先的に試す）
   let fileContent = '';
   try {
       // Shift_JISでまず試す
       fileContent = new TextDecoder('shift_jis', { fatal: true }).decode(fileBuffer);
   } catch (e) {
       try {
           // Shift_JISで失敗したらUTF-8で試す
           fileContent = new TextDecoder('utf-8', { fatal: true }).decode(fileBuffer);
       } catch (utf8Error) {
           return NextResponse.json({ error: 'ファイルの文字コードがShift_JISまたはUTF-8ではありません。' }, { status: 400 });
       }
   }

   const lines = fileContent.split(/\r\n|\n/).filter(line => line.trim() !== '');
   if (lines.length < 2) {
     return NextResponse.json({ error: 'CSVにヘッダー行またはデータ行がありません。' }, { status: 400 });
   }

   console.log('📄 CSVデータ行数:', lines.length - 1);

   // ヘッダー行を正しくパース
   const header = parseCSVLine(lines[0]);
   console.log('📋 ヘッダー:', header);
   
   // 必要な列のインデックスを取得
   const productNameIndex = header.findIndex(h => h.includes('商品名'));
   const seriesIndex = header.findIndex(h => h.includes('シリーズ'));
   const priceIndex = header.findIndex(h => h.includes('価格'));
   
   if (productNameIndex === -1) {
     return NextResponse.json({ error: 'CSVに「商品名」を含む列が見つかりません。' }, { status: 400 });
   }

   console.log('📍 列インデックス - 商品名:', productNameIndex, 'シリーズ:', seriesIndex, '価格:', priceIndex);

   // 各ECサイトの列インデックスを取得
   const ecSiteIndices: { [key: string]: number } = {};
   for (const [csvName, dbName] of Object.entries(ecSiteColumnMap)) {
     const index = header.findIndex(h => h === csvName);
     if (index !== -1) {
       ecSiteIndices[dbName] = index;
     }
   }

   console.log('🛒 検出されたECサイト:', ecSiteIndices);

   // CSVデータを正しくパース
   const csvData = lines.slice(1).map((line, lineNumber) => {
     const columns = parseCSVLine(line);
     
     console.log(`📝 行${lineNumber + 1}: 商品名="${columns[productNameIndex]}" (列数: ${columns.length})`);
     
     // 各ECサイトの販売数を取得
     const salesByEcSite: { [key: string]: number } = {};
     for (const [ecSite, index] of Object.entries(ecSiteIndices)) {
       const value = parseInt(columns[index], 10) || 0;
       if (value > 0) {
         salesByEcSite[ecSite] = value;
         console.log(`  ${ecSite}: ${value}件`);
       }
     }
     
     return {
       productName: columns[productNameIndex],
       seriesName: seriesIndex !== -1 ? columns[seriesIndex] : null,
       price: priceIndex !== -1 ? parseInt(columns[priceIndex], 10) || 0 : 0,
       salesByEcSite: salesByEcSite
     };
   }).filter(item => item.productName && item.productName.length > 0);

   // 商品名を一括で部分一致検索にかける
   const productNames = csvData.map(d => d.productName);
   console.log('\n🔥🔥🔥 マッチング処理開始 (VER.11) 🔥🔥🔥');
   const matchedProducts = await matchProductsByName(productNames);
   console.log('🔥🔥🔥 マッチング処理終了 (VER.11) 🔥🔥🔥\n');
   
   // マッチング結果を整形（ECサイトごとに分割）
   const responseData: any[] = [];
   
   csvData.forEach((item, index) => {
     const match = matchedProducts[index];
     
     // 各ECサイトのデータを個別のレコードとして作成
     for (const [ecSite, quantity] of Object.entries(item.salesByEcSite)) {
       console.log(`📊 作成データ: ${item.productName} -> ${match?.name} (${ecSite}: ${quantity}件)`);
       responseData.push({
         csvProductName: item.productName,
         productId: match?.id || null,
         masterProductName: match?.name || null,
         seriesName: match?.series || item.seriesName,
         price: match?.price || item.price,
         similarity: match?.similarity || 0,
         quantity: quantity,
         ecSite: ecSite,
         reportMonth: reportMonth
       });
     }
   });

   console.log('✅ 最終データ件数:', responseData.length);

   return NextResponse.json({
     message: `CSV全${csvData.length}商品、${responseData.length}件のデータを読み込みました。(VER.11 Supabase統一版)`,
     data: responseData
   }, { status: 200 });

 } catch (error: any) {
   console.error('🚨 APIエラー:', error);
   const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました。';
   return NextResponse.json({ error: `APIエラー: ${errorMessage}` }, { status: 500 });
 }
}
