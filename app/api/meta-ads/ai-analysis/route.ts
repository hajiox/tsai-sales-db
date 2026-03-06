// /app/api/meta-ads/ai-analysis/route.ts
// Meta広告パフォーマンスデータをGemini 2.5 Flashで分析
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set") })(),
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set") })()
)

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
    try {
        const { month, adSetName } = await request.json()
        const targetMonth = month || new Date().toISOString().slice(0, 7)

        const geminiKey = process.env.GEMINI_API_KEY
        if (!geminiKey) {
            return NextResponse.json({ success: false, error: "GEMINI_API_KEY is not set" }, { status: 500 })
        }

        // 前月計算
        const [year, monthNum] = targetMonth.split('-').map(Number)
        const prevDate = new Date(year, monthNum - 2, 1)
        const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

        // データ取得
        let currentQuery = supabase
            .from('meta_ads_performance')
            .select('*')
            .eq('report_month', targetMonth)

        let prevQuery = supabase
            .from('meta_ads_performance')
            .select('*')
            .eq('report_month', prevMonth)

        if (adSetName) {
            currentQuery = currentQuery.eq('ad_set_name', adSetName)
            prevQuery = prevQuery.eq('ad_set_name', adSetName)
        }

        const [{ data: currentData }, { data: prevData }] = await Promise.all([
            currentQuery, prevQuery
        ])

        // シリーズマスター
        const { data: products } = await supabase
            .from('products').select('series_code, series').not('series_code', 'is', null)
        const seriesMap = new Map<number, string>()
        products?.forEach((p: any) => { if (!seriesMap.has(p.series_code)) seriesMap.set(p.series_code, p.series) })

        // 集計
        const sumMetrics = (rows: any[]) => {
            const r = { cost: 0, impressions: 0, reach: 0, clicks: 0, link_clicks: 0, results: 0, frequency: 0, cpm: 0 }
            rows?.forEach(d => {
                r.cost += Number(d.amount_spent || 0)
                r.impressions += Number(d.impressions || 0)
                r.reach += Number(d.reach || 0)
                r.clicks += Number(d.clicks || 0)
                r.link_clicks += Number(d.link_clicks || 0)
                r.results += Number(d.results || 0)
            })
            r.frequency = r.reach > 0 ? parseFloat((r.impressions / r.reach).toFixed(2)) : 0
            r.cpm = r.impressions > 0 ? Math.round(r.cost / r.impressions * 1000) : 0
            return r
        }

        const curr = sumMetrics(currentData || [])
        const prev = sumMetrics(prevData || [])

        const calcMetrics = (d: typeof curr) => ({
            cost: Math.round(d.cost),
            impressions: d.impressions,
            reach: d.reach,
            clicks: d.clicks,
            link_clicks: d.link_clicks,
            results: parseFloat(d.results.toFixed(1)),
            ctr: d.impressions > 0 ? parseFloat((d.clicks / d.impressions * 100).toFixed(2)) : 0,
            cpc: d.clicks > 0 ? Math.round(d.cost / d.clicks) : 0,
            cpm: d.cpm,
            frequency: d.frequency,
            cvr: d.clicks > 0 ? parseFloat((d.results / d.clicks * 100).toFixed(2)) : 0,
            cost_per_result: d.results > 0 ? Math.round(d.cost / d.results) : 0,
        })

        const currM = calcMetrics(curr)
        const prevM = calcMetrics(prev)

        const pctChange = (c: number, p: number) => p > 0 ? parseFloat(((c - p) / p * 100).toFixed(1)) : null

        // 広告セット別内訳
        const adSetBreakdown = (currentData || []).map(d => ({
            ad_set: d.ad_set_name,
            campaign: d.campaign_name,
            series: d.series_code ? seriesMap.get(d.series_code) || '不明' : '未紐付け',
            cost: Math.round(d.amount_spent),
            impressions: d.impressions,
            clicks: d.clicks,
            results: d.results,
            ctr: d.impressions > 0 ? parseFloat((d.clicks / d.impressions * 100).toFixed(2)) : 0,
        }))

        const analysisTarget = adSetName ? `広告セット「${adSetName}」` : 'Meta広告全体'

        // Geminiプロンプト
        const prompt = `あなたはMeta広告（Facebook/Instagram広告）のパフォーマンス最適化コンサルタントです。
以下のデータを元に、${analysisTarget}の詳細な分析レポートを作成してください。

【対象月】${targetMonth}

【パフォーマンスサマリー — 2ヶ月推移】
${prevMonth}（前月）:
  消化金額: ¥${prevM.cost.toLocaleString()}, インプレ: ${prevM.impressions.toLocaleString()}, リーチ: ${prevM.reach.toLocaleString()}, クリック: ${prevM.clicks}, CTR: ${prevM.ctr}%, CPC: ¥${prevM.cpc}, 結果: ${prevM.results}, 結果単価: ¥${prevM.cost_per_result}, フリークエンシー: ${prevM.frequency}

${targetMonth}（対象月）:
  消化金額: ¥${currM.cost.toLocaleString()}, インプレ: ${currM.impressions.toLocaleString()}, リーチ: ${currM.reach.toLocaleString()}, クリック: ${currM.clicks}, CTR: ${currM.ctr}%, CPC: ¥${currM.cpc}, CPM: ¥${currM.cpm}, 結果: ${currM.results}, 結果単価: ¥${currM.cost_per_result}, フリークエンシー: ${currM.frequency}

【前月比変化率】
  消化金額: ${pctChange(currM.cost, prevM.cost) ?? '—'}%
  クリック: ${pctChange(currM.clicks, prevM.clicks) ?? '—'}%
  結果: ${pctChange(currM.results, prevM.results) ?? '—'}%
  CTR: ${pctChange(currM.ctr, prevM.ctr) ?? '—'}%
  CPC: ${pctChange(currM.cpc, prevM.cpc) ?? '—'}%

【広告セット別内訳】
${adSetBreakdown.map(a => `・${a.ad_set}（${a.campaign}）: ¥${a.cost.toLocaleString()}, ${a.impressions.toLocaleString()}インプレ, ${a.clicks}クリック, ${a.results}結果, CTR ${a.ctr}%, シリーズ: ${a.series}`).join('\n')}

【Meta広告最適化の分析フレームワーク】
以下の観点で分析してください：

1. オーディエンス分析:
   - 類似オーディエンスの活用状況
   - リターゲティング戦略
   - フリークエンシー ${currM.frequency} の適切性（3.0以上は要注意）

2. クリエイティブ効果:
   - 各広告セットのCTR比較
   - コスト効率の高い/低い広告セットの特定
   - クリエイティブの改善提案

3. 予算配分:
   - 広告セット間の予算配分の適切性
   - 効率の良いセットへの予算集中提案
   - 全体予算の増減提案

【出力要件】
以下のセクションをMarkdownで出力してください。具体的な数値を引用し、経営者が読んでアクションを取れる内容にしてください。

## 📊 パフォーマンス診断
全体の健全性と前月比トレンドを評価。

## 📈 広告セット別分析
各広告セットのパフォーマンスを比較分析。

## 🎯 オーディエンス & クリエイティブ提案
ターゲティングとクリエイティブの改善ポイント。

## 💡 具体的アクションプラン
今すぐ実行すべきこと、1週間以内、1ヶ月以内の3段階で提案。`

        // Gemini 2.5 Flash API
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.7, maxOutputTokens: 4000 },
                }),
            }
        )

        if (!response.ok) {
            const errorData = await response.json()
            console.error('Gemini API エラー:', errorData)
            throw new Error(`Gemini API エラー: ${response.status}`)
        }

        const data = await response.json()
        const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text

        if (!analysis) throw new Error('分析テキストの生成に失敗しました')

        return NextResponse.json({
            success: true,
            analysis,
            month: targetMonth,
            target: adSetName || 'all',
            metrics: currM,
        })
    } catch (error: any) {
        console.error('Meta AI広告分析エラー:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
