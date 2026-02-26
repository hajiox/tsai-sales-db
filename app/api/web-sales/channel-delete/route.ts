// /app/api/web-sales/channel-delete/route.ts
// ECチャネル別データ削除API（RLSバイパス対応）
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })(),
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })()
)

export async function POST(request: NextRequest) {
    try {
        const { channel, month } = await request.json()

        if (!channel || !month) {
            return NextResponse.json(
                { error: 'チャネルと対象月が必要です' },
                { status: 400 }
            )
        }

        const validChannels = ['csv', 'amazon', 'rakuten', 'yahoo', 'mercari', 'base', 'qoo10', 'tiktok']
        if (!validChannels.includes(channel)) {
            return NextResponse.json(
                { error: '無効なチャネルです' },
                { status: 400 }
            )
        }

        const columnName = channel === 'csv' ? 'csv_count' : `${channel}_count`
        const reportMonth = `${month}-01`

        // サービスロールキーでRLSをバイパスして更新
        const { data, error, count } = await supabase
            .from('web_sales_summary')
            .update({ [columnName]: 0 })
            .eq('report_month', reportMonth)
            .gt(columnName, 0)
            .select('id')

        if (error) {
            console.error('チャネル削除エラー:', error)
            return NextResponse.json(
                { error: 'データの削除に失敗しました', details: error.message },
                { status: 500 }
            )
        }

        const updatedCount = data?.length || 0
        console.log(`${channel}チャネル削除: ${reportMonth} - ${updatedCount}件を0に更新`)

        return NextResponse.json({
            success: true,
            message: `${updatedCount}件のデータを削除しました`,
            updatedCount,
        })

    } catch (error: any) {
        console.error('API Error:', error)
        return NextResponse.json(
            { error: 'サーバーエラーが発生しました', details: error.message },
            { status: 500 }
        )
    }
}
