// /app/api/amazon-ads/ai-analysis/route.ts
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

        const { data, error } = await supabase
            .from('amazon_ads_performance')
            .select('*')
            .eq('report_month', month)
            .order('cost', { ascending: false })

        if (error) throw error
        if (!data || data.length === 0) {
            return NextResponse.json({ success: false, error: 'データがありません' }, { status: 404 })
        }

        const { data: products } = await supabase
            .from('products').select('series_code, series').not('series_code', 'is', null)
        const seriesMap = new Map<number, string>()
        products?.forEach((p: any) => { if (!seriesMap.has(p.series_code)) seriesMap.set(p.series_code, p.series) })

        const totalCost = data.reduce((s, d) => s + d.cost, 0)
        const totalClicks = data.reduce((s, d) => s + d.clicks, 0)
        const totalImpressions = data.reduce((s, d) => s + d.impressions, 0)
        const totalSales = data.reduce((s, d) => s + d.sales, 0)
        const totalOrders = data.reduce((s, d) => s + d.orders, 0)

        const top10 = data.slice(0, 10).map(d => {
            const sName = d.series_code ? (seriesMap.get(d.series_code) || '') : ''
            return `ASIN:${d.asin} キャンペーン:${d.campaign_name}${sName ? ' (シリーズ:' + sName + ')' : ''}: 広告費¥${Math.round(d.cost)} / クリック${d.clicks} / CPC¥${Math.round(d.cpc)} / 売上¥${Math.round(d.sales)} / ACOS${(d.acos * 100).toFixed(1)}%`
        }).join('\n')

        const prompt = `Amazon スポンサープロダクト広告のパフォーマンスを分析してください。

## ${month} Amazon SP広告 サマリー
- 総広告費: ¥${Math.round(totalCost).toLocaleString()}
- 総表示回数: ${totalImpressions.toLocaleString()}
- 総クリック: ${totalClicks.toLocaleString()}
- 平均CPC: ¥${totalClicks > 0 ? Math.round(totalCost / totalClicks) : 0}
- 総売上: ¥${Math.round(totalSales).toLocaleString()}
- 総注文数: ${totalOrders}
- ROAS: ${totalCost > 0 ? (totalSales / totalCost).toFixed(2) : 0}
- ACOS: ${totalSales > 0 ? ((totalCost / totalSales) * 100).toFixed(1) : 0}%
- 商品数: ${data.length}

## 広告費TOP10
${top10}

以下の観点で分析:
1. 全体パフォーマンス評価
2. 高効率・低効率商品の特定
3. 入札戦略の最適化提案
4. 広告費配分の改善案

日本語で簡潔に回答。`

        const geminiApiKey = process.env.GEMINI_API_KEY
        if (!geminiApiKey) return NextResponse.json({ success: false, error: 'GEMINI_API_KEY未設定' }, { status: 500 })

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
            }
        )
        const geminiData = await geminiRes.json()
        const analysis = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '分析結果を取得できませんでした'
        return NextResponse.json({ success: true, analysis })
    } catch (error: any) {
        console.error('Amazon AI分析エラー:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
