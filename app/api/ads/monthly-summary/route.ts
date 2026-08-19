// /app/api/ads/monthly-summary/route.ts
// 広告管理の媒体別AI分析結果を横断して、今月の総評を作成する。
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type PlatformKey = 'google' | 'meta' | 'rakuten' | 'yahoo' | 'amazon'

interface PlatformAnalysis {
    platform: PlatformKey
    label: string
    success: boolean
    analysis?: string
    error?: string
    metrics?: Record<string, unknown>
}

interface CostsPayload {
    google?: number
    meta?: number
    rakuten?: number
    yahoo?: number
    amazon?: number
    other?: number
    total?: number
}

interface EcProfitPayload {
    totals?: Record<string, number>
    channels?: Array<Record<string, unknown>>
    completeness?: Record<string, unknown>
}

const yen = (value: unknown) => {
    const n = Number(value || 0)
    return `¥${Math.round(n).toLocaleString()}`
}

const truncate = (text: string, max = 4500) => {
    if (text.length <= max) return text
    return `${text.slice(0, max)}\n...（長文のため省略）`
}

const metricNumber = (metrics: Record<string, unknown> | undefined, key: string) => {
    const value = metrics?.[key]
    const num = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(num) ? num : 0
}

const formatMetrics = (metrics: Record<string, unknown> | undefined) => {
    if (!metrics) return '実指標なし'
    return Object.entries(metrics)
        .filter(([, value]) => value !== null && value !== undefined && value !== '')
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(', ')
}

