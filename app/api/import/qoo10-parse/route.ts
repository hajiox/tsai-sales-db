// /app/api/import/qoo10-parse/route.ts
// ver.2 (ステートレス/チャネル対応版)

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

function isValidString(value: any): value is string {
  return value && typeof value === 'string' && value.trim().length > 0;
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== Qoo10 API開始 ver.2 (ステートレス/チャネル対応版) ===');
    
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ success: false, error: 'ファイルがアップロードされていません' }, { status: 400 });
    }

    const csvContent = await file.text();
    if (!csvContent) {
        return NextResponse.json({ success: false, error: 'CSVデータがありません' }, { status: 400 });
    }

    const lines = csvContent.split('\n').slice(1).filter((line: string) => line.trim() !== '');
    
    // ========== マッチング処理 ==========
    const [productsResponse, learningDataResponse] = await Promise.all([
      supabase.from('products').select('*'),
      supabase.from('qoo10_product_mapping').select('qoo10_title, product_id')
    ]);

    if (productsResponse.error) throw new Error(`商品マスターの取得に失敗: ${productsResponse.error.message}`);
    const validProducts = (productsResponse.data || []).filter(p => p && isValidString(p.name));
    
    if (learningDataResponse.error) throw new Error(`Qoo10学習データの取得に失敗: ${learningDataResponse.error.message}`);
    const validLearningData = (learningDataResponse.data || []).filter(l => l && isValidString(l.qoo10_title));

    console.log(`[Qoo10 Parse] 有効な商品マスター: ${validProducts.length}件`);
    console.log(`[Qoo10 Parse] 有効なQoo10学習データ: ${validLearningData.length}件`);
    
    let matchedProducts: any[] = [];
    let unmatchedProducts: any[] = [];
    let blankTitleRows: any[] = [];
    
    // この処理専用の「マッチ済みID記憶セット」を作成（ステートレス化）
    const matchedProductIdsThisTime = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
        const columns = parseCsvLine(lines[i]);
        if (columns.length < 15) continue;

        const qoo10Title = columns[13]?.trim() || '';
        const quantity = parseInt(columns[14], 10) || 0;

        if (quantity <= 0) continue;

        if (!isValidString(qoo10Title)) {
            blankTitleRows.push({ rowNumber: i + 2, quantity });
            continue;
        }

        try {
            // ★★★【最重要修正】★★★
            // 汎用ヘルパー関数に 'qoo10' という channel と記憶用Setを渡す
            const result = findBestMatchSimplified(
              qoo10Title,
              validProducts,
              validLearningData,
              matchedProductIdsThisTime,
              'qoo10' // <--- どのECサイトかを伝える
            );

            if (result) {
                matchedProducts.push({ 
                  qoo10Title, 
                  quantity, 
                  productInfo: result.product, 
                  isLearned: result.matchType === 'learned' 
                });
            } else {
                unmatchedProducts.push({ qoo10Title, quantity });
            }
        } catch (error) {
            console.error(`マッチング処理でエラーが発生 (${qoo10Title}):`, error);
            unmatchedProducts.push({ qoo10Title, quantity });
        }
    }

    const processableQuantity = matchedProducts.reduce((sum, p) => sum + p.quantity, 0);

    return NextResponse.json({
        success: true,
        matchedProducts,
        unmatchedProducts,
        summary: {
            totalProducts: matchedProducts.length + unmatchedProducts.length,
            totalQuantity: lines.reduce((sum, line) => sum + (parseInt(parseCsvLine(line)[14], 10) || 0), 0),
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
      console.error('❌ Qoo10 CSV解析APIで予期せぬエラー:', error);
      return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
