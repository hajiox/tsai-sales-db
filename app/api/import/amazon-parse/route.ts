// app/api/import/amazon-parse/route.ts
// ver.11 - 重複マッチ防止機能付き

import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'csv-parse/sync';
import { supabase } from '@/lib/supabase';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

export const dynamic = 'force-dynamic';

/** 「1,234」「 1 234 」→ 1234 */
const toNumber = (raw: string | number): number => {
  if (typeof raw === 'number') return raw;
  return Number(raw?.toString().replace(/[,，\s]/g, '').trim() || 0);
};

/** CSV 全文 → 行ごとの record オブジェクト配列（ヘッダー付き） */
function parseCsvWithHeader(text: string): any[] {
  return parse(text, {
    columns: true,           // 1行目をヘッダーとして使用
    skip_empty_lines: true,
    delimiter: ',',
    quote: '"',
    relax_column_count: true,
    trim: true,
  });
}

export async function POST(req: NextRequest) {
  try {
    console.log('🔍 Amazon CSV解析開始 - ver.11（重複マッチ防止機能付き）');
    
    // 1. ファイル取得
    const form = await req.formData();
    const file = form.get('file') as File;
    if (!file) {
      return NextResponse.json({ ok: false, error: 'CSV が選択されていません' }, { status: 400 });
    }

    // 2. CSV → record配列（ヘッダー付き）
    const csvText = await file.text();
    const records = parseCsvWithHeader(csvText);
    
    console.log(`📊 CSV行数: ${records.length}行`);

    // 3. 商品マスター & 学習データ
    const { data: products, error: prodErr } =
      await supabase.from('products').select('*');
    if (prodErr) throw prodErr;

    const { data: learns } =
      await supabase.from('amazon_product_mapping')
                    .select('amazon_title, product_id');

    // 4. 重複マッチ防止用のマップ（商品IDごとに数量を集計）
    const productQuantityMap = new Map<string, {
      productName: string;
      amazonTitles: Array<{ title: string; qty: number }>;
      totalQty: number;
    }>();

    // 5. 行ループ
    const matched: { productId: string; productName: string; qty: number; amazonTitle: string }[] = [];
    const unmatched: { amazonTitle: string; qty: number }[] = [];
    let totalRows = 0;
    let blankTitleCount = 0;
    let blankTitleQty = 0;

    for (const record of records) {
      totalRows++;
      
      // タイトルと数量を取得（列名で取得）
      const title = (record['タイトル'] || '').trim();
      const qtyRaw = record['注文された商品点数'];
      const qty = toNumber(qtyRaw);
      
      // デバッグログ（最初の5行）
      if (totalRows <= 5) {
        console.log(`行${totalRows}: タイトル="${title}", 数量=${qtyRaw} → ${qty}`);
      }
      
      // タイトルが空の場合
      if (!title) {
        blankTitleCount++;
        blankTitleQty += qty;
        continue;
      }
      
      // 数量が0の場合はスキップ
      if (!qty) continue;

      const hit = findBestMatchSimplified(title, products ?? [], learns ?? []);

      if (hit) {
        // 重複マッチの集計
        if (!productQuantityMap.has(hit.id)) {
          productQuantityMap.set(hit.id, {
            productName: hit.name,
            amazonTitles: [],
            totalQty: 0
          });
        }
        
        const mapEntry = productQuantityMap.get(hit.id)!;
        mapEntry.amazonTitles.push({ title, qty });
        mapEntry.totalQty += qty;
        
        // 個別のマッチ結果も保持（分析用）
        matched.push({
          productId: hit.id,
          productName: hit.name,
          amazonTitle: title,
          qty,
        });
      } else {
        unmatched.push({ amazonTitle: title, qty });
      }
    }

    // 6. 重複マッチの警告
    const duplicateMatches: any[] = [];
    productQuantityMap.forEach((value, productId) => {
      if (value.amazonTitles.length > 1) {
        duplicateMatches.push({
          productId,
          productName: value.productName,
          matchCount: value.amazonTitles.length,
          totalQty: value.totalQty,
          amazonTitles: value.amazonTitles
        });
        
        console.warn(`⚠️ 重複マッチ検出: ${value.productName}`);
        console.warn(`  マッチ数: ${value.amazonTitles.length}件`);
        console.warn(`  合計数量: ${value.totalQty}個`);
        value.amazonTitles.forEach(item => {
          console.warn(`    - ${item.title} (${item.qty}個)`);
        });
      }
    });

    // 7. サマリー
    const matchedQty = matched.reduce((s, r) => s + r.qty, 0);
    const unmatchedQty = unmatched.reduce((s, r) => s + r.qty, 0);

    console.log(`✅ マッチ済み: ${matched.length}件 (${matchedQty}個)`);
    console.log(`❌ 未マッチ: ${unmatched.length}件 (${unmatchedQty}個)`);
    if (blankTitleCount > 0) {
      console.log(`⚠️ タイトル空欄: ${blankTitleCount}件 (${blankTitleQty}個)`);
    }
    if (duplicateMatches.length > 0) {
      console.log(`🔔 重複マッチ: ${duplicateMatches.length}商品`);
    }

    return NextResponse.json({
      ok: true,
      summary: {
        totalRows,
        matchedRows: matched.length,
        unmatchedRows: unmatched.length,
        csvTotalQty: matchedQty + unmatchedQty + blankTitleQty,
        matchedQty,
        unmatchedQty,
        blankTitleInfo: blankTitleCount > 0 ? {
          count: blankTitleCount,
          quantity: blankTitleQty
        } : null,
        duplicateMatches: duplicateMatches.length > 0 ? duplicateMatches : null
      },
      matched,
      unmatched,
    });
  } catch (err) {
    console.error('❌ Amazon CSV 解析エラー:', err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
