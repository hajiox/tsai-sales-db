// /app/api/import/amazon-parse/route.ts ver.8 (空欄検知アラート対応版)
import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"
import { findBestMatchSimplified } from "@/lib/csvHelpers"

export const dynamic = 'force-dynamic'

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
    console.log('Amazon CSV解析開始 (ver.8 空欄検知対応)');

    const formData = await request.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 });
    }

    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSVデータが不足しています（ヘッダー+データ行が必要）' }, { status: 400 });
    }

    const headers = parseCsvLine(lines[0]);
    const titleIndex = headers.findIndex(h => h.includes('タイトル'));
    const quantityIndex = headers.findIndex(h => h.includes('注文された商品点数'));

    if (titleIndex === -1 || quantityIndex === -1) {
      return NextResponse.json({ error: `必要な列が見つかりません。`}, { status: 400 });
    }

    const { data: products, error: productsError } = await supabase.from('products').select('*');
    if (productsError) throw new Error(`商品マスターの取得に失敗: ${productsError.message}`);

    const { data: learningData } = await supabase.from('amazon_product_mapping').select('amazon_title, product_id');

    const matchedResults: any[] = [];
    const unmatchedProducts: any[] = [];
    const blankTitleRows: any[] = []; // ★1. 空欄行を格納する配列を新設

    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]);
      if (row.length <= Math.max(titleIndex, quantityIndex)) continue;

      const amazonTitle = row[titleIndex]?.trim();
      const quantity = parseInt(row[quantityIndex], 10) || 0;

      if (quantity <= 0) continue; // 数量0以下の行は従来通りスキップ

      // ★2. 商品名が空欄の場合の処理を分離
      if (!amazonTitle) {
        blankTitleRows.push({ rowNumber: i + 1, quantity });
        continue; // 処理を中断して次の行へ
      }

      const matchedProduct = findBestMatchSimplified(amazonTitle, products || [], learningData || []);

      if (matchedProduct) {
        matchedResults.push({
          productId: matchedProduct.id,
          productName: matchedProduct.name,
          amazonTitle,
          quantity,
          matched: true,
          matchType: matchedProduct.matchType || 'medium'
        });
      } else {
        unmatchedProducts.push({ amazonTitle, quantity, matched: false });
      }
    }

    const matchedQuantity = matchedResults.reduce((sum, r) => sum + r.quantity, 0);
    const unmatchedQuantity = unmatchedProducts.reduce((sum, r) => sum + r.quantity, 0);
    const blankTitleQuantity = blankTitleRows.reduce((sum, r) => sum + r.quantity, 0);

    return NextResponse.json({
      matchedResults,
      unmatchedProducts,
      summary: {
        totalRows: lines.length - 1,
        processedRows: matchedResults.length + unmatchedProducts.length,
        matchedCount: matchedResults.length,
        unmatchedCount: unmatchedProducts.length,
        csvTotalQuantity: matchedQuantity + unmatchedQuantity,
        matchedQuantity,
        unmatchedQuantity,
        // ★3. フロントに渡すサマリー情報に空欄行の情報を追加
        blankTitleInfo: {
            count: blankTitleRows.length,
            quantity: blankTitleQuantity
        }
      }
    });

  } catch (error) {
    console.error('Amazon CSV解析エラー:', error);
    return NextResponse.json({ error: 'CSV解析中にエラーが発生しました: ' + (error as Error).message }, { status: 500 });
  }
}
