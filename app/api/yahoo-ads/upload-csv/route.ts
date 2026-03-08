// /app/api/yahoo-ads/upload-csv/route.ts
// Yahoo!ショッピング アイテムリーチ広告 CSVアップロード（Shift-JIS対応）
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import iconv from 'iconv-lite'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
)

export const dynamic = 'force-dynamic'

function parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"'
                i++
            } else {
                inQuotes = !inQuotes
            }
        } else if (ch === ',' && !inQuotes) {
            result.push(current.trim())
            current = ''
        } else {
            current += ch
        }
    }
    result.push(current.trim())
    return result
}

function parseNumber(val: string | undefined): number {
    if (!val || val === '-') return 0
    const cleaned = val.replace(/[",\s%¥円]/g, '')
    const num = parseFloat(cleaned)
    return isNaN(num) ? 0 : num
}

// Yahoo CSV カラム名 → DB キー
const COLUMN_KEYS: Record<string, string> = {
    '日付': 'date',
    'ストアアカウント': 'store_account',
    'カテゴリ': 'category',
    '商品コード': 'product_code',
    '商品名': 'product_name',
    '表示回数': 'impressions',
    'クリック数': 'clicks',
    'CTR': 'ctr',
    'CPC': 'cpc',
    '利用金額': 'amount_spent',
    '注文数': 'orders',
    '注文個数': 'order_quantity',
    '売上金額': 'sales_amount',
    'CVR': 'cvr',
    'ROAS': 'roas',
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File
        const month = formData.get('month') as string

        if (!file || !month) {
            return NextResponse.json({ success: false, error: 'ファイルと月は必須です' }, { status: 400 })
        }

        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // 文字コード判定: Shift-JIS → UTF-8
        let csvContent: string
        try {
            const utf8 = buffer.toString('utf-8')
            // BOM付きUTF-8チェック or ASCII互換チェック
            if (utf8.includes('日付') || utf8.includes('商品コード')) {
                csvContent = utf8
            } else {
                csvContent = iconv.decode(buffer, 'Shift_JIS')
            }
        } catch {
            csvContent = iconv.decode(buffer, 'Shift_JIS')
        }

        const lines = csvContent.split(/\r?\n/).filter(l => l.trim())

        // ヘッダー行を検出（「商品コード」を含む行）
        let headerLineIndex = -1
        let headerMapping: Record<number, string> = {}

        for (let i = 0; i < Math.min(lines.length, 10); i++) {
            if (lines[i].includes('商品コード')) {
                headerLineIndex = i
                const headers = parseCSVLine(lines[i])
                headers.forEach((h, idx) => {
                    const cleaned = h.replace(/^"/, '').replace(/"$/, '').trim()
                    if (COLUMN_KEYS[cleaned]) {
                        headerMapping[idx] = COLUMN_KEYS[cleaned]
                    }
                })
                break
            }
        }

        if (headerLineIndex === -1) {
            return NextResponse.json({
                success: false,
                error: 'ヘッダー行（商品コードを含む行）が見つかりません',
                first_lines: lines.slice(0, 5),
            }, { status: 400 })
        }

        // データ行を処理
        const records: any[] = []

        for (let i = headerLineIndex + 1; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i])
            if (cols.length < 5) continue

            const row: Record<string, any> = {}
            Object.entries(headerMapping).forEach(([idxStr, key]) => {
                row[key] = cols[parseInt(idxStr)] || ''
            })

            if (!row.product_code || row.product_code.trim() === '') continue

            // 日付から月を取得 (2026/02 → 2026-02)
            let reportMonth = month
            if (row.date) {
                const m = row.date.match(/(\d{4})\/(\d{2})/)
                if (m) reportMonth = `${m[1]}-${m[2]}`
            }

            records.push({
                report_month: reportMonth,
                store_account: row.store_account || '',
                category: row.category || '',
                product_code: row.product_code.trim(),
                product_name: row.product_name || '',
                impressions: parseNumber(row.impressions),
                clicks: parseNumber(row.clicks),
                ctr: parseNumber(row.ctr),
                cpc: parseNumber(row.cpc),
                amount_spent: parseNumber(row.amount_spent),
                orders: parseNumber(row.orders),
                order_quantity: parseNumber(row.order_quantity),
                sales_amount: parseNumber(row.sales_amount),
                cvr: parseNumber(row.cvr),
                roas: parseNumber(row.roas),
            })
        }

        if (records.length === 0) {
            return NextResponse.json({ success: false, error: '有効なデータ行がありません' }, { status: 400 })
        }

        // 既存データ削除（同月）
        const reportMonths = [...new Set(records.map(r => r.report_month))]
        for (const rm of reportMonths) {
            await supabase.from('yahoo_ads_performance').delete().eq('report_month', rm)
        }

        // バッチ挿入
        const batchSize = 50
        let inserted = 0
        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize)
            const { error } = await supabase.from('yahoo_ads_performance').insert(batch)
            if (error) {
                return NextResponse.json({ success: false, error: `DB挿入エラー: ${error.message}`, inserted }, { status: 500 })
            }
            inserted += batch.length
        }

        return NextResponse.json({
            success: true,
            inserted,
            months: reportMonths,
        })
    } catch (error: any) {
        console.error('Yahoo広告CSVアップロードエラー:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
