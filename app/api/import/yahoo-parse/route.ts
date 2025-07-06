// /app/api/import/yahoo-parse/route.ts ver.7
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
// ★修正後のヘルパー関数をインポート
import { findBestMatchSimplified } from '@/lib/csvHelpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isValidString(value: any): value is string {
  return value && typeof value === 'string' && value.trim().length > 0;
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== Yahoo CSV解析API開始 ver.7 (ステートレス対応版) ===');
    
    const { csvData } = await request.json();
    if (!csvData) {
      return NextResponse.json({ success: false, error: 'CSVデータが必要です' }, { status: 400 });
    }

    const lines = csvData.split('\n').slice(1).filter((line: string) => line.trim() !== '');
    if (lines.length === 0) {
      return NextResponse.json({ success: false, error: 'CSVにデータ行がありません' }, { status: 400 });
    }
    console.log('解析対象の行数:', lines.length);

    const [productsResponse, learningDataResponse] = await Promise.all([
      supabase.from('products').select('*'),
      supabase.from('yahoo_product_mapping').select('yahoo_title, product_id')
    ]);
    
    if (productsResponse.error) throw new Error(`商品マスターの取得に失敗: ${productsResponse.error.message}`);
    const validProducts = (productsResponse.data || []).filter(p => p && isValidString(p.name));
    
    if (learningDataResponse.error) throw new Error(`学習データの取得に失敗: ${learningDataResponse.error.message}`);
    // ★★★【重要修正】私の前回の誤った修正を元に戻します。`.map()`は不要でした。
    const validLearningData = (learningDataResponse.data || []).filter(l => l && isValidString(l.yahoo_title));
    console.log('有効な商品数:', validProducts.length);
    console.log('有効な学習データ数:', validLearningData.length);
    
    let matchedProducts: any[] = [];
    let unmatchedProducts: any[] = [];
    let blankTitleRows: any[] = [];

    // ★★★【重要修正】このCSV解析処理専用の「マッチ済みID記憶セット」をここで作成します。
    const matchedProductIdsThisTime = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
        const columns = lines[i].split(',').map((col: string) => col.trim().replace(/"/g, ''));
        if (columns.length < 6) continue;

        const productTitle = columns[0];
        const quantity = parseInt(columns[5], 10) || 0;

        if (quantity <= 0) continue;

        if (!isValidString(productTitle)) {
            blankTitleRows.push({ rowNumber: i + 2, quantity });
            continue;
        }

        try {
            // ★★★【重要修正】ヘルパー関数に「今回の記憶セット」を渡します。
            const result = findBestMatchSimplified(productTitle, validProducts, validLearningData, matchedProductIdsThisTime);

            if (result) {
                matchedProducts.push({ 
                  yahooTitle: productTitle, 
                  quantity, 
                  productInfo: result.product, // `result.product`に商品情報が入る
                  isLearned: result.matchType === 'learned' 
                });
            } else {
                unmatchedProducts.push({ yahooTitle: productTitle, quantity });
            }
        } catch (error) {
            console.error(`マッチング処理エラー (${productTitle}):`, error);
            unmatchedProducts.push({ yahooTitle: productTitle, quantity });
        }
    }

    const processableQuantity = matchedProducts.reduce((sum, p) => sum + p.quantity, 0);
    const unmatchQuantity = unmatchedProducts.reduce((sum, p) => sum + p.quantity, 0);
    const blankTitleQuantity = blankTitleRows.reduce((sum, r) => sum + r.quantity, 0);

    return NextResponse.json({
        success: true,
        matchedProducts,
        unmatchedProducts,
        summary: {
            totalProducts: matchedProducts.length + unmatchedProducts.length,
            totalQuantity: processableQuantity + unmatchQuantity + blankTitleQuantity,
            processableQuantity,
            matchedProducts: matchedProducts.length,
            unmatchedProducts: unmatchedProducts.length,
            learnedMatches: matchedProducts.filter(p => p.isLearned).length,
            blankTitleInfo: {
                count: blankTitleRows.length,
                quantity: blankTitleQuantity
            }
        }
    });
  } catch (error) {
      console.error('Yahoo CSV解析エラー:', error);
      return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
