// app/api/import/amazon-parse/route.ts
// ver. 9  – 列番号直取り版（C=タイトル, N=数量）

import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'csv-parse/sync';
import { supabase } from '@/lib/supabase';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

export const dynamic = 'force-dynamic';

// C 列 = 0-index で 2,  N 列 = 0-index で 13
const TITLE_COL = 2;
const QTY_COL   = 13;

/** 「1,234」「 1 234 」→ 1234 */
const toNumber = (raw: string) =>
  Number(raw?.replace(/[,，\s]/g, '').trim() || 0);

/** CSV 全文 → 行ごとの string[] 配列 */
function parseCsv(text: string): string[][] {
  return parse(text, {
    columns: false,          // ヘッダー無視
    skip_empty_lines: true,
    delimiter: ',',
    quote: '"',
    relax_column_count: true,
    trim: true,
  });
}

export async function POST(req: NextRequest) {
  try {
    // 1. ファイル取得
    const form = await req.formData();
    const file = form.get('file') as File;
    if (!file) {
      return NextResponse.json({ ok: false, error: 'CSV が選択されていません' }, { status: 400 });
    }

    // 2. CSV → 行配列
    const csvText = await file.text();
    const rows    = parseCsv(csvText).slice(1); // 先頭はヘッダー

    // 3. 商品マスター & 学習データ
    const { data: products, error: prodErr } =
      await supabase.from('products').select('*');
    if (prodErr) throw prodErr;

    const { data: learns } =
      await supabase.from('amazon_product_mapping')
                    .select('amazon_title, product_id');

    // 4. 行ループ
    const matched:   { productId: string; productName: string; qty: number; amazonTitle: string }[] = [];
    const unmatched: { amazonTitle: string; qty: number }[] = [];

    for (const cols of rows) {
      const title = (cols[TITLE_COL] ?? '').trim();
      const qty   = toNumber(cols[QTY_COL]);
      if (!title || !qty) continue;

      const hit = findBestMatchSimplified(title, products ?? [], learns ?? []);

      if (hit) {
        matched.push({
          productId:   hit.id,
          productName: hit.name,
          amazonTitle: title,
          qty,
        });
      } else {
        unmatched.push({ amazonTitle: title, qty });
      }
    }

    // 5. （必要なら）DB へ upsert
    /*
    if (matched.length) {
      const { error: upErr } = await supabase
        .from('amazon_sales_raw')
        .upsert(
          matched.map(m => ({
            product_id: m.productId,
            date:       rows[0][0], // A 列に日付がある場合など
            amazon_qty: m.qty,
          })),
          { onConflict: 'product_id,date' },
        );
      if (upErr) throw upErr;
    }
    */

    // 6. サマリー
    const matchedQty   = matched.reduce((s, r) => s + r.qty, 0);
    const unmatchedQty = unmatched.reduce((s, r) => s + r.qty, 0);

    return NextResponse.json({
      ok: true,
      summary: {
        totalRows: rows.length,
        matchedRows: matched.length,
        unmatchedRows: unmatched.length,
        csvTotalQty: matchedQty + unmatchedQty,
        matchedQty,
        unmatchedQty,
      },
      matched,
      unmatched,
    });
  } catch (err) {
    console.error('Amazon CSV 解析エラー:', err);
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
