// app/api/import/amazon-parse/route.ts
// -----------------------------------------------------------------------------
// ver. 9  – 2025-07-05
// 変更点:
//   1. csv-parse を採用し RFC4180 準拠で列ズレゼロ
//   2. 「1,234」の千区切りカンマを除去して数値化
// -----------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { parse } from 'csv-parse/sync'       // ★ 公式 CSV パーサ
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { findBestMatchSimplified } from '@/lib/csvHelpers'

export const dynamic = 'force-dynamic'

// -----------------------------------------------------------------------------
// 型定義
// -----------------------------------------------------------------------------
const CsvSchema = z.object({
  ASIN:             z.string(),
  商品名:              z.string(),
  注文品目総数:          z.string(),  // N 列 (数量)
  単価:               z.string(),  // 金額
  注文日:              z.string()   // "2025/06/01"
})
type CsvRow = z.infer<typeof CsvSchema>

// -----------------------------------------------------------------------------
// ユーティリティ
// -----------------------------------------------------------------------------
/** 「1,234」「 1 234 」→ Number(1234) */
const toNumber = (raw: string) =>
  Number(raw.replace(/[,，\s]/g, '').trim() || 0)

/** CSV 全文をオブジェクト配列へ */
function parseCsv(text: string): CsvRow[] {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ',',
    quote: '"',
    relax_column_count: true,
    trim: true
  }).map((raw: any) => CsvSchema.parse(raw))
}

// -----------------------------------------------------------------------------
// POST
// -----------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    // 1. multipart/form-data から CSV ファイル取得
    const form = await req.formData()
    const file = form.get('file') as File
    if (!file) {
      return NextResponse.json(
        { ok: false, error: 'CSV ファイルが選択されていません' },
        { status: 400 }
      )
    }

    // 2. CSV → 配列
    const csvText = await file.text()
    const rows    = parseCsv(csvText)

    // 3. 商品マスター & 学習データ
    const { data: products, error: prodErr } =
      await supabase.from('products').select('*')
    if (prodErr) throw prodErr

    const { data: learns } =
      await supabase.from('amazon_product_mapping')
                    .select('amazon_title, product_id')

    // 4. 行ループ & マッチング
    const matched:   { productId: string; productName: string; qty: number; amazonTitle: string }[] = []
    const unmatched: { amazonTitle: string; qty: number }[] = []

    for (const r of rows) {
      const qty = toNumber(r.注文品目総数)      // ★ カンマ除去後に数値化
      if (!qty) continue                       // 0 はスキップ

      const hit = findBestMatchSimplified(
        r.商品名.trim(),
        products ?? [],
        learns   ?? []
      )

      if (hit) {
        matched.push({
          productId:   hit.id,
          productName: hit.name,
          amazonTitle: r.商品名,
          qty
        })
      } else {
        unmatched.push({ amazonTitle: r.商品名, qty })
      }
    }

    // 5. 必要なら DB へ upsert
    /*
    if (matched.length) {
      const { error: upErr } = await supabase
        .from('amazon_sales_raw')
        .upsert(
          matched.map(m => ({
            product_id: m.productId,
            date:       rows[0].注文日,
            amazon_qty: m.qty
          })),
          { onConflict: 'product_id,date' }
        )
      if (upErr) throw upErr
    }
    */

    // 6. サマリー
    const matchedQty   = matched.reduce((s, r) => s + r.qty, 0)
    const unmatchedQty = unmatched.reduce((s, r) => s + r.qty, 0)

    return NextResponse.json({
      ok: true,
      summary: {
        totalRows: rows.length,
        matchedRows: matched.length,
        unmatchedRows: unmatched.length,
        csvTotalQty: matchedQty + unmatchedQty,
        matchedQty,
        unmatchedQty
      },
      matched,
      unmatched
    })
  } catch (err) {
    console.error('Amazon CSV 解析エラー:', err)
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    )
  }
}
