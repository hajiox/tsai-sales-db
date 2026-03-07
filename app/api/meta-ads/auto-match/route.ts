// /app/api/meta-ads/auto-match/route.ts
// Meta広告セット名 → シリーズをAI(Gemini)で自動マッチング
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

        // 未紐付けのMeta広告セットを取得
        const { data: metaData, error: metaError } = await supabase
            .from('meta_ads_performance')
            .select('id, ad_set_name, campaign_name')
            .eq('report_month', month)
            .is('series_code', null)

        if (metaError) throw metaError
        if (!metaData || metaData.length === 0) {
            return NextResponse.json({ success: true, message: '未紐付けのデータがありません', matched: 0 })
        }

        // シリーズ一覧を取得
        const { data: products, error: prodError } = await supabase
            .from('products')
            .select('series_code, series')
            .not('series_code', 'is', null)

        if (prodError) throw prodError

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

        // Gemini でマッチング
        const adSetNames = metaData.map(d => `${d.id}: 「${d.ad_set_name}」(キャンペーン: ${d.campaign_name || '不明'})`).join('\n')
        const seriesListStr = seriesList.map(s => `${s.code}: ${s.name}`).join('\n')

        const prompt = `あなたは広告運用のエキスパートです。
Meta広告の広告セット名を、商品シリーズに紐付けてください。

## 商品シリーズ一覧
${seriesListStr}

## 未紐付けの広告セット
${adSetNames}

## ルール
- 広告セット名に含まれるキーワードから、最も適切な商品シリーズを1つ選んでください
- 確信度が低い場合でも、最も近いものを選んでください
- 結果はJSON配列で返してください。各要素は {"id": 広告セットID, "series_code": シリーズコード, "confidence": "high"|"medium"|"low"} の形式です
- マッチングのヒント:
  - 「チャーシュー」→ チャーシュー系シリーズ
  - 「訳あり」はチャーシューの訳ありセットの可能性
  - 「焼きそば」→ 焼きそば系
  - 「ブランド館」→ 総合ブランド系
  - 広告セット名に商品名やシリーズ名の一部が含まれている場合はそれに紐付ける

## 出力
JSON配列のみを返してください。マークダウンのコードブロックは不要です。`

        const geminiApiKey = process.env.GEMINI_API_KEY
        if (!geminiApiKey) {
            return NextResponse.json({ success: false, error: 'GEMINI_API_KEY が設定されていません' }, { status: 500 })
        }

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

        // JSONパース
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
        const results: { ad_set_name: string; series_name: string; confidence: string }[] = []

        for (const match of matches) {
            if (!match.id || !match.series_code) continue

            const adSet = metaData.find(d => d.id === match.id)
            const seriesName = seriesMap.get(match.series_code)
            if (!adSet || !seriesName) continue

            const { error: updateError } = await supabase
                .from('meta_ads_performance')
                .update({ series_code: match.series_code })
                .eq('id', match.id)

            if (!updateError) {
                updated++
                results.push({
                    ad_set_name: adSet.ad_set_name,
                    series_name: seriesName,
                    confidence: match.confidence || 'unknown',
                })
            }
        }

        return NextResponse.json({
            success: true,
            matched: updated,
            total: metaData.length,
            results,
        })
    } catch (error: any) {
        console.error('Meta AI自動マッチエラー:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
