// /app/api/rakuten-ads/clear-mappings/route.ts
// 楽天RPP広告の紐付け（series_code）を全クリア
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
        if (!month) return NextResponse.json({ success: false, error: 'monthは必須です' }, { status: 400 })

        const { data, error } = await supabase
            .from('rakuten_ads_performance')
            .update({ series_code: null })
            .eq('report_month', month)
            .select('id')

        if (error) throw error

        return NextResponse.json({ success: true, cleared: data?.length || 0 })
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
