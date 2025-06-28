// 【正しいファイル】/app/api/import/rakuten-parse/route.ts の内容
// version: 13 (Amazon方式への完全統一版)

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

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

export async function POST(request: NextRequest) {
  try {
    const { csvContent } = await request.json();
    if (!csvContent) {
        return NextResponse.json({ success: false, error: 'CSVデータがありません' }, { status: 400 });
    }

    const lines = csvContent.split('\n').slice(7).filter((line: string) => line.trim() !== '');

    const { data: products, error: productsError } = await supabase.from('products').select('*');
    if (productsError) throw new Error(`商品マスターの取得に失敗: ${productsError.message}`);

    const { data: learningData } = await supabase.from('rakuten_product_mapping').select('rakuten_title, product_id');

    let matchedProducts: any[] = [];
    let unmatchedProducts: any[] = [];
    let blankTitleRows: any[] = [];
    let errorRows: any[] = [];

    for (let i = 0; i < lines.length; i++) {
      try {
        const columns = parseCsvLine(lines[i]);
        if (columns.length < 5) continue;

        const rakutenTitle = columns[0]?.trim();
        const quantity = parseInt(columns[4], 10) || 0;

        if (quantity <= 0) continue;

        if (!rakutenTitle) {
            blankTitleRows.push({ rowNumber: i + 8, quantity });
            continue;
        }

        const productInfo = findBestMatchSimplified(rakutenTitle, products || [], learningData || []);

        if (productInfo) {
            matchedProducts.push({
                rakutenTitle,
                quantity,
                productId: productInfo.id,
                productName: productInfo.name,
                matchType: productInfo.matchType || 'medium'
            });
        } else {
            unmatchedProducts.push({ rakutenTitle, quantity });
        }
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        console.error(`CSV処理エラー発生 (行: ${i + 8}): `, lines[i], error.message);
        errorRows.push({
          row: i + 8,
          content: lines[i],
          error: error.message
        });
      }
    }

    const processableQuantity = matchedProducts.reduce((sum, p) => sum + p.quantity, 0);
    const unmatchQuantity = unmatchedProducts.reduce((sum, p) => sum + p.quantity, 0);
    const blankTitleQuantity = blankTitleRows.reduce((sum, r) => sum + r.quantity, 0);

    return NextResponse.json({
        success: true,
        totalProducts: matchedProducts.length + unmatchedProducts.length,
        totalQuantity: processableQuantity + unmatchQuantity,
        matchedProducts,
        unmatchedProducts,
        processableQuantity,
        blankTitleInfo: {
            count: blankTitleRows.length,
            quantity: blankTitleQuantity
        },
        errorInfo: {
            count: errorRows.length,
            details: errorRows.slice(0, 10)
        }
    });

  } catch (error) {
      console.error('楽天CSV解析API全体のエラー:', error);
      const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました';
      return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
