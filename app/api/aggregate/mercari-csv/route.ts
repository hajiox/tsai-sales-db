// /app/api/aggregate/mercari-csv/route.ts ver.1
// 集計専用API - CSV → 商品名別カウント

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function parseCsvLine(line: string): string[] {
  const columns = [];
  let currentColumn = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        currentColumn += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
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

// 安全な文字列検証関数
function isValidString(value: any): value is string {
  return value && typeof value === 'string' && value.trim().length > 0;
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== メルカリ集計API開始 ver.1 ===');
    
    const { csvContent } = await request.json();
    console.log('csvContent受信:', csvContent ? 'OK' : 'NG');
    
    if (!csvContent) {
        return NextResponse.json({ success: false, error: 'CSVデータがありません' }, { status: 400 });
    }

    console.log('メルカリCSV集計処理開始');
    const lines = csvContent.split('\n').slice(1).filter((line: string) => line.trim() !== '');
    console.log('処理対象行数:', lines.length);

    // **集計専用処理**: 商品名の出現回数をカウント
    const productCounts = new Map<string, number>();
    let blankTitleCount = 0;
    let totalProcessedRows = 0;

    for (let i = 0; i < lines.length; i++) {
        const columns = parseCsvLine(lines[i]);
        if (columns.length < 9) continue; // 最低限の列数チェック

        const mercariTitle = columns[8]?.trim() || ''; // 商品名列（8列目）
        totalProcessedRows++;

        // 商品名の検証
        if (!isValidString(mercariTitle)) {
            blankTitleCount++;
            console.log(`空欄タイトル検出: 行${i + 2}`);
            continue;
        }

        // **重要**: 1行 = 1個として集計
        const currentCount = productCounts.get(mercariTitle) || 0;
        productCounts.set(mercariTitle, currentCount + 1);
    }

    console.log(`集計完了: ${totalProcessedRows}行 → ${productCounts.size}商品`);

    // 集計結果を配列形式に変換
    const aggregatedProducts = Array.from(productCounts.entries()).map(([productName, count]) => ({
        productName,
        count
    }));

    // 結果をソート（数量の多い順）
    aggregatedProducts.sort((a, b) => b.count - a.count);

    const totalQuantity = aggregatedProducts.reduce((sum, item) => sum + item.count, 0);

    console.log('=== メルカリ集計API完了 ===');
    console.log('集計商品数:', aggregatedProducts.length);
    console.log('総数量:', totalQuantity);
    console.log('空欄行数:', blankTitleCount);

    return NextResponse.json({
        success: true,
        aggregatedProducts,
        summary: {
            totalProducts: aggregatedProducts.length,
            totalQuantity,
            blankTitleCount,
            processedRows: totalProcessedRows
        }
    });
  } catch (error) {
      console.error('メルカリCSV集計エラー:', error);
      return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
