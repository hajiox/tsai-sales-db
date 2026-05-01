// /app/api/amazon-ads/delete-data/route.ts
// Amazon広告パフォーマンスデータ削除API
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set") })(),
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set") })()
)

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
    try {
        const { month } = await request.json()
        if (!month) {
            return NextResponse.json({ success: false, error: 'monthは必須です' }, { status: 400 })
        }

        const { data: deleted, error } = await supabase
            .from('amazon_ads_performance')
            .delete()
            .eq('report_month', month)
            .select('id')

        if (error) throw error

        // advertising_costsのamazon_costもリセット
        const reportMonth = `${month}-01`
        await supabase
            .from('advertising_costs')
            .update({ amazon_cost: 0 })
            .eq('report_month', reportMonth)

        return NextResponse.json({
            success: true,
            deleted: deleted?.length || 0,
        })
    } catch (error: any) {
        console.error('Amazonデータ削除エラー:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
