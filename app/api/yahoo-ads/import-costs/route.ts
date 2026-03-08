// /app/api/yahoo-ads/import-costs/route.ts
// Yahoo広告費をweb_sales_summaryに取り込み
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
        const seriesCosts = new Map<number, number>()
        let totalYahooCost = 0
        for (const d of data) {
            const current = seriesCosts.get(d.series_code) || 0
            seriesCosts.set(d.series_code, current + d.amount_spent)
            totalYahooCost += d.amount_spent
        }

        // web_sales_summaryに反映
        for (const [seriesCode, yahooCost] of seriesCosts) {
            const { data: existing } = await supabase
                .from('web_sales_summary')
                .select('id, yahoo_cost')
                .eq('series_code', seriesCode)
                .eq('report_month', month)
                .single()

            if (existing) {
                await supabase.from('web_sales_summary')
                    .update({ yahoo_cost: yahooCost })
                    .eq('id', existing.id)
            } else {
                await supabase.from('web_sales_summary').insert({
                    report_month: month,
                    series_code: seriesCode,
                    yahoo_cost: yahooCost,
                    google_cost: 0,
                    meta_cost: 0,
                    amazon_cost: 0,
                    rakuten_cost: 0,
                    other_cost: 0,
                })
            }
        }

        return NextResponse.json({
            success: true,
            yahoo_cost: totalYahooCost,
            series_count: seriesCosts.size,
        })
    } catch (error: any) {
        console.error('Yahoo広告費取り込みエラー:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
