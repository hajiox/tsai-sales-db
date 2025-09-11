// /app/api/import/rakuten-parse/route.ts ver.20 (ステートレス・チャネル対応版)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })()
);

export const dynamic = 'force-dynamic';

function parseCsvLine(line: string): string[] {
  const columns = []; let currentColumn = ''; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') { if (inQuotes && line[i + 1] === '"') { currentColumn += '"'; i++; } else { inQuotes = !inQuotes; } } 
    else if (char === ',' && !inQuotes) { columns.push(currentColumn.trim()); currentColumn = ''; } 
    else { currentColumn += char; }
  }
  columns.push(currentColumn.trim()); return columns;
}

function isValidString(value: any): value is string { return value && typeof value === 'string' && value.trim().length > 0; }

export async function POST(request: NextRequest) {
  try {
    console.log('=== 楽天API開始 ver.20（ステートレス・チャネル対応版） ===');
    const { csvContent } = await request.json();
    if (!csvContent) { return NextResponse.json({ success: false, error: 'CSVデータがありません' }, { status: 400 }); }

    const lines = csvContent.split('\n').slice(7).filter((line: string) => line.trim() !== '');
    
    const { data: products, error: productsError } = await supabase.from('products').select('*');
    if (productsError) throw new Error(`商品マスターの取得に失敗: ${productsError.message}`);
    const validProducts = (products || []).filter(p => p && isValidString(p.name));
    
    const { data: learningData, error: learningError } = await supabase.from('rakuten_product_mapping').select('rakuten_title, product_id');
    if (learningError) throw new Error(`楽天の学習データ取得に失敗: ${learningError.message}`);
    const validLearningData = (learningData || []).filter(l => l && isValidString(l.rakuten_title));
    
    console.log('有効な商品数:', validProducts.length);
    console.log('有効な学習データ数:', validLearningData.length);

    let matchedProducts: any[] = [];
    let unmatchedProducts: any[] = [];
    let blankTitleRows: any[] = [];

    // ★修正点1: このCSV解析専用のマッチ済みID記憶セットを作成
    const matchedProductIdsThisTime = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
        const columns = parseCsvLine(lines[i]);
        if (columns.length < 5) continue;
        const rakutenTitle = columns[0]?.trim() || '';
        const quantity = parseInt(columns[4], 10) || 0;
        if (quantity <= 0 || !isValidString(rakutenTitle)) {
            if (isValidString(rakutenTitle)) blankTitleRows.push({ rowNumber: i + 8, quantity });
            continue;
        }

        try {
            // ★修正点2: 新しい引数でヘルパー関数を呼び出す
            const result = findBestMatchSimplified(
              rakutenTitle, 
              validProducts, 
              validLearningData,
              matchedProductIdsThisTime, // 記憶セットを渡す
              'rakuten'                 // 'rakuten'チャネルだと伝える
            );

            if (result) {
                const productInfo = result.product;
                matchedProducts.push({ rakutenTitle, quantity, productInfo, matchType: result.matchType });
            } else {
                unmatchedProducts.push({ rakutenTitle, quantity });
            }
        } catch (error) {
            console.error(`findBestMatchSimplified エラー (${rakutenTitle}):`, error);
            unmatchedProducts.push({ rakutenTitle, quantity });
        }
    }
    
    const processableQuantity = matchedProducts.reduce((sum, p) => sum + p.quantity, 0);
    const unmatchQuantity = unmatchedProducts.reduce((sum, p) => sum + p.quantity, 0);
    const blankTitleQuantity = blankTitleRows.reduce((sum, r) => sum + r.quantity, 0);

    return NextResponse.json({
        success: true, matchedProducts, unmatchedProducts,
        summary: {
            totalProducts: matchedProducts.length + unmatchedProducts.length,
            totalQuantity: processableQuantity + unmatchQuantity,
            processableQuantity,
            blankTitleInfo: { count: blankTitleRows.length, quantity: blankTitleQuantity },
        }
    });
  } catch (error) {
    console.error('楽天CSV解析エラー:', error);
    return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
