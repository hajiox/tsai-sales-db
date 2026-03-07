// /app/api/rakuten-ads/upload-csv/route.ts
// 楽天RPP広告 CSVアップロード（ZIP+Shift-JIS対応）
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import JSZip from 'jszip'
import iconv from 'iconv-lite'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
)

export const dynamic = 'force-dynamic'

// CSVライン解析（引用符対応）
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
            result.push(current)
            current = ''
        } else {
            current += ch
        }
    }
    result.push(current)
    return result
}

function parseNumber(val: string | undefined): number {
    if (!val) return 0
    const cleaned = val.replace(/[",\s%]/g, '')
    const num = parseFloat(cleaned)
    return isNaN(num) ? 0 : num
}

// ヘッダーのカラムインデックスマッピング
const COLUMN_KEYS: Record<string, string> = {
    '日付': 'date',
    '商品ページURL': 'product_url',
    '商品管理番号': 'product_code',
    '入札単価': 'bid_price',
    'CTR(%)': 'ctr',
    'CTR': 'ctr',
    '商品CPC': 'product_cpc',
    'クリック数(合計)': 'clicks',
    '実績額(合計)': 'amount_spent',
    'CPC実績(合計)': 'cpc_actual',
    'クリック数(新規)': 'clicks_new',
    '実績額(新規)': 'amount_spent_new',
    'クリック数(既存)': 'clicks_existing',
    '実績額(既存)': 'amount_spent_existing',
    '売上金額(合計720時間)': 'sales_amount',
    '売上件数(合計720時間)': 'sales_count',
    'CVR(合計720時間)(%)': 'cvr',
    'CVR(合計720時間)': 'cvr',
    'ROAS(合計720時間)(%)': 'roas',
    'ROAS(合計720時間)': 'roas',
    '注文獲得単価(合計720時間)': 'cost_per_order',
    '売上金額(新規720時間)': 'sales_amount_new',
    '売上件数(新規720時間)': 'sales_count_new',
    '売上金額(既存720時間)': 'sales_amount_existing',
    '売上件数(既存720時間)': 'sales_count_existing',
    // 12時間版（フォールバック）
    '売上金額(合計12時間)': 'sales_amount_12h',
    '売上件数(合計12時間)': 'sales_count_12h',
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

        let csvContent: string

        // ZIPかCSVかを判定
        const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B
        if (isZip) {
            const zip = await JSZip.loadAsync(buffer)
            const csvFile = Object.values(zip.files).find(f => f.name.endsWith('.csv'))
            if (!csvFile) {
                return NextResponse.json({ success: false, error: 'ZIP内にCSVファイルが見つかりません' }, { status: 400 })
            }
            const csvBuffer = await csvFile.async('nodebuffer')
            // Shift-JIS → UTF-8
            csvContent = iconv.decode(csvBuffer, 'Shift_JIS')
        } else {
            // そのままCSVとして読む（Shift-JIS or UTF-8）
            try {
                csvContent = iconv.decode(buffer, 'Shift_JIS')
            } catch {
                csvContent = buffer.toString('utf-8')
            }
        }

        const lines = csvContent.split(/\r?\n/).filter(l => l.trim())

        // ヘッダー行を検出（「商品管理番号」を含む行）
        let headerLineIndex = -1
        let headerMapping: Record<number, string> = {}

        for (let i = 0; i < Math.min(lines.length, 15); i++) {
            if (lines[i].includes('商品管理番号')) {
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
                error: 'ヘッダー行（商品管理番号を含む行）が見つかりません',
                first_lines: lines.slice(0, 5),
            }, { status: 400 })
        }

        // report_month を yyyy-MM 形式に変換（「2026年03月」→「2026-03」）
        const monthRegex = /(\d{4})年(\d{2})月/

        // データ行を処理
        const records: any[] = []
        const skippedRows: string[] = []

        for (let i = headerLineIndex + 1; i < lines.length; i++) {
            const cols = parseCSVLine(lines[i])
            if (cols.length < 5) continue

            const row: Record<string, any> = {}
            Object.entries(headerMapping).forEach(([idxStr, key]) => {
                row[key] = cols[parseInt(idxStr)] || ''
            })

            // 商品管理番号が空ならスキップ
            if (!row.product_code || row.product_code.trim() === '') {
                skippedRows.push(`行${i + 1}: 商品管理番号が空`)
                continue
            }

            // 日付から月を取得
            let reportMonth = month
            if (row.date) {
                const m = row.date.match(monthRegex)
                if (m) reportMonth = `${m[1]}-${m[2]}`
            }

            const record = {
                report_month: reportMonth,
                product_url: row.product_url || '',
                product_code: row.product_code.trim(),
                bid_price: parseNumber(row.bid_price),
                ctr: parseNumber(row.ctr),
                clicks: parseNumber(row.clicks),
                amount_spent: parseNumber(row.amount_spent),
                cpc_actual: parseNumber(row.cpc_actual),
                clicks_new: parseNumber(row.clicks_new),
                amount_spent_new: parseNumber(row.amount_spent_new),
                clicks_existing: parseNumber(row.clicks_existing),
                amount_spent_existing: parseNumber(row.amount_spent_existing),
                sales_amount: parseNumber(row.sales_amount) || parseNumber(row.sales_amount_12h),
                sales_count: parseNumber(row.sales_count) || parseNumber(row.sales_count_12h),
                cvr: parseNumber(row.cvr),
                roas: parseNumber(row.roas),
                cost_per_order: parseNumber(row.cost_per_order),
                sales_amount_new: parseNumber(row.sales_amount_new),
                sales_count_new: parseNumber(row.sales_count_new),
                sales_amount_existing: parseNumber(row.sales_amount_existing),
                sales_count_existing: parseNumber(row.sales_count_existing),
            }

            records.push(record)
        }

        if (records.length === 0) {
            return NextResponse.json({ success: false, error: '有効なデータ行がありません' }, { status: 400 })
        }

        // 既存データ削除（同月）
        const reportMonths = [...new Set(records.map(r => r.report_month))]
        for (const rm of reportMonths) {
            await supabase.from('rakuten_ads_performance').delete().eq('report_month', rm)
        }

        // バッチ挿入
        const batchSize = 50
        let inserted = 0
        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize)
            const { error } = await supabase.from('rakuten_ads_performance').insert(batch)
            if (error) {
                console.error('楽天RPP挿入エラー:', error)
                return NextResponse.json({ success: false, error: `DB挿入エラー: ${error.message}`, inserted }, { status: 500 })
            }
            inserted += batch.length
        }

        return NextResponse.json({
            success: true,
            inserted,
            months: reportMonths,
            matched_columns: Object.entries(headerMapping).map(([idx, key]) => `${idx}:${key}`),
            skipped: skippedRows.length,
        })
    } catch (error: any) {
        console.error('楽天RPP CSVアップロードエラー:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
