// /app/api/rakuten-ads/ai-analysis/route.ts
// 楽天RPP広告 AI分析
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
            .from('rakuten_ads_performance')
            .select('*')
            .eq('report_month', month)
            .order('amount_spent', { ascending: false })

        if (error) throw error
        if (!data || data.length === 0) {
            return NextResponse.json({ success: false, error: 'データがありません' }, { status: 404 })
        }

        // 商品名マップを取得
        const { data: productNames } = await supabase
            .from('rakuten_product_names')
            .select('product_code, product_name')

        const nameMap = new Map<string, string>()
        productNames?.forEach((p: any) => nameMap.set(p.product_code, p.product_name))

        // シリーズマップも取得
        const { data: products } = await supabase
            .from('products').select('series_code, series').not('series_code', 'is', null)
        const seriesMap = new Map<number, string>()
        products?.forEach((p: any) => { if (!seriesMap.has(p.series_code)) seriesMap.set(p.series_code, p.series) })

        const totalSpent = data.reduce((s, d) => s + d.amount_spent, 0)
        const totalClicks = data.reduce((s, d) => s + d.clicks, 0)
        const totalSales = data.reduce((s, d) => s + d.sales_amount, 0)
        const totalOrders = data.reduce((s, d) => s + d.sales_count, 0)

        const top10 = data.slice(0, 10).map(d => {
            const pName = nameMap.get(d.product_code) || d.product_code
            const sName = d.series_code ? (seriesMap.get(d.series_code) || '') : ''
            return `${pName}${sName ? '(シリーズ:' + sName + ')' : ''}: 広告費¥${d.amount_spent} / クリック${d.clicks} / CPC¥${d.cpc_actual} / 売上¥${d.sales_amount} / ROAS${d.roas}%`
        }).join('\n')

        const prompt = `楽天RPP広告のパフォーマンスを分析してください。

## ${month} 楽天RPP広告 サマリー
- 総広告費: ¥${totalSpent.toLocaleString()}
- 総クリック: ${totalClicks.toLocaleString()}
- 平均CPC: ¥${totalClicks > 0 ? Math.round(totalSpent / totalClicks) : 0}
- 総売上（720h）: ¥${totalSales.toLocaleString()}
- 総注文数（720h）: ${totalOrders}
- ROAS: ${totalSpent > 0 ? ((totalSales / totalSpent) * 100).toFixed(1) : 0}%
- 商品数: ${data.length}

## 広告費TOP10
${top10}

以下の観点で分析してください:
1. 全体パフォーマンス評価（ROAS基準）
2. 高効率商品と低効率商品の特定
3. 入札単価の最適化提案
4. 広告費配分の改善案
5. 新規顧客 vs 既存顧客の傾向

日本語で簡潔に回答してください。`

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
        console.error('楽天AI分析エラー:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
