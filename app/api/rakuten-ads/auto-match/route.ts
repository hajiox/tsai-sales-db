// /app/api/rakuten-ads/auto-match/route.ts
// 楽天RPP広告 商品名ベース → シリーズ AI自動マッチング
// rakuten_product_names テーブルの商品名をもとに Gemini でシリーズを推測
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
            return NextResponse.json({ success: true, message: '未紐付けのデータがありません', matched: 0, total: 0 })
        }

        // 商品名マッピングを取得
        const { data: productNames } = await supabase
            .from('rakuten_product_names')
            .select('product_code, product_name')

        const nameMap = new Map<string, string>()
        productNames?.forEach((p: any) => nameMap.set(p.product_code, p.product_name))

        // シリーズ一覧を取得
        const { data: products, error: pErr } = await supabase
            .from('products')
            .select('series_code, series')
            .not('series_code', 'is', null)

        if (pErr) throw pErr

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

        // Gemini で商品名からシリーズを推測
        const geminiApiKey = process.env.GEMINI_API_KEY
        if (!geminiApiKey) {
            return NextResponse.json({ success: false, error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 })
        }

        // 商品名付きでリストを作成
        const itemList = rakutenData.map(d => {
            const name = nameMap.get(d.product_code) || '（商品名未登録）'
            return `${d.id}: 商品コード「${d.product_code}」 商品名「${name}」`
        }).join('\n')

        const seriesStr = seriesList.map(s => `${s.code}: ${s.name}`).join('\n')

        const prompt = `楽天市場の商品データを、商品シリーズに紐付けてください。
商品名を最も重要な手がかりとして使ってください。

## 商品シリーズ一覧
${seriesStr}

## 未紐付け商品
${itemList}

## ルール
- 商品名に含まれるキーワードから、最も適切なシリーズを1つ選んでください
- 商品名に「チャーシュー」が含まれていればチャーシュー系シリーズ
- 商品名に「焼きそば」が含まれていれば焼きそば系
- 商品名に「ラーメン」が含まれていればラーメン系
- 商品名が「（商品名未登録）」の場合は、商品コードから推測してください（確信度はlowに）
- 確信が全くない場合は、その商品をスキップしてください（JSON配列に含めない）
- 結果はJSON配列で返してください: [{"id": 商品ID, "series_code": シリーズコード, "confidence": "high"|"medium"|"low"}]
- JSON配列のみ返してください。マークダウンのコードブロックは不要です。`

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.1 },
                }),
            }
        )
        const geminiData = await geminiRes.json()
        const responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || ''

        let matches: { id: number; series_code: number; confidence: string }[] = []
        try {
            const cleanJson = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
            matches = JSON.parse(cleanJson)
        } catch {
            return NextResponse.json({
                success: false,
                error: 'AIの応答をパースできませんでした',
                raw_response: responseText.substring(0, 500),
            }, { status: 500 })
        }

        // DBを更新
        let updated = 0
        const results: { product_code: string; product_name: string; series_name: string; confidence: string }[] = []

        for (const match of matches) {
            if (!match.id || !match.series_code) continue
            const item = rakutenData.find(d => d.id === match.id)
            const seriesName = seriesMap.get(match.series_code)
            if (!item || !seriesName) continue

            const { error: updateError } = await supabase
                .from('rakuten_ads_performance')
                .update({ series_code: match.series_code })
                .eq('id', match.id)

            if (!updateError) {
                updated++
                results.push({
                    product_code: item.product_code,
                    product_name: nameMap.get(item.product_code) || '',
                    series_name: seriesName,
                    confidence: match.confidence || 'unknown',
                })
            }
        }

        return NextResponse.json({
            success: true,
            matched: updated,
            total: rakutenData.length,
            results,
        })
    } catch (error: any) {
        console.error('楽天 AI自動マッチエラー:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
