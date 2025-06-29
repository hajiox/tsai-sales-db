// /app/api/verify/amazon-sales/route.ts ver.1

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// AmazonのCSVパース関数
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
    } else if (char === '\t' && !inQuotes) { // AmazonはTSV形式
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

    // 1. AmazonCSVをパースし、商品ごとの合計数量を計算
    const lines = csvContent.split('\n').filter((line: string) => line.trim() !== '');
    
    // ヘッダー行を探す（"商品名"を含む行）
    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('商品名') || lines[i].includes('title')) {
        headerIndex = i;
        break;
      }
    }
    
    if (headerIndex === -1) {
      throw new Error('Amazon CSVのヘッダー行が見つかりません');
    }
    
    const dataLines = lines.slice(headerIndex + 1);
    const csvSalesData = dataLines.map((line: string) => {
      const columns = parseAmazonCsvLine(line);
      return {
        amazonTitle: columns[0]?.replace(/"/g, '').trim(), // 商品名
        quantity: parseInt(columns[1]?.replace(/"/g, '').trim() || '0', 10), // 数量
      };
    }).filter((item: any) => item.amazonTitle && item.quantity > 0);

    console.log('Amazon CSV解析結果:', csvSalesData.length, '件');

    // 2. 商品マスターと学習データを取得
    const { data: products } = await supabase.from('products').select('*');
    const { data: learnedMappings } = await supabase.from('amazon_product_mapping').select('amazon_title, product_id');
    const learningData = (learnedMappings || []).map(m => ({ amazon_title: m.amazon_title, product_id: m.product_id }));

    console.log('商品マスター:', products?.length, '件');
    console.log('Amazon学習データ:', learningData.length, '件');

    // 3. CSVデータから商品IDごとに数量を集計
    const csvAggregated = new Map<string, number>();
    for (const item of csvSalesData) {
      const matched = findBestMatchSimplified(item.amazonTitle, products || [], learningData);
      if (matched) {
        const currentQty = csvAggregated.get(matched.id) || 0;
        csvAggregated.set(matched.id, currentQty + item.quantity);
      }
    }

    console.log('CSV集計結果:', csvAggregated.size, '商品');

    // 4. DBから指定月の売上データを取得
    const { data: dbData } = await supabase
      .from('web_sales_summary')
      .select('product_id, amazon_count')
      .eq('report_month', reportMonth);
      
    const dbAggregated = new Map<string, number>();
    (dbData || []).forEach(row => {
      if (row.amazon_count && row.amazon_count > 0) {
        dbAggregated.set(row.product_id, row.amazon_count);
      }
    });

    console.log('DB集計結果:', dbAggregated.size, '商品');

    // 5. CSVとDBを比較
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
    
    // シリーズ名でソート
    verificationResults.sort((a, b) => (a.series > b.series) ? 1 : -1);

    console.log('検証結果:', verificationResults.length, '商品');

    return NextResponse.json({ success: true, results: verificationResults });

  } catch (error) {
    console.error('Amazon売上検証APIエラー:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラーが発生しました',
    }, { status: 500 });
  }
}
