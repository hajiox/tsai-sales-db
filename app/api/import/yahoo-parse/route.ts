// /app/api/import/yahoo-parse/route.ts ver.6
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 安全な文字列検証関数
function isValidString(value: any): value is string {
  return value && typeof value === 'string' && value.trim().length > 0;
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== Yahoo CSV解析API開始 ver.6 (学習データ形式修正版) ===');
    
    const { csvData } = await request.json();
    if (!csvData) {
      return NextResponse.json({ success: false, error: 'CSVデータが必要です' }, { status: 400 });
    }

    const lines = csvData.split('\n').slice(1).filter((line: string) => line.trim() !== '');
    if (lines.length === 0) {
      return NextResponse.json({ success: false, error: 'CSVにデータ行がありません' }, { status: 400 });
    }
    console.log('解析対象の行数:', lines.length);

    // 商品マスターと学習データを並行して取得
    const [productsResponse, learningDataResponse] = await Promise.all([
      supabase.from('products').select('*'),
      supabase.from('yahoo_product_mapping').select('yahoo_title, product_id')
    ]);
    
    if (productsResponse.error) throw new Error(`商品マスターの取得に失敗: ${productsResponse.error.message}`);
    const validProducts = (productsResponse.data || []).filter(p => p && isValidString(p.name));
    console.log('有効な商品数:', validProducts.length);

    if (learningDataResponse.error) throw new Error(`学習データの取得に失敗: ${learningDataResponse.error.message}`);
    
    // ★★★★★★★★★★★★★★★★★★★★★★
    //           ★最重要修正ポイント★
    // ★★★★★★★★★★★★★★★★★★★★★★
    // 学習データを共通ヘルパー関数が扱える汎用的な形式 { ecTitle, productId } に変換します。
    // これにより、学習データが正しくマッチング処理で利用されるようになります。
    const mappedLearningData = (learningDataResponse.data || [])
      .filter(l => l && isValidString(l.yahoo_title) && isValidString(l.product_id))
      .map(item => ({
        ecTitle: item.yahoo_title,   // `yahoo_title` を `ecTitle` に変換
        productId: item.product_id,  // `product_id` を `productId` に変換
      }));
    console.log('有効な学習データ数:', mappedLearningData.length);
    
    let matchedProducts: any[] = [];
    let unmatchedProducts: any[] = [];
    let blankTitleRows: any[] = [];

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
            // マッチング関数には、変換後の `mappedLearningData` を渡します。
            const productInfo = findBestMatchSimplified(productTitle, validProducts, mappedLearningData);

            if (productInfo) {
                matchedProducts.push({ 
                  yahooTitle: productTitle, 
                  quantity, 
                  productInfo, 
                  isLearned: productInfo.matchType === 'learned' 
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
