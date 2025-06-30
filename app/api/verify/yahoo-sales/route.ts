// /app/api/verify/yahoo-sales/route.ts   ver.19
// 2025-07-01  Yahoo 整合性チェック最終版
//  - Shift-JIS / UTF-8 自動判定（detectAndDecode）
//  - 引用符付き CSV に対応
//  - 商品名 ＝ A 列 (index 0)
//  - 数量    ＝ F 列 (index 5) ★固定
//  - Node.js ランタイムを明示（Edge で iconv-lite が使えない対策）

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  detectAndDecode,
  findBestMatchSimplified,
  Product,
} from '@/lib/csvHelpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/* ------------------------------------------------------------- */
/* 引用符対応 1 行パーサ                                         */
/* ------------------------------------------------------------- */
function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && inQ && line[i + 1] === '"') { cur += '"'; i++; }
    else if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { cols.push(cur); cur = ''; }
    else cur += ch;
  }
  cols.push(cur);
  return cols.map(c => c.replace(/^\s+|\s+$/g, '').replace(/"/g, ''));
}

export async function POST(req: NextRequest) {
  try {
    /* ---------------- 1. multipart/form-data 受信 ---------------- */
    const fd = await req.formData();
    const file      = fd.get('file') as File | null;
    const saleMonth = fd.get('saleMonth') as string | null;

    if (!file || !saleMonth) {
      return NextResponse.json(
        { success: false, error: 'file または saleMonth が空です' },
        { status: 400 }
      );
    }

    /* ---------------- 2. 文字コード補正 -------------------------- */
    const csvText = detectAndDecode(Buffer.from(await file.arrayBuffer()));

    /* ---------------- 3. CSV → [{title, qty}] -------------------- */
    const [_, ...dataLines] = csvText.split(/\r?\n/).filter(l => l.trim()); // ヘッダーは無視
    const TITLE_IDX = 0;   // A 列
    const QTY_IDX   = 5;   // F 列（注文点数合計）

    const csvRows = dataLines
      .map(parseCsvLine)
      .map(cols => ({
        title: cols[TITLE_IDX] ?? '',
        qty:   parseInt((cols[QTY_IDX] ?? '').replace(/[^\d-]/g, ''), 10) || 0,
      }))
      .filter(r => r.title && r.qty > 0);

    /* ---------------- 4. DB 取得 & マッチング -------------------- */
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .returns<Product[]>();

    const { data: maps } = await supabase
      .from('yahoo_product_mapping')
      .select('yahoo_title, product_id');

    const learning = (maps || []).map(m => ({
      yahoo_title: m.yahoo_title,
      product_id:  m.product_id,
    }));

    const csvAgg = new Map<string, number>();
    for (const row of csvRows) {
      const hit = findBestMatchSimplified(row.title, products || [], learning);
      if (hit) csvAgg.set(hit.id, (csvAgg.get(hit.id) || 0) + row.qty);
    }

    /* ---------------- 5. DB 集計 ------------------------------- */
    const reportMonth = `${saleMonth}-01`;
    const { data: dbRows } = await supabase
      .from('web_sales_summary')
      .select('product_id, yahoo_count')
      .eq('report_month', reportMonth);

    const dbAgg = new Map<string, number>();
    (dbRows || []).forEach(r => dbAgg.set(r.product_id, r.yahoo_count || 0));

    /* ---------------- 6. 照合結果 ------------------------------ */
    const ids = new Set([...csvAgg.keys(), ...dbAgg.keys()]);
    const results = [...ids].map(id => {
      const p   = products?.find(x => x.id === id);
      const csv = csvAgg.get(id) || 0;
      const db  = dbAgg.get(id)  || 0;
      return {
        product_id:   id,
        product_name: p?.name ?? '不明',
        csv_count:    csv,
        db_count:     db,
        difference:   csv - db,
        is_match:     csv === db,
      };
    });

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error('verify-yahoo API error', err);
    return NextResponse.json(
      { success: false, error: (err as Error).message ?? 'unknown' },
      { status: 500 }
    );
  }
}
