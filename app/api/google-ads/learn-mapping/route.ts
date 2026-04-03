// /app/api/google-ads/learn-mapping/route.ts
// アセットグループ → シリーズのマッピング学習API（RLSバイパス）
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
    try {
        const { asset_group_name, series_code } = await request.json()

        if (!asset_group_name || series_code === null || series_code === undefined) {
            return NextResponse.json({ success: false, error: 'asset_group_name と series_code は必須です' }, { status: 400 })
        }

        // 1. マッピングテーブルにupsert
        const { error: mappingError } = await supabase
            .from('google_ads_series_mapping')
            .upsert(
                { asset_group_name, series_code },
                { onConflict: 'asset_group_name' }
            )

        if (mappingError) {
            console.error('Mapping upsert error:', mappingError)
            return NextResponse.json({ success: false, error: mappingError.message }, { status: 500 })
        }

        // 2. パフォーマンステーブルも更新
        const { error: perfError } = await supabase
            .from('google_ads_performance')
            .update({ series_code })
            .eq('asset_group_name', asset_group_name)

        if (perfError) {
            console.error('Performance update error:', perfError)
            // マッピングは成功しているのでwarning扱い
        }

        return NextResponse.json({ success: true, asset_group_name, series_code })
    } catch (error: any) {
        console.error('Learn mapping error:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
