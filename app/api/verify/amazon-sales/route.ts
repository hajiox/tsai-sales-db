// /app/api/verify/amazon-sales/route.ts ver.5 (テーブル参照修正版)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Amazon CSVパース（TSV形式、固定列）
function parseAmazonCsvLine(line: string): string[] {
  const columns: string[] = [];
  let currentColumn = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && inQuotes && line[i + 1] === '"') {
      currentColumn += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === '\t' && !inQuotes) {
      columns.push(currentColumn.trim());
      currentColumn = '';
    } else {
      currentColumn += char;
    }
  }
  columns.push(currentColumn.trim());
  return columns;
}

export async function POST(request: NextRequest) {
  try {
    const { csvContent, saleMonth } = await request.json();
    const reportMonth = `${saleMonth}-01`;

    console.log('📂 Amazon CSV検証開始 - 対象月:', saleMonth);

    // 1. CSVを行分割（ヘッダー1行スキップ）
    const lines = csvContent.split('\n').filter((line: string) => line.trim() !== '');
    const dataLines = lines.slice(1); // ヘッダー行をスキップ
    
    console.log('📊 データ行数:', dataLines.length);

    // 2. Amazon固定フォーマットで解析
    const csvSalesData = dataLines.map((line: string) => {
      const columns = parseAmazonCsvLine(line);
      const title = columns[2]?.replace(/"/g, '').trim(); // C列: タイトル
      const quantity = parseInt(columns[13]?.replace(/"/g, '').trim() || '0', 10); // N列: 注文された商品点数
      
      return { amazonTitle: title, quantity };
    }).filter((item: any) => item.amazonTitle && item.quantity > 0);

    console.log('✅ 有効データ数:', csvSalesData.length, '件');

    // 3. 商品マスターと学習データを取得
    const { data: products } = await supabase.from('products').select('*');
    // 👆 Amazon用の学習データテーブルに修正
    const { data: learnedMappings } = await supabase.from('amazon_product_mapping').select('amazon_title, product_id');
    const learningData = (learnedMappings || []).map(m => ({ amazon_title: m.amazon_title, product_id: m.product_id }));

    // 4. CSVデータから商品IDごとに数量を集計
    const csvAggregated = new Map<string, number>();
    for (const item of csvSalesData) {
      const matched = findBestMatchSimplified(item.amazonTitle, products || [], learningData);
      if (matched) {
        const currentQty = csvAggregated.get(matched.id) || 0;
        csvAggregated.set(matched.id, currentQty + item.quantity);
      }
    }

    console.log('📊 CSV集計結果:', csvAggregated.size, '商品');

    // 5. DBから指定月の売上データを取得
    const { data: dbData } = await supabase
      .from('web_sales_summary')
      .select('product_id, amazon_count') // 👆 amazon_countに修正（rakuten_countではない）
      .eq('report_month', reportMonth);
      
    const dbAggregated = new Map<string, number>();
    (dbData || []).forEach(row => {
      if (row.amazon_count && row.amazon_count > 0) {
        dbAggregated.set(row.product_id, row.amazon_count);
      }
    });

    console.log('📊 DB集計結果:', dbAggregated.size, '商品');

    // 6. CSVとDBを比較
    const verificationResults = [];
    const allProductIds = new Set([...csvAggregated.keys(), ...dbAggregated.keys()]);

    for (const productId of allProductIds) {
      const productInfo = products?.find(p => p.id === productId);
      const csvCount = csvAggregated.get(productId) || 0;
      const dbCount = dbAggregated.get(productId) || 0;
      
      verificationResults.push({
        productId,
        productName: productInfo?.name || '不明な商品',
        series: productInfo?.series || '未分類',
        csvCount,
        dbCount,
        isMatch: csvCount === dbCount,
      });
    }
    
    verificationResults.sort((a, b) => (a.series > b.series) ? 1 : -1);

    console.log('🎉 検証完了:', verificationResults.length, '商品');

    return NextResponse.json({ success: true, results: verificationResults });

  } catch (error) {
    console.error('🚨 Amazon売上検証APIエラー:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラーが発生しました',
    }, { status: 500 });
  }
}
