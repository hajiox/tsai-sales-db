// app/api/import/amazon-parse/route.ts
// ver.10 - CSV解析改善版（ヘッダー自動検出・カンマ対応）

import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

export const dynamic = 'force-dynamic';

// Supabaseクライアントの初期化
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    console.log('🔍 Amazon CSV解析開始 - ver.10');
    
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
    if (records.length > 0) {
      console.log('📋 ヘッダー:', Object.keys(records[0]));
    }

    // 3. 商品マスター & 学習データ
    const { data: products, error: prodErr } =
      await supabase.from('products').select('*');
    if (prodErr) throw prodErr;

    const { data: learns } =
      await supabase.from('amazon_product_mapping')
                    .select('amazon_title, product_id');

    console.log('📚 学習データ数:', learns?.length);
    if (learns && learns.length > 0) {
      console.log('学習データサンプル:', learns.slice(0, 3));
    }

    // 🔄 マッチング開始前にリセット（重複防止のため）
    findBestMatchSimplified('', [], [], true);

    // 4. 行ループ
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

    // 5. サマリー
    const matchedQty = matched.reduce((s, r) => s + r.qty, 0);
    const unmatchedQty = unmatched.reduce((s, r) => s + r.qty, 0);

    console.log(`✅ マッチ済み: ${matched.length}件 (${matchedQty}個)`);
    console.log(`❌ 未マッチ: ${unmatched.length}件 (${unmatchedQty}個)`);
    if (blankTitleCount > 0) {
      console.log(`⚠️ タイトル空欄: ${blankTitleCount}件 (${blankTitleQty}個)`);
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
        } : null
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
