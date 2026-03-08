// /app/api/amazon-ads/auto-match/route.ts
// Amazon広告 AI自動紐付け（学習優先 + Gemini）
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

        // 学習済みマッピングを取得
        const { data: learnedMap } = await supabase
            .from('amazon_code_series_map')
            .select('asin, series_code')
        const learned = new Map<string, number>()
        learnedMap?.forEach((m: any) => learned.set(m.asin, m.series_code))

        const { data, error } = await supabase
            .from('amazon_ads_performance')
            .select('*')
            .eq('report_month', month)
            .is('series_code', null)

        if (error) throw error
        if (!data || data.length === 0) {
            return NextResponse.json({ success: true, matched: 0, message: '未紐付けのデータはありません' })
        }

        // シリーズマスタ取得
        const { data: products } = await supabase
            .from('products').select('series_code, series').not('series_code', 'is', null)
        const seriesMap: Record<number, string> = {}
        const seriesNames: string[] = []
        products?.forEach((p: any) => {
            if (!seriesMap[p.series_code]) {
                seriesMap[p.series_code] = p.series
                seriesNames.push(`${p.series_code}:${p.series}`)
            }
        })

        let autoApplied = 0
        let aiMatched = 0
        const needsAI: any[] = []

        for (const item of data) {
            if (learned.has(item.asin)) {
                const sc = learned.get(item.asin)!
                await supabase.from('amazon_ads_performance')
                    .update({ series_code: sc }).eq('id', item.id)
                autoApplied++
            } else {
                needsAI.push(item)
            }
        }

        if (needsAI.length > 0) {
            const geminiApiKey = process.env.GEMINI_API_KEY
            if (!geminiApiKey) {
                return NextResponse.json({
                    success: true, matched: autoApplied, auto_applied: autoApplied, ai_matched: 0,
                    message: `学習済み${autoApplied}件適用。GEMINI_API_KEY未設定のためAI分析スキップ`
                })
            }

            const itemList = needsAI.map(i =>
                `ASIN:${i.asin} SKU:${i.sku} campaign:${i.campaign_name}`
            ).join('\n')

            const prompt = `以下のAmazon商品を、最も適切なシリーズに分類してください。
キャンペーン名から商品カテゴリを推測してください。

シリーズ一覧:
${seriesNames.join('\n')}

商品一覧:
${itemList}

各商品について「ASIN:シリーズコード」の形式で回答。例: B08RXS3ZDL:9
不明な場合は省略。`

            const geminiRes = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
                }
            )
            const geminiData = await geminiRes.json()
            const responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || ''

            const matches = responseText.matchAll(/([A-Z0-9]{10}):(\d+)/g)
            const aiResults = new Map<string, number>()
            for (const m of matches) {
                const asin = m[1].trim()
                const sc = parseInt(m[2])
                if (seriesMap[sc]) aiResults.set(asin, sc)
            }

            for (const item of needsAI) {
                const sc = aiResults.get(item.asin)
                if (sc) {
                    await supabase.from('amazon_ads_performance')
                        .update({ series_code: sc }).eq('id', item.id)
                    await supabase.from('amazon_code_series_map').upsert({
                        asin: item.asin,
                        series_code: sc,
                        source: 'ai',
                        updated_at: new Date().toISOString(),
                    }, { onConflict: 'asin' })
                    aiMatched++
                }
            }
        }

        return NextResponse.json({
            success: true,
            matched: autoApplied + aiMatched,
            auto_applied: autoApplied,
            ai_matched: aiMatched,
        })
    } catch (error: any) {
        console.error('Amazon AI自動紐付けエラー:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
