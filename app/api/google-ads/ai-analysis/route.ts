// /app/api/google-ads/ai-analysis/route.ts
// 広告パフォーマンスデータをGemini 2.0 Flashで分析
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI } from "@google/generative-ai"

const GEMINI_MODEL = "gemini-2.0-flash"

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set") })(),
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set") })()
)

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
    try {
        const { month } = await request.json()
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

        // 1. 対象月のGoogle広告データ（アセットグループ別）
        const { data: currentData } = await supabase
            .from('google_ads_performance')
            .select('asset_group_name, series_code, cost_micros, impressions, clicks, conversions, conversions_value')
            .gte('report_date', startDate)
            .lte('report_date', endDate)

        // 2. 前月のGoogle広告データ
        const { data: prevData } = await supabase
            .from('google_ads_performance')
            .select('asset_group_name, series_code, cost_micros, impressions, clicks, conversions, conversions_value')
            .gte('report_date', prevStartDate)
            .lte('report_date', prevEndDate)

        // 3. シリーズマスター
        const { data: products } = await supabase
            .from('products')
            .select('series_code, series')
            .not('series_code', 'is', null)

        const seriesMap = new Map<number, string>()
        products?.forEach((p: any) => {
            if (!seriesMap.has(p.series_code)) seriesMap.set(p.series_code, p.series)
        })

        // 4. 広告費テーブルから各プラットフォームの費用
        const { data: adCosts } = await supabase
            .from('advertising_costs')
            .select('series_code, google_cost, amazon_cost, rakuten_cost, yahoo_cost, other_cost')
            .eq('report_month', `${targetMonth}-01`)

        // ===== 集計 =====
        const aggregate = (rows: any[]) => {
            const map = new Map<string, { cost: number, impressions: number, clicks: number, conversions: number, cv_value: number }>()
            rows?.forEach(r => {
                const name = r.asset_group_name
                const existing = map.get(name) || { cost: 0, impressions: 0, clicks: 0, conversions: 0, cv_value: 0 }
                existing.cost += Number(r.cost_micros || 0) / 1000000
                existing.impressions += Number(r.impressions || 0)
                existing.clicks += Number(r.clicks || 0)
                existing.conversions += Number(r.conversions || 0)
                existing.cv_value += Number(r.conversions_value || 0)
                map.set(name, existing)
            })
            return map
        }

        const currentAgg = aggregate(currentData || [])
        const prevAgg = aggregate(prevData || [])

        // シリーズ別集計
        const seriesAgg = new Map<number, { cost: number, impressions: number, clicks: number, conversions: number, cv_value: number }>()
        currentData?.forEach((r: any) => {
            const sc = r.series_code || 0
            const existing = seriesAgg.get(sc) || { cost: 0, impressions: 0, clicks: 0, conversions: 0, cv_value: 0 }
            existing.cost += Number(r.cost_micros || 0) / 1000000
            existing.impressions += Number(r.impressions || 0)
            existing.clicks += Number(r.clicks || 0)
            existing.conversions += Number(r.conversions || 0)
            existing.cv_value += Number(r.conversions_value || 0)
            seriesAgg.set(sc, existing)
        })

        // プロンプト用データ構築
        const assetGroupComparison = Array.from(currentAgg.entries()).map(([name, curr]) => {
            const prev = prevAgg.get(name)
            return {
                name,
                current: { cost: Math.round(curr.cost), impressions: curr.impressions, clicks: curr.clicks, conversions: curr.conversions.toFixed(1), ctr: curr.impressions > 0 ? (curr.clicks / curr.impressions * 100).toFixed(2) : '0', cvr: curr.clicks > 0 ? (curr.conversions / curr.clicks * 100).toFixed(2) : '0', roas: curr.cost > 0 ? (curr.cv_value / curr.cost * 100).toFixed(0) : '0' },
                previous: prev ? { cost: Math.round(prev.cost), impressions: prev.impressions, clicks: prev.clicks, conversions: prev.conversions.toFixed(1) } : null,
                costChange: prev && prev.cost > 0 ? ((curr.cost - prev.cost) / prev.cost * 100).toFixed(1) : null,
            }
        }).sort((a, b) => b.current.cost - a.current.cost)

        const seriesPerformance = Array.from(seriesAgg.entries()).map(([sc, data]) => ({
            series: sc === 0 ? '未分類' : (seriesMap.get(sc) || `シリーズ${sc}`),
            cost: Math.round(data.cost),
            ctr: data.impressions > 0 ? (data.clicks / data.impressions * 100).toFixed(2) : '0',
            cvr: data.clicks > 0 ? (data.conversions / data.clicks * 100).toFixed(2) : '0',
            roas: data.cost > 0 ? (data.cv_value / data.cost * 100).toFixed(0) : '0',
        })).sort((a, b) => b.cost - a.cost)

        const totalCost = Array.from(currentAgg.values()).reduce((s, v) => s + v.cost, 0)
        const totalClicks = Array.from(currentAgg.values()).reduce((s, v) => s + v.clicks, 0)
        const totalConversions = Array.from(currentAgg.values()).reduce((s, v) => s + v.conversions, 0)
        const totalImpressions = Array.from(currentAgg.values()).reduce((s, v) => s + v.impressions, 0)
        const totalCvValue = Array.from(currentAgg.values()).reduce((s, v) => s + v.cv_value, 0)

        // 広告費の内訳
        const platformCosts = {
            google: adCosts?.reduce((s: number, r: any) => s + (r.google_cost || 0), 0) || 0,
            amazon: adCosts?.reduce((s: number, r: any) => s + (r.amazon_cost || 0), 0) || 0,
            rakuten: adCosts?.reduce((s: number, r: any) => s + (r.rakuten_cost || 0), 0) || 0,
            yahoo: adCosts?.reduce((s: number, r: any) => s + (r.yahoo_cost || 0), 0) || 0,
            other: adCosts?.reduce((s: number, r: any) => s + (r.other_cost || 0), 0) || 0,
        }

        // ===== AI分析 =====
        const prompt = `あなたはデジタル広告の最適化コンサルタントです。以下のGoogle広告（P-MAX）のパフォーマンスデータを分析し、経営者向けの実用的なレポートを作成してください。

対象月: ${targetMonth}（前月: ${prevMonth}）

【Google広告 全体サマリー】
- 総広告費: ¥${Math.round(totalCost).toLocaleString()}
- 総表示回数: ${totalImpressions.toLocaleString()}
- 総クリック数: ${totalClicks.toLocaleString()}
- 総コンバージョン数: ${totalConversions.toFixed(1)}
- CTR: ${totalImpressions > 0 ? (totalClicks / totalImpressions * 100).toFixed(2) : '0'}%
- CPC: ¥${totalClicks > 0 ? Math.round(totalCost / totalClicks) : 0}
- CVR: ${totalClicks > 0 ? (totalConversions / totalClicks * 100).toFixed(2) : '0'}%
- ROAS: ${totalCost > 0 ? (totalCvValue / totalCost * 100).toFixed(0) : '0'}%

【全プラットフォーム広告費】
- Google: ¥${platformCosts.google.toLocaleString()}
- Amazon: ¥${platformCosts.amazon.toLocaleString()}
- 楽天: ¥${platformCosts.rakuten.toLocaleString()}
- Yahoo: ¥${platformCosts.yahoo.toLocaleString()}
- その他: ¥${platformCosts.other.toLocaleString()}

【アセットグループ別パフォーマンス（前月比較）】
${JSON.stringify(assetGroupComparison, null, 2)}

【シリーズ別パフォーマンス】
${JSON.stringify(seriesPerformance, null, 2)}

【出力要件】
以下の4セクションをMarkdown形式で出力してください。具体的な数値を必ず引用し、実用的なアドバイスを含めてください。

## 📊 今月の広告パフォーマンス総括
全体的な広告効果を評価し、前月との比較で特筆すべき変化を解説。ROAS・CVR・CPCの観点から効率性を評価。

## 🏆 成功している広告グループ
高パフォーマンスのアセットグループを特定し、何が成功要因か分析。予算増額の余地があるか提案。

## ⚠️ 改善が必要な広告グループ
効率が低い、もしくは前月から悪化しているグループを特定。具体的な改善施策を提案。

## 💡 来月への提案
予算配分の最適化、新規施策、停止すべき広告など、来月に向けた具体的なアクションプランを3〜5項目で提案。`

        const genAI = new GoogleGenerativeAI(geminiKey)
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })
        const result = await model.generateContent(prompt)
        const response = await result.response
        const analysis = response.text()

        return NextResponse.json({
            success: true,
            analysis,
            month: targetMonth,
            summary: {
                totalCost: Math.round(totalCost),
                totalClicks,
                totalConversions: parseFloat(totalConversions.toFixed(1)),
                totalImpressions,
                roas: totalCost > 0 ? parseFloat((totalCvValue / totalCost * 100).toFixed(0)) : 0,
                platformCosts,
            },
        })
    } catch (error: any) {
        console.error('AI広告分析エラー:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
