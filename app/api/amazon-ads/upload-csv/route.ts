// /app/api/amazon-ads/upload-csv/route.ts
// Amazon スポンサープロダクト広告 XLSX/CSVアップロード
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
)

export const dynamic = 'force-dynamic'

function parseNumber(val: any): number {
    if (val === null || val === undefined || val === '' || val === '-') return 0
    if (typeof val === 'number') return val
    const cleaned = String(val).replace(/[",\s%¥$]/g, '')
    const num = parseFloat(cleaned)
    return isNaN(num) ? 0 : num
}

// Amazon レポートカラム名 → DB キー
const COLUMN_KEYS: Record<string, string> = {
    '開始日': 'start_date',
    '終了日': 'end_date',
    'Start Date': 'start_date',
    'End Date': 'end_date',
    'ポートフォリオ名': 'portfolio',
    'Portfolio name': 'portfolio',
    'キャンペーン名': 'campaign_name',
    'Campaign Name': 'campaign_name',
    '広告グループ名': 'ad_group_name',
    'Ad Group Name': 'ad_group_name',
    '宣伝SKU': 'sku',
    'Advertised SKU': 'sku',
    '宣伝 ASIN': 'asin',
    'Advertised ASIN': 'asin',
    'インプレッション': 'impressions',
    'Impressions': 'impressions',
    'クリック数': 'clicks',
    'Clicks': 'clicks',
    'クリックスルー率（CTR）': 'ctr',
    'Click-Through Rate (CTR)': 'ctr',
    'クリック課金制（CPC）': 'cpc',
    'Cost Per Click (CPC)': 'cpc',
    '費用': 'cost',
    'Spend': 'cost',
    '広告がクリックされてから7日間の総売上高': 'sales',
    '7 Day Total Sales': 'sales',
    '広告費売上高比率（ACOS）合計': 'acos',
    'Total Advertising Cost of Sales (ACOS)': 'acos',
    '広告費用対効果（ROAS）合計': 'roas',
    'Total Return on Advertising Spend (ROAS)': 'roas',
    '広告がクリックされてから7日間の合計注文数': 'orders',
    '7 Day Total Orders (#)': 'orders',
    '広告がクリックされてから7日間の合計販売数': 'units_sold',
    '7 Day Total Units (#)': 'units_sold',
    '広告がクリックされてから7日間のコンバージョン率': 'conversion_rate',
    '7 Day Conversion Rate': 'conversion_rate',
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

        // XLSX/CSV をパース
        const workbook = XLSX.read(buffer, { type: 'buffer' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]

        if (jsonData.length < 2) {
            return NextResponse.json({ success: false, error: 'データが不足しています' }, { status: 400 })
        }

        // ヘッダー行を解析
        const headers = jsonData[0] as string[]
        const headerMapping: Record<number, string> = {}
        headers.forEach((h, idx) => {
            const cleaned = String(h).trim()
            if (COLUMN_KEYS[cleaned]) {
                headerMapping[idx] = COLUMN_KEYS[cleaned]
            }
        })

        if (!Object.values(headerMapping).includes('asin')) {
            return NextResponse.json({
                success: false,
                error: 'ASINカラムが見つかりません。レポートタイプは「広告対象商品」を選択してください。',
                headers: headers.slice(0, 10),
            }, { status: 400 })
        }

        // データ行を処理
        const records: any[] = []

        for (let i = 1; i < jsonData.length; i++) {
            const cols = jsonData[i]
            if (!cols || cols.length < 5) continue

            const row: Record<string, any> = {}
            Object.entries(headerMapping).forEach(([idxStr, key]) => {
                row[key] = cols[parseInt(idxStr)]
            })

            if (!row.asin || String(row.asin).trim() === '') continue

            // 日付から月を取得
            let reportMonth = month
            if (row.start_date) {
                const d = new Date(row.start_date)
                if (!isNaN(d.getTime())) {
                    reportMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                }
            }

            records.push({
                report_month: reportMonth,
                start_date: row.start_date ? new Date(row.start_date).toISOString().split('T')[0] : null,
                end_date: row.end_date ? new Date(row.end_date).toISOString().split('T')[0] : null,
                portfolio: row.portfolio === 'No Portfolio' ? null : (row.portfolio || null),
                campaign_name: row.campaign_name || '',
                ad_group_name: row.ad_group_name || '',
                sku: row.sku || '',
                asin: String(row.asin).trim(),
                impressions: parseNumber(row.impressions),
                clicks: parseNumber(row.clicks),
                ctr: parseNumber(row.ctr) * (parseNumber(row.ctr) < 1 ? 100 : 1),  // 0.01 → 1%
                cpc: parseNumber(row.cpc),
                cost: parseNumber(row.cost),
                sales: parseNumber(row.sales),
                acos: parseNumber(row.acos) * (parseNumber(row.acos) < 1 ? 100 : 1),
                roas: parseNumber(row.roas),
                orders: parseNumber(row.orders),
                units_sold: parseNumber(row.units_sold),
                conversion_rate: parseNumber(row.conversion_rate) * (parseNumber(row.conversion_rate) < 1 ? 100 : 1),
            })
        }

        if (records.length === 0) {
            return NextResponse.json({ success: false, error: '有効なデータ行がありません' }, { status: 400 })
        }

        // 既存データ削除（同月）
        const reportMonths = [...new Set(records.map(r => r.report_month))]
        for (const rm of reportMonths) {
            await supabase.from('amazon_ads_performance').delete().eq('report_month', rm)
        }

        // バッチ挿入
        const batchSize = 50
        let inserted = 0
        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize)
            const { error } = await supabase.from('amazon_ads_performance').insert(batch)
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
        console.error('Amazon広告アップロードエラー:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
