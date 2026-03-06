// /app/api/google-ads/import-costs/route.ts
// 広告費をadvertising_costsテーブルに取り込むAPIルート
// service_role_keyを使用してRLSを回避

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set") })(),
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set") })()
)

export const dynamic = 'force-dynamic'

interface CostMapping {
    series_code: number
    cost: number
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { month, mappings } = body as { month: string; mappings: CostMapping[] }

        if (!month || !mappings || mappings.length === 0) {
            return NextResponse.json({ success: false, error: 'month と mappings は必須です' }, { status: 400 })
        }

        const reportMonth = `${month}-01`

        // シリーズ別に広告費を集計
        const seriesCostMap = new Map<number, number>()
        mappings.forEach(m => {
            if (m.series_code && m.cost > 0) {
                const current = seriesCostMap.get(m.series_code) || 0
                seriesCostMap.set(m.series_code, current + Math.round(m.cost))
            }
        })

        let updated = 0
        let created = 0

        for (const [seriesCode, googleCost] of seriesCostMap.entries()) {
            // 既存レコードがあるか確認
            const { data: existing } = await supabase
                .from('advertising_costs')
                .select('id')
                .eq('series_code', seriesCode)
                .eq('report_month', reportMonth)
                .maybeSingle()

            if (existing) {
                // 既存レコードのgoogle_costを更新
                const { error } = await supabase
                    .from('advertising_costs')
                    .update({ google_cost: googleCost })
                    .eq('series_code', seriesCode)
                    .eq('report_month', reportMonth)
                if (error) throw error
                updated++
            } else {
                // 新規作成
                const { error } = await supabase
                    .from('advertising_costs')
                    .insert({
                        series_code: seriesCode,
                        report_month: reportMonth,
                        google_cost: googleCost,
                        amazon_cost: 0,
                        other_cost: 0,
                        rakuten_cost: 0,
                        yahoo_cost: 0,
                    })
                if (error) throw error
                created++
            }
        }

        const totalCost = Array.from(seriesCostMap.values()).reduce((s, c) => s + c, 0)

        return NextResponse.json({
            success: true,
            totalCost,
            seriesCount: seriesCostMap.size,
            updated,
            created,
        })
    } catch (error: any) {
        console.error('広告費取り込みエラー:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
