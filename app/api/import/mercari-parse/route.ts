// /app/api/import/mercari-parse/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    console.log('=== メルカリAPI開始 ver.1 ===');
    
    const { csvContent } = await request.json();
    console.log('csvContent受信:', csvContent ? 'OK' : 'NG');
    
    if (!csvContent) {
        return NextResponse.json({ success: false, error: 'CSVデータがありません' }, { status: 400 });
    }

    console.log('メルカリCSVファイル解析開始');
    const lines = csvContent.split('\n').slice(1).filter((line: string) => line.trim() !== '');
    console.log('解析された行数:', lines.length);

    const { data: products, error: productsError } = await supabase.from('products').select('*');
    if (productsError) throw new Error(`商品マスターの取得に失敗: ${productsError.message}`);

    // 商品データの厳密な検証
    const validProducts = (products || []).filter(p => {
      if (!p || !isValidString(p.name)) {
        console.log('無効な商品データを除外:', p);
        return false;
      }
      return true;
    });
    console.log('有効な商品数:', validProducts.length);

    const { data: learningData } = await supabase.from('mercari_product_mapping').select('mercari_title, product_id');

    // 学習データの厳密な検証
    const validLearningData = (learningData || []).filter(l => {
      if (!l || !isValidString(l.mercari_title)) {
        console.log('無効な学習データを除外:', l);
        return false;
      }
      return true;
    });
    console.log('有効な学習データ数:', validLearningData.length);

    // **メルカリ特有の集計処理**: 商品名ごとに数量を集計
    const aggregatedData = new Map<string, number>();
    let blankTitleCount = 0;
    let blankTitleQuantity = 0;

    for (let i = 0; i < lines.length; i++) {
        const columns = parseCsvLine(lines[i]);
        if (columns.length < 10) continue;

        const mercariTitle = columns[8]?.trim() || '';
        const quantity = parseInt(columns[9], 10) || 1;

        if (quantity <= 0) continue;

        // 厳密な文字列検証
        if (!isValidString(mercariTitle)) {
            blankTitleCount++;
            blankTitleQuantity += quantity;
            console.log(`空欄タイトル検出: 行${i + 2}, 数量${quantity}`);
            continue;
        }

        // 商品名ごとに数量を集計
        const currentQuantity = aggregatedData.get(mercariTitle) || 0;
        aggregatedData.set(mercariTitle, currentQuantity + quantity);
    }

    console.log(`集計結果: ${lines.length}行 → ${aggregatedData.size}商品`);

    let matchedProducts: any[] = [];
    let unmatchedProducts: any[] = [];

    // 集計されたデータでマッチング処理
    for (const [mercariTitle, totalQuantity] of aggregatedData.entries()) {
        console.log(`処理中: "${mercariTitle}" (${totalQuantity}個)`);

        try {
            // findBestMatchSimplified呼び出し前に最終検証
            if (!isValidString(mercariTitle) || !validProducts || !validLearningData) {
                console.error('findBestMatchSimplified呼び出し前の検証失敗');
                unmatchedProducts.push({ mercariTitle, quantity: totalQuantity });
                continue;
            }

            const productInfo = findBestMatchSimplified(mercariTitle, validProducts, validLearningData);

            if (productInfo) {
                matchedProducts.push({ 
                    mercariTitle, 
                    quantity: totalQuantity, 
                    productInfo, 
                    matchType: productInfo.matchType 
                });
                console.log(`マッチ成功: "${mercariTitle}" -> ${productInfo.name}`);
            } else {
                unmatchedProducts.push({ mercariTitle, quantity: totalQuantity });
                console.log(`マッチ失敗: "${mercariTitle}"`);
            }
        } catch (error) {
            console.error(`findBestMatchSimplified エラー (${mercariTitle}):`, error);
            unmatchedProducts.push({ mercariTitle, quantity: totalQuantity });
        }
    }

    const processableQuantity = matchedProducts.reduce((sum, p) => sum + p.quantity, 0);
    const unmatchQuantity = unmatchedProducts.reduce((sum, p) => sum + p.quantity, 0);

    console.log('=== メルカリAPI完了 ===');
    console.log('マッチ商品数:', matchedProducts.length);
    console.log('未マッチ商品数:', unmatchedProducts.length);
    console.log('空欄行数:', blankTitleCount);

    return NextResponse.json({
        success: true,
        matchedProducts,
        unmatchedProducts,
        summary: {
            totalProducts: matchedProducts.length + unmatchedProducts.length,
            totalQuantity: processableQuantity + unmatchQuantity,
            processableQuantity,
            blankTitleInfo: {
                count: blankTitleCount,
                quantity: blankTitleQuantity
            }
        }
    });
  } catch (error) {
      console.error('メルカリCSV解析エラー:', error);
      return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
