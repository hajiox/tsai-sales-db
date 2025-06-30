// /app/api/verify/yahoo-sales/route.ts  ver.15
export const runtime = 'nodejs';         // ← Edge→Node ランタイム指定

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { detectAndDecode, findBestMatchSimplified, Product } from '@/lib/csvHelpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 引用符入り CSV 行パーサ（楽天と同じ）
function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && inQ && line[i + 1] === '"') { cur += '"'; i++; }
    else if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  cols.push(cur.trim());
  return cols;
}

export async function POST(req: NextRequest) {
  try {
    /* 1. 受信 */
    const form      = await req.formData();
    const file      = form.get('file') as File | null;
    const saleMonth = form.get('saleMonth') as string | null;
    if (!file || !saleMonth) {
      return NextResponse.json({ success:false, error:'file または saleMonth が空です' }, { status:400 });
    }

    /* 2. 文字コード補正 */
    const buf     = Buffer.from(await file.arrayBuffer());
    const csvText = detectAndDecode(buf);
    const rptMonth = `${saleMonth}-01`;

    /* 3. --- ヘッダー行から列番号を取得 --- */
    const [headerLine, ...rawLines] = csvText.split(/\r?\n/).filter(l => l.trim());
    const headers     = parseCsvLine(headerLine);
    const titleIdx    = headers.findIndex(h => /商品名/.test(h)) ?? 0;
    const qtyIdx      = headers.findIndex(h => /(数量|個数)/.test(h)) ?? 5;

    /* 4. CSV → [{title, qty}] */
    const rows = rawLines.map(l => {
      const c = parseCsvLine(l);
      return {
        title: (c[titleIdx] ?? '').replace(/"/g, '').trim(),
        qty:   parseInt((c[qtyIdx] ?? '').replace(/"/g, '').replace(/[^\d-]/g,'') || '0', 10),
      };
    }).filter(r => r.title && r.qty > 0);

    /* 5. DB 取得 & マッチング（ここは前回と同じ） */
    const { data: products } = await supabase.from('products').select('*').returns<Product[]>();
    const { data: maps }     = await supabase.from('yahoo_product_mapping').select('yahoo_title, product_id');
    const learning = (maps || []).map(m => ({ yahoo_title:m.yahoo_title, product_id:m.product_id }));

    const csvAgg = new Map<string, number>();
    for (const r of rows) {
      const hit = findBestMatchSimplified(r.title, products || [], learning);
      if (hit) csvAgg.set(hit.id, (csvAgg.get(hit.id) || 0) + r.qty);
    }

    /* 6. DB 集計＋照合（前回と同じ） */
    const { data: dbRows } = await supabase
      .from('web_sales_summary')
      .select('product_id, yahoo_count')
      .eq('report_month', rptMonth);

    const dbAgg = new Map<string, number>();
    (dbRows || []).forEach(d => dbAgg.set(d.product_id, d.yahoo_count || 0));

    const ids = new Set([...csvAgg.keys(), ...dbAgg.keys()]);
    const results = [...ids].map(id => {
      const p = products?.find(x => x.id === id);
      const c = csvAgg.get(id) || 0;
      const d = dbAgg.get(id) || 0;
      return { product_id:id, product_name:p?.name||'不明', csv_count:c, db_count:d, difference:c-d, is_match:c===d };
    });

    const summary = { /* ...略（前回と同じ）... */ };

    return NextResponse.json({ success:true, results, summary });

  } catch (err) {
    console.error('verify-yahoo API error', err);
    return NextResponse.json({ success:false, error:(err as Error).message ?? 'unknown' }, { status:500 });
  }
}