export async function POST(request: NextRequest) {
    try {
        const { month, analyses, costs, ecProfit } = await request.json() as {
            month?: string
            analyses?: PlatformAnalysis[]
            costs?: CostsPayload
            ecProfit?: EcProfitPayload | null
        }

        if (!month) {
            return NextResponse.json({ success: false, error: 'monthは必須です' }, { status: 400 })
        }

        if (!Array.isArray(analyses) || analyses.length === 0) {
            return NextResponse.json({ success: false, error: '媒体別AI分析結果がありません' }, { status: 400 })
        }

        const successfulAnalyses = analyses.filter(item => item.success && item.analysis?.trim())
        if (successfulAnalyses.length === 0) {
            return NextResponse.json({ success: false, error: '有効な媒体別AI分析結果がありません' }, { status: 400 })
        }

        const geminiApiKey = process.env.GEMINI_API_KEY
        if (!geminiApiKey) {
            return NextResponse.json({ success: false, error: 'GEMINI_API_KEY未設定' }, { status: 500 })
        }

        const failedNotes = analyses
            .filter(item => !item.success)
            .map(item => `- ${item.label}: ${item.error || '分析結果を取得できませんでした'}`)
            .join('\n')

        const platformBlocks = analyses.map(item => {
            if (!item.success || !item.analysis) {
                return `## ${item.label}\n実指標: ${formatMetrics(item.metrics)}\n分析未取得: ${item.error || '不明なエラー'}`
            }
            return `## ${item.label}\n実指標: ${formatMetrics(item.metrics)}\n${truncate(item.analysis)}`
        }).join('\n\n')

        const googleAnalysis = analyses.find(item => item.platform === 'google')
        const googleMetrics = googleAnalysis?.metrics
        const googleCost = metricNumber(googleMetrics, 'cost')
        const googleClicks = metricNumber(googleMetrics, 'clicks')
        const googleConversions = metricNumber(googleMetrics, 'conversions')
        const googleCvr = metricNumber(googleMetrics, 'cvr')
        const googleCpc = metricNumber(googleMetrics, 'cpc')
        const googleCpa = metricNumber(googleMetrics, 'cpa') || (googleConversions > 0 ? Math.round(googleCost / googleConversions) : 0)
        const googleCvValue = metricNumber(googleMetrics, 'cv_value')
        const googleRoas = metricNumber(googleMetrics, 'roas')
        const googleCvValueLooksUnreliable = googleCost > 0 && googleCvValue < googleCost * 0.5 && googleConversions > 0

        const decisionGuard = `
【総評時の定量ガード】
- 媒体別AI分析の文章より、ここにある実指標と広告費サマリーを優先してください。
- Google広告は conversions_value / ROAS が設定依存です。実売上と一致しない可能性が高いため、CV値由来ROASだけで停止判断しないでください。
- Google実指標: 広告費 ${yen(googleCost)}、クリック ${googleClicks.toLocaleString()}、CV ${googleConversions.toLocaleString()}、CVR ${googleCvr}%、CPC ${yen(googleCpc)}、CPA ${yen(googleCpa)}、CV値 ${yen(googleCvValue)}、ROAS(CV値由来) ${googleRoas}%。
- ${googleCvValueLooksUnreliable ? '今回のGoogle CV値は広告費に対して低く、CV値/ROASは計測設定ズレの可能性が高いです。CVRやCPAが良いなら「即停止」ではなく「計測修正」「高効率維持」「配分見直し」と判断してください。' : 'GoogleのCV値/ROASは参考にできますが、停止判断はCVR・CPA・CV数と合わせてください。'}
- GoogleでCVRが5%以上かつCPAが500円未満なら、原則として「停止候補」ではなく「維持/拡大候補または計測修正候補」としてください。`

        const costSummary = costs ? `
- Google: ${yen(costs.google)}
- Meta: ${yen(costs.meta)}
- 楽天: ${yen(costs.rakuten)}
- Yahoo: ${yen(costs.yahoo)}
- Amazon: ${yen(costs.amazon)}
- その他: ${yen(costs.other)}
- 合計: ${yen(costs.total)}
` : '広告費サマリーなし'

        const profitSummary = ecProfit?.totals ? `
- TSA売上: ${yen(ecProfit.totals.sales)}
- 商品原価: ${yen(ecProfit.totals.productCost)}
- EC控除: ${yen(ecProfit.totals.ecDeductions)}
- 広告費: ${yen(ecProfit.totals.adCost)}
- 月次利益: ${yen(ecProfit.totals.finalProfit)}
- 月次利益率: ${Number(ecProfit.totals.profitRate || 0).toFixed(1)}%
- 精算取得状況: ${JSON.stringify(ecProfit.completeness || {})}
- EC別: ${(ecProfit.channels || []).map(row => `${String(row.label || row.channel)} 売上${yen(row.sales)} EC控除${yen(row.ecDeductions)} 広告費${yen(row.directAdCost)} 利益${yen(row.finalProfit)}(${Number(row.profitRate || 0).toFixed(1)}%)`).join(' / ')}
` : 'EC月次利益は未取得です。広告指標だけで利益を断定しないでください。'

        const prompt = `あなたは食品ECの広告運用と経営管理に強いマーケティング責任者です。
TSAのWEB販売管理システムで実行された各媒体のAI分析結果を読み、${month}の広告運用を横断して総評してください。

前提:
- 経営者が次に何をするべきかを判断できるように、結論を先に出してください。
- 単に広告費を減らす話ではなく、売上上限を落とさずに利益と現金を残す観点で見てください。
- 各媒体の分析を尊重しつつ、媒体間で矛盾する提案があれば優先順位を付けて統合してください。
- データが不足している媒体はその旨を明記し、推測を断定しないでください。

${decisionGuard}

広告費サマリー:
${costSummary}

EC月次利益（最優先の経営判断データ）:
${profitSummary}

媒体別AI分析の取得状況:
- 成功: ${successfulAnalyses.map(item => item.label).join('、')}
${failedNotes ? `- 未取得:\n${failedNotes}` : ''}

媒体別AI分析結果:
${platformBlocks}

出力形式:
## 今月の結論
3行以内で、今月の広告運用が攻めるべきか、絞るべきか、維持すべきかを明確に書く。

## 媒体別の判断
Google、Meta、楽天、Yahoo、Amazonについて「増やす / 維持 / 絞る / 停止候補」を明記し、理由を短く書く。

## 利益を残すための優先アクション
今すぐ、1週間以内、来月までの3段階で具体的に書く。

## 注意点
判断を間違えやすいデータ不足・計測ズレ・売上上限への影響を簡潔に書く。`

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.45, maxOutputTokens: 3500 },
                }),
            }
        )

        if (!geminiRes.ok) {
            const errorData = await geminiRes.json().catch(() => ({}))
            console.error('広告総評 Gemini API エラー:', errorData)
            return NextResponse.json({ success: false, error: `Gemini API エラー: ${geminiRes.status}` }, { status: 500 })
        }

        const geminiData = await geminiRes.json()
        const summary = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text

        if (!summary) {
            return NextResponse.json({ success: false, error: '総評テキストを生成できませんでした' }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            summary,
            generatedAt: new Date().toISOString(),
        })
    } catch (error: any) {
        console.error('広告月次総評エラー:', error)
        return NextResponse.json({ success: false, error: error.message || '総評作成に失敗しました' }, { status: 500 })
    }
}
