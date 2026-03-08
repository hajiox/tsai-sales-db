// /app/api/yahoo-ads/import-costs/route.ts
// Yahoo広告費をadvertising_costsテーブルに反映（yahoo_cost列）
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
)

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
    try {
        const { month } = await request.json()
        if (!month) return NextResponse.json({ success: false, error: 'monthは必須' }, { status: 400 })

        // Yahoo広告データ取得
        const { data, error } = await supabase
            .from('yahoo_ads_performance')
            .select('series_code, amount_spent')
            .eq('report_month', month)
            .not('series_code', 'is', null)

        if (error) throw error
        if (!data || data.length === 0) {
            return NextResponse.json({ success: false, error: '紐付け済みのデータがありません' }, { status: 400 })
        }

        // シリーズ別に広告費を集計
        const seriesCostMap = new Map<number, number>()
        data.forEach(row => {
            if (row.series_code && row.amount_spent > 0) {
                const current = seriesCostMap.get(row.series_code) || 0
                seriesCostMap.set(row.series_code, current + Math.round(row.amount_spent))
            }
        })

        const reportMonth = `${month}-01`
        let updated = 0
        let created = 0

        for (const [seriesCode, yahooCost] of seriesCostMap.entries()) {
            const { data: existing } = await supabase
                .from('advertising_costs')
                .select('id')
                .eq('series_code', seriesCode)
                .eq('report_month', reportMonth)
                .maybeSingle()

            if (existing) {
                const { error } = await supabase
                    .from('advertising_costs')
                    .update({ yahoo_cost: yahooCost })
                    .eq('series_code', seriesCode)
                    .eq('report_month', reportMonth)
                if (error) throw error
                updated++
            } else {
                const { error } = await supabase
                    .from('advertising_costs')
                    .insert({
                        series_code: seriesCode,
                        report_month: reportMonth,
                        google_cost: 0,
                        meta_cost: 0,
                        amazon_cost: 0,
                        rakuten_cost: 0,
                        other_cost: 0,
                        yahoo_cost: yahooCost,
                    })
                if (error) throw error
                created++
            }
        }

        const totalCost = Array.from(seriesCostMap.values()).reduce((s, c) => s + c, 0)

        return NextResponse.json({
            success: true,
            yahoo_cost: totalCost,
            series_count: seriesCostMap.size,
            updated,
            created,
        })
    } catch (error: any) {
        console.error('Yahoo広告費取り込みエラー:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}

