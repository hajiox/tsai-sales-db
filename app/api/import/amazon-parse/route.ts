// /app/api/import/amazon-parse/route.ts ver.11 (ステートレス・チャネル対応版)
import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import { findBestMatchSimplified } from '@/lib/csvHelpers';

export const dynamic = 'force-dynamic';

const supabase = createClient( process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY! );

const toNumber = (raw: string | number): number => { return Number(raw?.toString().replace(/[,，\s]/g, '').trim() || 0); };

function parseCsvWithHeader(text: string): any[] {
  return parse(text, { columns: true, skip_empty_lines: true, delimiter: ',', quote: '"', relax_column_count: true, trim: true, });
}

export async function POST(req: NextRequest) {
  try {
    console.log('🔍 Amazon CSV解析開始 - ver.11');
    
    const form = await req.formData();
    const file = form.get('file') as File;
    if (!file) { return NextResponse.json({ ok: false, error: 'CSV が選択されていません' }, { status: 400 }); }

    const csvText = await file.text();
    const records = parseCsvWithHeader(csvText);
    
    const { data: products, error: prodErr } = await supabase.from('products').select('*');
    if (prodErr) throw prodErr;

    const { data: learns, error: learnErr } = await supabase.from('amazon_product_mapping').select('amazon_title, product_id');
    if (learnErr) throw new Error(`Amazonの学習データ取得に失敗: ${learnErr.message}`);

    console.log('📚 学習データ数:', learns?.length);

    // ★修正点1: このCSV解析専用のマッチ済みID記憶セットを作成
    const matchedProductIdsThisTime = new Set<string>();

    const matched: { productId: string; productName: string; qty: number; amazonTitle: string, matchType: string }[] = [];
    const unmatched: { amazonTitle: string; qty: number }[] = [];
    let blankTitleCount = 0;
    let blankTitleQty = 0;

    for (const record of records) {
      const title = (record['タイトル'] || '').trim();
      const qty = toNumber(record['注文された商品点数']);
      
      if (!title) { blankTitleCount++; blankTitleQty += qty; continue; }
      if (!qty) continue;

      // ★修正点2: 新しい引数でヘルパー関数を呼び出す
      const result = findBestMatchSimplified(
        title, 
        products ?? [], 
        learns ?? [],
        matchedProductIdsThisTime, // 記憶セットを渡す
        'amazon'                  // 'amazon'チャネルだと伝える
      );

      if (result) {
        const hit = result.product;
        matched.push({ productId: hit.id, productName: hit.name, amazonTitle: title, qty, matchType: result.matchType });
      } else {
        unmatched.push({ amazonTitle: title, qty });
      }
    }

    const matchedQty = matched.reduce((s, r) => s + r.qty, 0);
    const unmatchedQty = unmatched.reduce((s, r) => s + r.qty, 0);
    
    return NextResponse.json({
      ok: true,
      summary: {
        matchedRows: matched.length, unmatchedRows: unmatched.length,
        csvTotalQty: matchedQty + unmatchedQty + blankTitleQty,
        matchedQty, unmatchedQty,
        blankTitleInfo: blankTitleCount > 0 ? { count: blankTitleCount, quantity: blankTitleQty } : null
      },
      matched, unmatched,
    });
  } catch (err) {
    console.error('❌ Amazon CSV 解析エラー:', err);
    return NextResponse.json( { ok: false, error: (err as Error).message }, { status: 500 }, );
  }
}
