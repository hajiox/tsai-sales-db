// /app/api/verify/yahoo-sales/route.ts  ver.16
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { detectAndDecode, findBestMatchSimplified, Product } from '@/lib/csvHelpers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    /* 1. 受信 */
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const saleMonth = form.get('saleMonth') as string | null;
    if (!file || !saleMonth) {
      return NextResponse.json({ success:false, error:'file または saleMonth が空です' }, { status:400 });
    }

    /* 2. Shift-JIS → UTF-8 */
    const buf = Buffer.from(await file.arrayBuffer());
    const csvText = detectAndDecode(buf);
    const reportMonth = `${saleMonth}-01`;

    /* 3. 行ごと split → インポートAPIと同じ簡易パーサ */
    const lines = csvText.split(/\r?\n/).slice(1).filter(l => l.trim());
    const csvRows = lines.map(l => {
      const cols = l.split(',').map(c => c.replace(/"/g,'').trim());
      const title = cols[0];
      const qty   = parseInt(cols[5], 10) || 0;   // NaN → 0
      return { title, qty };
    }).filter(r => r.title && r.qty > 0);

    /* 4. DB と学習データ */
    const { data: products } = await supabase.from('products').select('*').returns<Product[]>();
    const { data: maps } = await supabase.from('yahoo_product_mapping').select('yahoo_title, product_id');
    const learning = (maps || []).map(m => ({ yahoo_title:m.yahoo_title, product_id:m.product_id }));

    /* 5. CSV 集計 */
    const csvAgg = new Map<string, number>();
    for (const row of csvRows) {
      const hit = findBestMatchSimplified(row.title, products || [], learning);
      if (hit) csvAgg.set(hit.id, (csvAgg.get(hit.id) || 0) + row.qty);
    }

    /* 6. DB 集計・照合（変更なし） */
    const { data: dbRows } = await supabase
      .from('web_sales_summary')
      .select('product_id, yahoo_count')
      .eq('report_month', reportMonth);

    const dbAgg = new Map<string, number>();
    (dbRows || []).forEach(d => dbAgg.set(d.product_id, d.yahoo_count || 0));

    const ids = new Set([...csvAgg.keys(), ...dbAgg.keys()]);
    const results = [...ids].map(id => {
      const p = products?.find(x => x.id === id);
      const csv = csvAgg.get(id) || 0;
      const db  = dbAgg.get(id)  || 0;
      return { product_id:id, product_name:p?.name||'不明', csv_count:csv, db_count:db, difference:csv-db, is_match:csv===db };
    });

    return NextResponse.json({ success:true, results });
  } catch (err) {
    console.error('verify-yahoo API error', err);
    return NextResponse.json({ success:false, error:(err as Error).message }, { status:500 });
  }
}
