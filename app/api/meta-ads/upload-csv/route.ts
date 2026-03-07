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
// 実際のMeta CSVヘッダー例:
// レポート開始日,レポート終了日,広告セット名,広告セットの配信,結果,結果インジケーター,結果の単価,
// "消化金額 (JPY)",インプレッション,リーチ,フリークエンシー,"CPM(インプレッション単価) (JPY)",
// クリック(すべて),CTR(すべて),"CPC(すべて) (JPY)"
const COLUMN_MAP: Record<string, string> = {
    // 日本語 - 完全一致
    '広告セット名': 'ad_set_name',
    'キャンペーン名': 'campaign_name',
    '配信': 'delivery',
    '広告セットの配信': 'delivery',
    '結果': 'results',
    '結果の単価': 'cost_per_result',
    '消化金額': 'amount_spent',
    'インプレッション': 'impressions',
    'リーチ': 'reach',
    'フリークエンシー': 'frequency',
    '結果レート': 'result_rate_skip',
    // 半角カッコ（実際のMeta CSV）
    'クリック(すべて)': 'clicks',
    'CTR(すべて)': 'ctr',
    'CPC(すべて)': 'cpc',
    'CPM(インプレッション単価)': 'cpm',
    'リンクのクリック': 'link_clicks',
    'ユニーククリック(すべて)': 'unique_clicks_skip',
    // 全角カッコ
    'クリック（すべて）': 'clicks',
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

// 部分一致でマッチを試みるキーワード → 内部キー
// ※ 長いキーワード・具体的なキーワードを先に配置
const PARTIAL_MATCH_MAP: [string, string][] = [
    // 日本語 - 長いものから
    ['広告セット名', 'ad_set_name'],
    ['キャンペーン名', 'campaign_name'],
    ['広告セットの配信', 'delivery'],
    ['消化金額', 'amount_spent'],
    ['結果の単価', 'cost_per_result'],
    ['CPM(インプレッション単価)', 'cpm'],
    ['CPM（インプレッション単価）', 'cpm'],
    ['インプレッション', 'impressions'],
    ['フリークエンシー', 'frequency'],
    ['リンクのクリック', 'link_clicks'],
    ['クリック(すべて)', 'clicks'],
    ['クリック（すべて）', 'clicks'],
    ['CTR(すべて)', 'ctr'],
    ['CTR（すべて）', 'ctr'],
    ['CPC(すべて)', 'cpc'],
    ['CPC（すべて）', 'cpc'],
    ['リーチ', 'reach'],
    // 英語
    ['Amount Spent', 'amount_spent'],
    ['Amount spent', 'amount_spent'],
    ['Cost per Result', 'cost_per_result'],
    ['Cost per result', 'cost_per_result'],
    ['Ad Set Name', 'ad_set_name'],
    ['Ad set name', 'ad_set_name'],
    ['Campaign Name', 'campaign_name'],
    ['Campaign name', 'campaign_name'],
    ['Link Clicks', 'link_clicks'],
    ['Link clicks', 'link_clicks'],
    ['Clicks', 'clicks'],
]

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

        // ヘッダー行を自動検出（メタ情報行がある場合を考慮）
        let headerLineIndex = 0
        let headers: string[] = []
        const columnMapping: Record<number, string> = {}

        for (let tryIdx = 0; tryIdx < Math.min(lines.length, 10); tryIdx++) {
            const tryHeaders = parseCSVLine(lines[tryIdx])
            const tempMapping: Record<number, string> = {}
            tryHeaders.forEach((h, i) => {
                // BOM除去、引用符除去、通貨サフィックス除去（例: "(JPY)" → 除去）
                const cleanHeader = h
                    .replace(/^\uFEFF/, '')
                    .replace(/^"/, '').replace(/"$/, '')
                    .replace(/\s*\(JPY\)\s*$/i, '')
                    .replace(/\s*\(USD\)\s*$/i, '')
                    .trim()
                // 完全一致
                if (COLUMN_MAP[cleanHeader]) {
                    tempMapping[i] = COLUMN_MAP[cleanHeader]
                } else {
                    // 部分一致（「消化金額 (JPY)」のような通貨サフィックス付きに対応）
                    for (const [keyword, key] of PARTIAL_MATCH_MAP) {
                        if (cleanHeader.includes(keyword) && !tempMapping[i]) {
                            tempMapping[i] = key
                            break
                        }
                    }
                }
            })
            // 3つ以上のカラムがマッチしたらヘッダー行とみなす
            if (Object.keys(tempMapping).length >= 3) {
                headerLineIndex = tryIdx
                headers = tryHeaders
                Object.assign(columnMapping, tempMapping)
                break
            }
        }

        if (!Object.values(columnMapping).includes('ad_set_name')) {
            // 広告セット名が見つからない場合、最初の行のヘッダーを返してデバッグ支援
            const firstLineHeaders = parseCSVLine(lines[0]).map(h => h.replace(/^\uFEFF/, '').trim())
            return NextResponse.json({
                success: false,
                error: '「広告セット名」カラムが見つかりません。Meta広告マネージャから広告セットレベルでエクスポートしてください。',
                detected_headers: firstLineHeaders.slice(0, 20),
            }, { status: 400 })
        }

        // データ行をパース
        const records: any[] = []
        const skippedRows: string[] = []
        for (let i = headerLineIndex + 1; i < lines.length; i++) {
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

            // 文字列フィールドがnull/undefinedの場合にデフォルト値を設定
            row.ad_set_name = row.ad_set_name || ''
            row.campaign_name = row.campaign_name || ''
            row.delivery = row.delivery || ''

            // 広告セット名が空の行（合計行・サマリー行など）はスキップ
            if (!row.ad_set_name || row.ad_set_name === '') {
                skippedRows.push(`行${i + 1}: 広告セット名が空`)
                continue
            }
            // 合計行やメタデータ行をスキップ
            if (row.ad_set_name.includes('の成果') ||
                row.ad_set_name.includes('合計') ||
                row.ad_set_name.includes('Total') ||
                row.ad_set_name.startsWith('*')) {
                skippedRows.push(`行${i + 1}: サマリー行 (${row.ad_set_name})`)
                continue
            }

            row.report_month = month
            records.push(row)
        }

        if (records.length === 0) {
            return NextResponse.json({
                success: false,
                error: '有効なデータ行がありません',
                matched_columns: Object.entries(columnMapping).map(([idx, key]) => `${headers[parseInt(idx)]} → ${key}`),
            }, { status: 400 })
        }

        // DBに存在するカラムのみを残す
        const DB_COLUMNS = new Set([
            'report_month', 'campaign_name', 'ad_set_name', 'delivery',
            'results', 'cost_per_result', 'amount_spent',
            'impressions', 'reach', 'frequency', 'cpm',
            'clicks', 'link_clicks', 'ctr', 'cpc', 'series_code'
        ])

        const cleanRecords = records.map(r => {
            const clean: Record<string, any> = {}
            for (const [key, val] of Object.entries(r)) {
                if (DB_COLUMNS.has(key)) {
                    clean[key] = val
                }
            }
            return clean
        })

        // 既存データを削除して再挿入（UPSERT）
        const { error: deleteError } = await supabase
            .from('meta_ads_performance')
            .delete()
            .eq('report_month', month)

        if (deleteError) throw deleteError

        const { error: insertError } = await supabase
            .from('meta_ads_performance')
            .insert(cleanRecords)

        if (insertError) throw insertError

        const totalSpent = cleanRecords.reduce((s, r) => s + (r.amount_spent || 0), 0)

        return NextResponse.json({
            success: true,
            recordCount: cleanRecords.length,
            totalSpent: Math.round(totalSpent),
            matched_columns: Object.entries(columnMapping).map(([idx, key]) => `${headers[parseInt(idx)]} → ${key}`),
            records: cleanRecords.map(r => ({
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
