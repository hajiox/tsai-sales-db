// /app/api/import/mercari-parse/route.ts ver.4
// 集計とマッチングを統合した、単一完結型API

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
    console.log('=== メルカリ 統合API開始 ver.4 ===');
    
    // UIからは直接CSVコンテントを受け取る
    const { csvContent } = await request.json();
    if (!csvContent) {
        return NextResponse.json({ success: false, error: 'CSVデータがありません' }, { status: 400 });
    }

    const lines = csvContent.split('\n').slice(1).filter((line: string) => line.trim() !== '');
    
    // ========== Phase 1: 集計処理（旧APIから移植） ==========
    console.log('[Mercari Integrated] Phase 1: 集計処理開始');
    const aggregatedData = new Map<string, number>();
    let blankTitleCount = 0;

    for (const line of lines) {
        const columns = parseCsvLine(line);
        if (columns.length < 9) continue; 
        const mercariTitle = columns[8]?.trim() || '';

        if (!isValidString(mercariTitle)) {
            blankTitleCount++;
            continue;
        }
        // メルカリは1行=1個として集計
        const currentCount = aggregatedData.get(mercariTitle) || 0;
        aggregatedData.set(mercariTitle, currentCount + 1);
    }
    console.log(`[Mercari Integrated] 集計完了: ${aggregatedData.size}種類の商品`);


    // ========== Phase 2: マッチング処理 ==========
    console.log('[Mercari Integrated] Phase 2: マッチング処理開始');
    const [productsResponse, learningDataResponse] = await Promise.all([
      supabase.from('products').select('*'),
      supabase.from('mercari_product_mapping').select('mercari_title, product_id')
    ]);

    if (productsResponse.error) throw new Error(`商品マスターの取得に失敗: ${productsResponse.error.message}`);
    const validProducts = (productsResponse.data || []).filter(p => p && isValidString(p.name));
    
    if (learningDataResponse.error) throw new Error(`メルカリ学習データの取得に失敗: ${learningDataResponse.error.message}`);
    const validLearningData = (learningDataResponse.data || []).filter(l => l && isValidString(l.mercari_title));

    let matchedProducts: any[] = [];
    let unmatchedProducts: any[] = [];
    const matchedProductIdsThisTime = new Set<string>();

    for (const [mercariTitle, quantity] of aggregatedData.entries()) {
        try {
            const result = findBestMatchSimplified(
              mercariTitle,
              validProducts,
              validLearningData,
              matchedProductIdsThisTime,
              'mercari'
            );

            if (result) {
                matchedProducts.push({ 
                    mercariTitle: mercariTitle, 
                    quantity, 
                    productInfo: result.product, 
                    isLearned: result.matchType === 'learned'
                });
            } else {
                unmatchedProducts.push({ mercariTitle: mercariTitle, quantity });
            }
        } catch (error) {
            console.error(`マッチングエラー (${mercariTitle}):`, error);
            unmatchedProducts.push({ mercariTitle: mercariTitle, quantity });
        }
    }

    const processableQuantity = matchedProducts.reduce((sum, p) => sum + p.quantity, 0);
    const unmatchQuantity = unmatchedProducts.reduce((sum, p) => sum + p.quantity, 0);

    return NextResponse.json({
        success: true,
        matchedProducts,
        unmatchedProducts,
        summary: {
            totalProducts: aggregatedData.size,
            totalQuantity: processableQuantity + unmatchQuantity,
            processableQuantity,
            matchedCount: matchedProducts.length,
            unmatchedCount: unmatchedProducts.length,
            processedRows: lines.length, // 参考情報として追加
            blankTitleInfo: { count: blankTitleCount, quantity: blankTitleCount } // 1行1個なので同数
        }
    });
  } catch (error) {
      console.error('❌ メルカリ 統合APIで予期せぬエラー:', error);
      return NextResponse.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
