// /app/api/import/rakuten-parse/route.ts ver.11 (Definitive Fix)
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

    for (let i = 0; i < lines.length; i++) {
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
            // This is the critical fix. Construct the object explicitly and safely, just like the Amazon API.
            matchedProducts.push({
                rakutenTitle,
                quantity,
                productId: productInfo.id,
                productName: productInfo.name,
                productInfo: { // The frontend expects this nested object for display
                    id: productInfo.id,
                    name: productInfo.name,
                    series: productInfo.series,
                    series_code: productInfo.series_code,
                    product_code: productInfo.product_code
                },
                matchType: productInfo.matchType || 'medium' // Use a fallback for safety
            });
        } else {
            unmatchedProducts.push({ rakutenTitle, quantity });
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
        }
    });
  } catch (error) {
      console.error('楽天CSV解析エラー:', error);
      const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました';
      return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
