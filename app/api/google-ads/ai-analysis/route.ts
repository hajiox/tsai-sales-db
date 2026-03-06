// /app/api/google-ads/ai-analysis/route.ts
// 広告パフォーマンスデータをGemini 2.5 Flashで分析
// google-ads-strategy Skillのフレームワークを組み込み
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set") })(),
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set") })()
)

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
    try {
        const { month, assetGroupName } = await request.json()
        const targetMonth = month || new Date().toISOString().slice(0, 7)

        const geminiKey = process.env.GEMINI_API_KEY
        if (!geminiKey) {
            return NextResponse.json({ success: false, error: "GEMINI_API_KEY is not set" }, { status: 500 })
        }

        // ===== データ収集 =====
        const [year, monthNum] = targetMonth.split('-').map(Number)
        const startDate = `${targetMonth}-01`
        const lastDay = new Date(year, monthNum, 0).getDate()
        const endDate = `${targetMonth}-${String(lastDay).padStart(2, '0')}`

        // 前月
        const prevDate = new Date(year, monthNum - 2, 1)
        const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
        const prevStartDate = `${prevMonth}-01`
        const prevLastDay = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).getDate()
        const prevEndDate = `${prevMonth}-${String(prevLastDay).padStart(2, '0')}`

        // 前々月
        const prevPrevDate = new Date(year, monthNum - 3, 1)
        const prevPrevMonth = `${prevPrevDate.getFullYear()}-${String(prevPrevDate.getMonth() + 1).padStart(2, '0')}`
        const prevPrevStartDate = `${prevPrevMonth}-01`
        const prevPrevLastDay = new Date(prevPrevDate.getFullYear(), prevPrevDate.getMonth() + 1, 0).getDate()
        const prevPrevEndDate = `${prevPrevMonth}-${String(prevPrevLastDay).padStart(2, '0')}`

        // クエリの条件構築 — 個別分析 vs 全体分析
        let currentQuery = supabase
            .from('google_ads_performance')
            .select('campaign_name, asset_group_name, series_code, cost_micros, impressions, clicks, conversions, conversions_value, report_date')
            .gte('report_date', startDate).lte('report_date', endDate)

        let prevQuery = supabase
            .from('google_ads_performance')
            .select('campaign_name, asset_group_name, series_code, cost_micros, impressions, clicks, conversions, conversions_value, report_date')
            .gte('report_date', prevStartDate).lte('report_date', prevEndDate)

        let prevPrevQuery = supabase
            .from('google_ads_performance')
            .select('cost_micros, impressions, clicks, conversions, conversions_value, report_date')
            .gte('report_date', prevPrevStartDate).lte('report_date', prevPrevEndDate)

        if (assetGroupName) {
            currentQuery = currentQuery.eq('asset_group_name', assetGroupName)
            prevQuery = prevQuery.eq('asset_group_name', assetGroupName)
            prevPrevQuery = prevPrevQuery.eq('asset_group_name', assetGroupName)
        }

        const [{ data: currentData }, { data: prevData }, { data: prevPrevData }] = await Promise.all([
            currentQuery, prevQuery, prevPrevQuery
        ])

        // シリーズマスター
        const { data: products } = await supabase
            .from('products').select('series_code, series').not('series_code', 'is', null)
        const seriesMap = new Map<number, string>()
        products?.forEach((p: any) => { if (!seriesMap.has(p.series_code)) seriesMap.set(p.series_code, p.series) })

        // ===== 集計関数 =====
        const sumMetrics = (rows: any[]) => {
            const r = { cost: 0, impressions: 0, clicks: 0, conversions: 0, cv_value: 0 }
            rows?.forEach(d => {
                r.cost += Number(d.cost_micros || 0) / 1000000
                r.impressions += Number(d.impressions || 0)
                r.clicks += Number(d.clicks || 0)
                r.conversions += Number(d.conversions || 0)
                r.cv_value += Number(d.conversions_value || 0)
            })
            return r
        }

        const curr = sumMetrics(currentData || [])
        const prev = sumMetrics(prevData || [])
        const prevPrev = sumMetrics(prevPrevData || [])

        // 日別推移（対象月）
        const dailyMap = new Map<string, { cost: number, clicks: number, conversions: number, impressions: number }>()
        currentData?.forEach((d: any) => {
            const date = d.report_date
            const existing = dailyMap.get(date) || { cost: 0, clicks: 0, conversions: 0, impressions: 0 }
            existing.cost += Number(d.cost_micros || 0) / 1000000
            existing.clicks += Number(d.clicks || 0)
            existing.conversions += Number(d.conversions || 0)
            existing.impressions += Number(d.impressions || 0)
            dailyMap.set(date, existing)
        })
        const dailyTrend = Array.from(dailyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, data]) => ({ date, ...data }))

        // 指標計算ヘルパー
        const calcMetrics = (d: { cost: number, impressions: number, clicks: number, conversions: number, cv_value: number }) => ({
            cost: Math.round(d.cost),
            impressions: d.impressions,
            clicks: d.clicks,
            conversions: parseFloat(d.conversions.toFixed(1)),
            ctr: d.impressions > 0 ? parseFloat((d.clicks / d.impressions * 100).toFixed(2)) : 0,
            cpc: d.clicks > 0 ? Math.round(d.cost / d.clicks) : 0,
            cvr: d.clicks > 0 ? parseFloat((d.conversions / d.clicks * 100).toFixed(2)) : 0,
            roas: d.cost > 0 ? parseFloat((d.cv_value / d.cost * 100).toFixed(0)) : 0,
            cv_value: Math.round(d.cv_value),
        })

        const currM = calcMetrics(curr)
        const prevM = calcMetrics(prev)
        const prevPrevM = calcMetrics(prevPrev)

        // 変化率計算
        const pctChange = (c: number, p: number) => p > 0 ? parseFloat(((c - p) / p * 100).toFixed(1)) : null

        // 個別分析時：アセットグループ情報
        const analysisTarget = assetGroupName ? `アセットグループ「${assetGroupName}」` : 'Google広告全体（P-MAX）'
        const seriesInfo = assetGroupName && currentData?.[0]?.series_code
            ? `紐付けシリーズ: ${seriesMap.get(currentData[0].series_code) || '不明'}`
            : ''

        // ===== プロンプト生成 =====
        // google-ads-strategy Skillのフレームワークを組み込み
        const prompt = `あなたはGoogle広告（P-MAX）のパフォーマンス最適化コンサルタントです。
以下のデータを元に、${analysisTarget}の詳細な分析レポートを作成してください。
${seriesInfo}

【対象月】${targetMonth}

【パフォーマンスサマリー — 3ヶ月推移】
${prevPrevMonth}（2ヶ月前）:
  広告費: ¥${prevPrevM.cost.toLocaleString()}, クリック: ${prevPrevM.clicks}, CTR: ${prevPrevM.ctr}%, CPC: ¥${prevPrevM.cpc}, CV: ${prevPrevM.conversions}, CVR: ${prevPrevM.cvr}%, ROAS: ${prevPrevM.roas}%

${prevMonth}（前月）:
  広告費: ¥${prevM.cost.toLocaleString()}, クリック: ${prevM.clicks}, CTR: ${prevM.ctr}%, CPC: ¥${prevM.cpc}, CV: ${prevM.conversions}, CVR: ${prevM.cvr}%, ROAS: ${prevM.roas}%

${targetMonth}（対象月）:
  広告費: ¥${currM.cost.toLocaleString()}, 表示: ${currM.impressions.toLocaleString()}, クリック: ${currM.clicks}, CTR: ${currM.ctr}%, CPC: ¥${currM.cpc}, CV: ${currM.conversions}, CVR: ${currM.cvr}%, ROAS: ${currM.roas}%, CV値: ¥${currM.cv_value.toLocaleString()}

【前月比変化率】
  広告費: ${pctChange(currM.cost, prevM.cost) ?? '—'}%
  クリック: ${pctChange(currM.clicks, prevM.clicks) ?? '—'}%
  CV: ${pctChange(currM.conversions, prevM.conversions) ?? '—'}%
  CTR: ${pctChange(currM.ctr, prevM.ctr) ?? '—'}%
  CPC: ${pctChange(currM.cpc, prevM.cpc) ?? '—'}%
  CVR: ${pctChange(currM.cvr, prevM.cvr) ?? '—'}%

【日別推移データ（対象月）】
${dailyTrend.slice(0, 15).map(d => `${d.date}: 費用¥${Math.round(d.cost)}, ${d.clicks}クリック, ${d.conversions.toFixed(1)}CV`).join('\n')}
${dailyTrend.length > 15 ? `... 他${dailyTrend.length - 15}日分` : ''}

【P-MAX最適化の分析フレームワーク】
以下の観点で分析してください：

1. アセットグループ構造: 
   - シグナル（オーディエンスシグナル）の適切性
   - アセット（見出し・説明文・画像・動画）の充実度
   - 予算配分の偏り

2. 入札戦略評価:
   - 現在のROAS ${currM.roas}%に対する入札目標の適切性
   - CV数が自動入札の学習に十分か（月間50CV以上が望ましい）
   - 予算制限による機会損失の可能性

3. 効率性分析:
   - CPC ¥${currM.cpc} は業種（食品EC）として適切か
   - CVR ${currM.cvr}% は高すぎ/低すぎないか
   - ROAS ${currM.roas}% の改善余地

【出力要件】
以下のセクションをMarkdownで出力してください。具体的な数値を引用し、経営者が読んでアクションを取れる内容にしてください。

## 📊 パフォーマンス診断
3ヶ月の推移から見えるトレンドと${assetGroupName ? 'この広告グループ' : '全体'}の健全性を評価。

## 📈 3ヶ月トレンド分析
費用・クリック・CV・CVR の動きから予測される今後のパフォーマンスを分析。日別データから異常パターンや曜日特性があれば指摘。

## 🎯 入札・予算の最適化提案
P-MAXの入札戦略（tROAS/tCPA）、予算配分について具体的な数値付きで提案。

## 💡 具体的アクションプラン
今すぐ実行すべきこと、1週間以内、1ヶ月以内の3段階で具体的なアクションを提案。`

        // Gemini 2.5 Flash API呼び出し
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
            target: assetGroupName || 'all',
            metrics: currM,
        })
    } catch (error: any) {
        console.error('AI広告分析エラー:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
