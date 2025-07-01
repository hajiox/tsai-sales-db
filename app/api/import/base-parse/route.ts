// /app/api/import/base-parse/route.ts
// ver.2 (楽天APIからの完全移植版 - BASE CSV構造対応)

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
    console.log('=== BASE API開始 ver.2 ===');
    
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ 
        success: false, 
        error: 'ファイルがアップロードされていません' 
      }, { status: 400 });
    }

    console.log('📁 ファイル情報:', { 
      name: file.name, 
      size: file.size, 
      type: file.type 
    });

    // ファイル内容を読み取り
    const csvContent = await file.text();
    console.log('csvContent受信:', csvContent ? 'OK' : 'NG');
    
    if (!csvContent) {
        return NextResponse.json({ success: false, error: 'CSVデータがありません' }, { status: 400 });
    }

    console.log('BASE CSVファイル解析開始');
    // BASE CSVはヘッダー1行のみスキップ（楽天の.slice(7)と違い.slice(1)）
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

    const { data: learningData } = await supabase.from('base_product_mapping').select('base_title, product_id');

    // 学習データの厳密な検証
    const validLearningData = (learningData || []).filter(l => {
      if (!l || !isValidString(l.base_title)) {
        console.log('無効な学習データを除外:', l);
        return false;
      }
      return true;
    });
    console.log('有効な学習データ数:', validLearningData.length);

    let matchedProducts: any[] = [];
    let unmatchedProducts: any[] = [];
    let blankTitleRows: any[] = [];

    for (let i = 0; i < lines.length; i++) {
        const columns = parseCsvLine(lines[i]);
        // BASE CSVは38列、最低でも商品名(17)と数量(21)が必要
        if (columns.length < 22) continue;

        // BASE CSVの構造：商品名=18列目（0ベース17）、数量=22列目（0ベース21）
        const baseTitle = columns[17]?.trim() || '';
        const quantity = parseInt(columns[21], 10) || 0;

        if (quantity <= 0) continue;

        // 厳密な文字列検証
        if (!isValidString(baseTitle)) {
            blankTitleRows.push({ rowNumber: i + 2, quantity }); // ヘッダー1行分調整
            console.log(`空欄タイトル検出: 行${i + 2}, 数量${quantity}`);
            continue;
        }

        console.log(`処理中: "${baseTitle}" (${quantity}個)`);

        try {
            // findBestMatchSimplified呼び出し前に最終検証
            if (!isValidString(baseTitle) || !validProducts || !validLearningData) {
                console.error('findBestMatchSimplified呼び出し前の検証失敗');
                unmatchedProducts.push({ baseTitle, quantity });
                continue;
            }

            const productInfo = findBestMatchSimplified(baseTitle, validProducts, validLearningData);

            if (productInfo) {
                matchedProducts.push({ baseTitle, quantity, productInfo, matchType: productInfo.matchType });
                console.log(`マッチ成功: "${baseTitle}" -> ${productInfo.name}`);
            } else {
                unmatchedProducts.push({ baseTitle, quantity });
                console.log(`マッチ失敗: "${baseTitle}"`);
            }
        } catch (error) {
            console.error(`findBestMatchSimplified エラー (${baseTitle}):`, error);
            unmatchedProducts.push({ baseTitle, quantity });
        }
    }

    const processableQuantity = matchedProducts.reduce((sum, p) => sum + p.quantity, 0);
    const unmatchQuantity = unmatchedProducts.reduce((sum, p) => sum + p.quantity, 0);
    const blankTitleQuantity = blankTitleRows.reduce((sum, r) => sum + r.quantity, 0);

    // 月を取得（ファイル名から推測）
    let month = '2025-07';
    const monthMatch = file.name.match(/(\d{4})\.(\d{1,2})/);
    if (monthMatch) {
      const year = monthMatch[1];
      const monthNum = monthMatch[2].padStart(2, '0');
      month = `${year}-${monthNum}`;
    }

    console.log('=== BASE API完了 ===');
    console.log('マッチ商品数:', matchedProducts.length);
    console.log('未マッチ商品数:', unmatchedProducts.length);
    console.log('空欄行数:', blankTitleRows.length);

    return NextResponse.json({
        success: true,
        matchedProducts,
        unmatchedProducts,
        month,
        summary: {
            totalProducts: matchedProducts.length + unmatchedProducts.length,
            totalQuantity: processableQuantity + unmatchQuantity,
            processableQuantity,
            blankTitleInfo: {
                count: blankTitleRows.length,
                quantity: blankTitleQuantity
            }
        }
    });
  } catch (error) {
      console.error('BASE CSV解析エラー:', error);
      return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
