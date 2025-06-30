// /app/api/verify/yahoo-sales/route.ts   ver.17  （全文）

/**
 * Yahoo 売上 CSV と DB の月次サマリを突き合わせる “おまけ機能”。
 *   - CSV は Shift-JIS / UTF-8 どちらでも OK（detectAndDecode）
 *   - ヘッダー行から「商品名」「数量」の列番号を自動判定
 *   - 結果は {product_id, csv_count, db_count, …} の配列で返す
 *
 * 2025-07-01  列ズレ対応（titleIdx / qtyIdx）＋ Node.js ランタイム固定
 */

export const runtime = 'nodejs';          // Edge だと iconv-lite が読めないため

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  detectAndDecode,
  findBestMatchSimplified,
  Product,
} from '@/lib/csvHelpers';

// Supabase 初期化
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    /* ------------------------------------------------------------------ */
    /* 1. multipart/form-data 受信                                        */
    /* ------------------------------------------------------------------ */
    const form = await req.formData();
    const file      = form.get('file') as File | null;
    const saleMonth = form.get('saleMonth') as string | null;

    if (!file || !saleMonth) {
      return NextResponse.json(
        { success: false, error: 'file または saleMonth が空です' },
        { status: 400 }
      );
    }

    /* ------------------------------------------------------------------ */
    /* 2. Shift-JIS → UTF-8 変換                                          */
    /* ------------------------------------------------------------------ */
    const buf     = Buffer.from(await file.arrayBuffer());
    const csvText = detectAndDecode(buf);             // iconv-lite 使用
    const reportMonth = `${saleMonth}-01`;            // yyyy-MM → yyyy-MM-01

    /* ------------------------------------------------------------------ */
    /* 3. ヘッダー行から列インデックスを自動検出                          */
    /* ------------------------------------------------------------------ */
    const [headerLine, ...dataLines] = csvText
      .split(/\r?\n/)
      .filter((l) => l.trim());

    const headers  = headerLine.split(',').map((h) => h.replace(/"/g, '').trim());
    const titleIdx = headers.findIndex((h) => /商品名/.test(h));      // 見つからなければ -1
    const qtyIdx   = headers.findIndex((h) => /(数量|個数)/.test(h)); // 同上

    const safeTitleIdx = titleIdx === -1 ? 0 : titleIdx;  // フォールバック
    const safeQtyIdx   = qtyIdx   === -1 ? 5 : qtyIdx;

    /* ------------------------------------------------------------------ */
    /* 4. CSV → [{ title, qty }]                                          */
    /* ------------------------------------------------------------------ */
    const csvRows = dataLines
      .map((line) => {
        const cols  = line.split(',').map((c) => c.replace(/"/g, '').trim());
        const title = cols[safeTitleIdx] ?? '';
        const qty   = parseInt((cols[safeQtyIdx] ?? '').replace(/[^\d-]/g, ''), 10) || 0;
        return { title, qty };
      })
      .filter((r) => r.title && r.qty > 0);

    /* ------------------------------------------------------------------ */
    /* 5. DB 取得 & マッチング                                            */
    /* ------------------------------------------------------------------ */
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .returns<Product[]>();

    const { data: maps } = await supabase
      .from('yahoo_product_mapping')
      .select('yahoo_title, product_id');

    const learning = (maps || []).map((m) => ({
      yahoo_title: m.yahoo_title,
      product_id: m.product_id,
    }));

    const csvAgg = new Map<string, number>();
    for (const row of csvRows) {
      const hit = findBestMatchSimplified(row.title, products || [], learning);
      if (hit) csvAgg.set(hit.id, (csvAgg.get(hit.id) || 0) + row.qty);
    }

    /* ------------------------------------------------------------------ */
    /* 6. DB 側集計                                                      */
    /* ------------------------------------------------------------------ */
    const { data: dbRows } = await supabase
      .from('web_sales_summary')
      .select('product_id, yahoo_count')
      .eq('report_month', reportMonth);

    const dbAgg = new Map<string, number>();
    (dbRows || []).forEach((r) => dbAgg.set(r.product_id, r.yahoo_count || 0));

    /* ------------------------------------------------------------------ */
    /* 7. 照合結果生成                                                   */
    /* ------------------------------------------------------------------ */
    const ids = new Set([...csvAgg.keys(), ...dbAgg.keys()]);
    const results = [...ids].map((id) => {
      const p        = products?.find((x) => x.id === id);
      const csvCount = csvAgg.get(id) || 0;
      const dbCount  = dbAgg.get(id)  || 0;
      return {
        product_id:   id,
        product_name: p?.name ?? '不明',
        csv_count:    csvCount,
        db_count:     dbCount,
        difference:   csvCount - dbCount,
        is_match:     csvCount === dbCount,
      };
    });

    /* ------------------------------------------------------------------ */
    /* 8. サマリー（必要ならフロントで利用）                              */
    /* ------------------------------------------------------------------ */
    const summary = {
      total_products:      results.length,
      matched_products:    results.filter((r) => r.is_match).length,
      mismatched_products: results.filter((r) => !r.is_match).length,
      csv_total_quantity:  [...csvAgg.values()].reduce((a, b) => a + b, 0),
      db_total_quantity:   [...dbAgg.values()].reduce((a, b) => a + b, 0),
      total_difference:
        [...csvAgg.values()].reduce((a, b) => a + b, 0) -
        [...dbAgg.values()].reduce((a, b) => a + b, 0),
    };

    return NextResponse.json({ success: true, results, summary });
  } catch (err) {
    console.error('verify-yahoo API error', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message ?? 'unknown' },
      { status: 500 }
    );
  }
}
