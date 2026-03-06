// /app/api/meta-ads/upload-csv/route.ts
// Meta広告CSVをパースしてmeta_ads_performanceテーブルに保存
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set") })(),
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set") })()
)

export const dynamic = 'force-dynamic'

function parseCSVLine(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"'
                i++
            } else {
                inQuotes = !inQuotes
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim())
            current = ''
        } else {
            current += char
        }
    }
    result.push(current.trim())
    return result
}

// カラム名のマッピング（日本語 → 英語 → 内部キー）
const COLUMN_MAP: Record<string, string> = {
    // 日本語
    '広告セット名': 'ad_set_name',
    'キャンペーン名': 'campaign_name',
    '配信': 'delivery',
    '結果': 'results',
    '結果の単価': 'cost_per_result',
    '消化金額': 'amount_spent',
    'インプレッション': 'impressions',
    'リーチ': 'reach',
    'フリークエンシー': 'frequency',
    'クリック（すべて）': 'clicks',
    'リンクのクリック': 'link_clicks',
    'CTR（すべて）': 'ctr',
    'CPC（すべて）': 'cpc',
    // 英語
    'Ad Set Name': 'ad_set_name',
    'Ad set name': 'ad_set_name',
    'Campaign Name': 'campaign_name',
    'Campaign name': 'campaign_name',
    'Delivery': 'delivery',
    'Results': 'results',
    'Cost per Result': 'cost_per_result',
    'Cost per result': 'cost_per_result',
    'Amount Spent': 'amount_spent',
    'Amount spent': 'amount_spent',
    'Impressions': 'impressions',
    'Reach': 'reach',
    'Frequency': 'frequency',
    'Clicks (All)': 'clicks',
    'Clicks (all)': 'clicks',
    'Link Clicks': 'link_clicks',
    'Link clicks': 'link_clicks',
    'CTR (All)': 'ctr',
    'CTR (all)': 'ctr',
    'CPC (All)': 'cpc',
    'CPC (all)': 'cpc',
    'CPM': 'cpm',
}

function parseNumber(val: string | undefined): number {
    if (!val || val === '' || val === '-' || val === '—') return 0
    // ¥や,を除去
    const cleaned = val.replace(/[¥$,\s%]/g, '')
    const num = parseFloat(cleaned)
    return isNaN(num) ? 0 : num
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File
        const month = formData.get('month') as string

        if (!file || !month) {
            return NextResponse.json({ success: false, error: 'file と month は必須です' }, { status: 400 })
        }

        const text = await file.text()
        const lines = text.split(/\r?\n/).filter(l => l.trim())

        if (lines.length < 2) {
            return NextResponse.json({ success: false, error: 'CSVファイルが空です' }, { status: 400 })
        }

        // ヘッダー解析
        const headerLine = lines[0]
        const headers = parseCSVLine(headerLine)
        const columnMapping: Record<number, string> = {}

        headers.forEach((h, i) => {
            // BOM除去
            const cleanHeader = h.replace(/^\uFEFF/, '').replace(/^"/, '').replace(/"$/, '').trim()
            if (COLUMN_MAP[cleanHeader]) {
                columnMapping[i] = COLUMN_MAP[cleanHeader]
            }
        })

        if (!Object.values(columnMapping).includes('ad_set_name')) {
            return NextResponse.json({
                success: false,
                error: '「広告セット名」カラムが見つかりません。Meta広告マネージャから広告セットレベルでエクスポートしてください。',
                detected_headers: headers.slice(0, 10),
            }, { status: 400 })
        }

        // データ行をパース
        const records: any[] = []
        for (let i = 1; i < lines.length; i++) {
            const values = parseCSVLine(lines[i])
            const row: Record<string, any> = {}

            for (const [colIdx, key] of Object.entries(columnMapping)) {
                const val = values[parseInt(colIdx)]
                if (['ad_set_name', 'campaign_name', 'delivery'].includes(key)) {
                    row[key] = val || ''
                } else if (['impressions', 'reach', 'clicks', 'link_clicks'].includes(key)) {
                    row[key] = Math.round(parseNumber(val))
                } else {
                    row[key] = parseNumber(val)
                }
            }

            // 広告セット名が空の行（合計行など）はスキップ
            if (!row.ad_set_name || row.ad_set_name === '' || row.ad_set_name.includes('の成果')) continue

            row.report_month = month
            records.push(row)
        }

        if (records.length === 0) {
            return NextResponse.json({ success: false, error: '有効なデータ行がありません' }, { status: 400 })
        }

        // 既存データを削除して再挿入（UPSERT）
        const { error: deleteError } = await supabase
            .from('meta_ads_performance')
            .delete()
            .eq('report_month', month)

        if (deleteError) throw deleteError

        const { error: insertError } = await supabase
            .from('meta_ads_performance')
            .insert(records)

        if (insertError) throw insertError

        const totalSpent = records.reduce((s, r) => s + (r.amount_spent || 0), 0)

        return NextResponse.json({
            success: true,
            recordCount: records.length,
            totalSpent: Math.round(totalSpent),
            records: records.map(r => ({
                campaign_name: r.campaign_name,
                ad_set_name: r.ad_set_name,
                amount_spent: r.amount_spent,
                impressions: r.impressions,
                clicks: r.clicks,
                results: r.results,
            })),
        })
    } catch (error: any) {
        console.error('Meta CSV アップロードエラー:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
