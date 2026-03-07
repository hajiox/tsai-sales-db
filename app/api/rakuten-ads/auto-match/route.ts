// /app/api/rakuten-ads/auto-match/route.ts
// 楽天RPP広告 商品コード → シリーズ AI自動マッチング
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

        // 未紐付けの楽天広告データを取得
        const { data: rakutenData, error: rErr } = await supabase
            .from('rakuten_ads_performance')
            .select('id, product_code, product_url')
            .eq('report_month', month)
            .is('series_code', null)

        if (rErr) throw rErr
        if (!rakutenData || rakutenData.length === 0) {
            return NextResponse.json({ success: true, message: '未紐付けのデータがありません', matched: 0 })
        }

        // シリーズ一覧を取得（product_code, name で直接マッチングを試みる）
        const { data: products, error: pErr } = await supabase
            .from('products')
            .select('id, name, series_code, series, product_code')
            .not('series_code', 'is', null)

        if (pErr) throw pErr

        // 商品コードで直接マッチングを試みる
        let directMatched = 0
        const results: { product_code: string; series_name: string; confidence: string }[] = []
        const unmatched: typeof rakutenData = []

        for (const item of rakutenData) {
            // 楽天の商品コード（例: "chashu-set-3p"）と products.product_code の一致を試行
            const product = products?.find(p => {
                if (!p.product_code || !item.product_code) return false
                const rc = String(item.product_code).toLowerCase()
                const pc = String(p.product_code).toLowerCase()
                return rc === pc || rc.startsWith(pc) || pc.startsWith(rc)
            })
            if (product) {
                await supabase.from('rakuten_ads_performance')
                    .update({ series_code: product.series_code })
                    .eq('id', item.id)
                directMatched++
                results.push({ product_code: item.product_code, series_name: product.series || product.name, confidence: 'high' })
            } else {
                unmatched.push(item)
            }
        }

        // 直接マッチングできなかったものはGeminiで推測
        if (unmatched.length > 0) {
            const geminiApiKey = process.env.GEMINI_API_KEY
            if (geminiApiKey) {
                const seriesMap = new Map<number, string>()
                const seriesList: { code: number; name: string }[] = []
                const seen = new Set<number>()
                products?.forEach((p: any) => {
                    if (p.series_code && !seen.has(p.series_code)) {
                        seen.add(p.series_code)
                        seriesMap.set(p.series_code, p.series)
                        seriesList.push({ code: p.series_code, name: p.series })
                    }
                })

                const itemList = unmatched.map(d => `${d.id}: 商品コード「${d.product_code}」 URL: ${d.product_url || '不明'}`).join('\n')
                const seriesStr = seriesList.map(s => `${s.code}: ${s.name}`).join('\n')

                const prompt = `楽天市場の商品コードとURLから、最も適切な商品シリーズを推測してください。

## シリーズ一覧
${seriesStr}

## 未紐付け商品
${itemList}

商品コードやURLに含まれる商品名のヒントからシリーズを推測してください。
JSON配列で返してください: [{"id": 商品ID, "series_code": シリーズコード, "confidence": "high"|"medium"|"low"}]
JSON配列のみ返してください。`

                const geminiRes = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1 } }),
                    }
                )
                const geminiData = await geminiRes.json()
                const responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || ''

                try {
                    const matches = JSON.parse(responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())
                    for (const match of matches) {
                        if (!match.id || !match.series_code) continue
                        const item = unmatched.find(d => d.id === match.id)
                        const seriesName = seriesMap.get(match.series_code)
                        if (!item || !seriesName) continue
                        await supabase.from('rakuten_ads_performance').update({ series_code: match.series_code }).eq('id', match.id)
                        results.push({ product_code: item.product_code, series_name: seriesName, confidence: match.confidence || 'low' })
                    }
                } catch { /* AI応答パース失敗 */ }
            }
        }

        return NextResponse.json({
            success: true,
            matched: results.length,
            total: rakutenData.length,
            direct_matched: directMatched,
            results,
        })
    } catch (error: any) {
        console.error('楽天 AI自動マッチエラー:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
