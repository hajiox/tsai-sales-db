// /app/api/import/yahoo-parse/route.ts ver.8
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
// 汎用化されたヘルパー関数をインポート
import { findBestMatchSimplified } from '@/lib/csvHelpers';

// SERVICE_ROLE_KEY を使用して、RLSをバイパスし全データにアクセス
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })()
);

// 文字列が有効かチェックするユーティリティ
function isValidString(value: any): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== Yahoo CSV解析API開始 ver.8 (チャネル対応版) ===');
    
    const { csvData } = await request.json();
    if (!csvData) {
      return NextResponse.json({ success: false, error: 'CSVデータが見つかりません' }, { status: 400 });
    }

    const lines = csvData.split('\n').slice(1).filter((line: string) => line.trim() !== '');
    if (lines.length === 0) {
      return NextResponse.json({ success: false, error: 'CSVに有効なデータ行がありません' }, { status: 400 });
    }
    console.log(`[Yahoo Parse] 解析対象の行数: ${lines.length}行`);

    // 商品マスターとYahoo専用の学習データを並行して取得
    const [productsResponse, learningDataResponse] = await Promise.all([
      supabase.from('products').select('*'),
      supabase.from('yahoo_product_mapping').select('yahoo_title, product_id')
    ]);
    
    if (productsResponse.error) throw new Error(`商品マスターの取得に失敗: ${productsResponse.error.message}`);
    const validProducts = (productsResponse.data || []).filter(p => p && isValidString(p.name));
    
    if (learningDataResponse.error) throw new Error(`Yahoo学習データの取得に失敗: ${learningDataResponse.error.message}`);
    const validLearningData = (learningDataResponse.data || []).filter(l => l && isValidString(l.yahoo_title));
    
    console.log(`[Yahoo Parse] 有効な商品マスター: ${validProducts.length}件`);
    console.log(`[Yahoo Parse] 有効なYahoo学習データ: ${validLearningData.length}件`);
    
    let matchedProducts: any[] = [];
    let unmatchedProducts: any[] = [];
    let blankTitleRows: any[] = [];

    // この処理専用の「マッチ済みID記憶セット」を作成（ステートレス化）
    const matchedProductIdsThisTime = new Set<string>();

    for (const line of lines) {
        const columns = line.split(',').map((col: string) => col.trim().replace(/"/g, ''));
        if (columns.length < 6) continue;

        const productTitle = columns[0];
        const quantity = parseInt(columns[5], 10) || 0;

        if (quantity <= 0) continue;

        if (!isValidString(productTitle)) {
            blankTitleRows.push({ rowNumber: lines.indexOf(line) + 2, quantity });
            continue;
        }

        try {
            // ★★★【最重要修正】★★★
            // 汎用ヘルパー関数に 'yahoo' という channel を渡す
            const result = findBestMatchSimplified(
              productTitle, 
              validProducts, 
              validLearningData, 
              matchedProductIdsThisTime,
              'yahoo' // <--- この引数が決定的に重要でした
            );

            if (result) {
                matchedProducts.push({ 
                  yahooTitle: productTitle, 
                  quantity, 
                  productInfo: result.product,
                  isLearned: result.matchType === 'learned' 
                });
            } else {
                unmatchedProducts.push({ yahooTitle: productTitle, quantity });
            }
        } catch (error) {
            console.error(`[Yahoo Parse] マッチング処理エラー (${productTitle}):`, error);
            unmatchedProducts.push({ yahooTitle: productTitle, quantity });
        }
    }

    const processableQuantity = matchedProducts.reduce((sum, p) => sum + p.quantity, 0);

    return NextResponse.json({
        success: true,
        matchedProducts,
        unmatchedProducts,
        summary: {
            totalProducts: matchedProducts.length + unmatchedProducts.length,
            totalQuantity: lines.reduce((sum, line) => sum + (parseInt(line.split(',')[5], 10) || 0), 0),
            processableQuantity,
            matchedCount: matchedProducts.length,
            unmatchedCount: unmatchedProducts.length,
            learnedMatchCount: matchedProducts.filter(p => p.isLearned).length,
            blankTitleInfo: {
                count: blankTitleRows.length,
                quantity: blankTitleRows.reduce((sum, r) => sum + r.quantity, 0)
            }
        }
    });
  } catch (error) {
      console.error('❌ Yahoo CSV解析APIで予期せぬエラー:', error);
      return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
