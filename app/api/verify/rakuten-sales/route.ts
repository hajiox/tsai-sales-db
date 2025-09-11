// /app/api/verify/rakuten-sales/route.ts ver.1

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })()
);

// 引用符付きCSVをパースする関数
function parseCsvLine(line: string): string[] {
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
    } else if (char === ',' && !inQuotes) {
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

    // 1. CSVをパースし、商品ごとの合計数量を計算
    const lines = csvContent.split('\n').slice(7).filter((line: string) => line.trim() !== '');
    const csvSalesData = lines.map((line: string) => {
      const columns = parseCsvLine(line);
      return {
        rakutenTitle: columns[0]?.replace(/"/g, '').trim(),
        quantity: parseInt(columns[4]?.replace(/"/g, '').trim() || '0', 10),
      };
    }).filter((item: any) => item.rakutenTitle && item.quantity > 0);

    // 2. 商品マスターと学習データを取得
    const { data: products } = await supabase.from('products').select('*');
    const { data: learnedMappings } = await supabase.from('rakuten_product_mapping').select('rakuten_title, product_id');
    const learningData = (learnedMappings || []).map(m => ({ amazon_title: m.rakuten_title, product_id: m.product_id }));

    // 3. CSVデータから商品IDごとに数量を集計
    const csvAggregated = new Map<string, number>();
    for (const item of csvSalesData) {
      const matched = findBestMatchSimplified(item.rakutenTitle, products || [], learningData);
      if (matched) {
        const currentQty = csvAggregated.get(matched.id) || 0;
        csvAggregated.set(matched.id, currentQty + item.quantity);
      }
    }

    // 4. DBから指定月の売上データを取得
    const { data: dbData } = await supabase
      .from('web_sales_summary')
      .select('product_id, rakuten_count')
      .eq('report_month', reportMonth);
      
    const dbAggregated = new Map<string, number>();
    (dbData || []).forEach(row => {
      dbAggregated.set(row.product_id, row.rakuten_count || 0);
    });

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
    
    verificationResults.sort((a,b) => (a.series > b.series) ? 1 : -1);

    return NextResponse.json({ success: true, results: verificationResults });

  } catch (error) {
    console.error('楽天売上検証APIエラー:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラーが発生しました',
    }, { status: 500 });
  }
}
