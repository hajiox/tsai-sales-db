// /app/api/google-ads/sync/route.ts
// Google Ads API からアセットグループのパフォーマンスデータを取得してDBに保存
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const API_VERSION = 'v23'
const GOOGLE_ADS_API_BASE = `https://googleads.googleapis.com/${API_VERSION}`

// アクセストークンを取得
async function getAccessToken(): Promise<string> {
    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN

    if (!clientId || !clientSecret || !refreshToken) {
        const missing = []
        if (!clientId) missing.push('GOOGLE_CLIENT_ID')
        if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET')
        if (!refreshToken) missing.push('GOOGLE_ADS_REFRESH_TOKEN')
        throw new Error(`環境変数が未設定: ${missing.join(', ')}`)
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        }),
    })
    const data = await response.json()
    if (data.error) {
        console.error('OAuth token error details:', JSON.stringify(data))
        throw new Error(`Token error: ${data.error_description || data.error}`)
    }
    return data.access_token
}

// Google Ads API にクエリを実行
async function queryGoogleAds(accessToken: string, query: string) {
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID!
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!

    const url = `${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
            'login-customer-id': loginCustomerId,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Google Ads API error (${response.status}): ${errorText.substring(0, 500)}`)
    }

    return response.json()
}

// シリーズマッピングを取得
async function getSeriesMapping(): Promise<Map<string, number>> {
    const { data, error } = await supabase
        .from('google_ads_series_mapping')
        .select('asset_group_name, series_code')

    if (error) throw error

    const mapping = new Map<string, number>()
    data?.forEach(item => {
        mapping.set(item.asset_group_name, item.series_code)
    })
    return mapping
}

// POST: 指定期間のデータを同期
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { startDate, endDate } = body

        // デフォルトは過去30日
        const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const end = endDate || new Date().toISOString().split('T')[0]

        console.log(`Google Ads sync: ${start} ~ ${end}`)

        // 1. アクセストークン取得
        const accessToken = await getAccessToken()

        // 2. アセットグループの日次パフォーマンスデータを取得
        const query = `
      SELECT
        campaign.name,
        asset_group.name,
        asset_group.status,
        segments.date,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.conversions_value
      FROM asset_group
      WHERE segments.date BETWEEN '${start}' AND '${end}'
      ORDER BY segments.date DESC, metrics.cost_micros DESC
    `

        const result = await queryGoogleAds(accessToken, query)
        const rows = result.results || []

        console.log(`Fetched ${rows.length} rows from Google Ads API`)

        // 3. シリーズマッピングを取得
        const seriesMapping = await getSeriesMapping()

        // 4. DBに保存（upsert）
        let insertedCount = 0
        let errorCount = 0

        for (const row of rows) {
            const campaignName = row.campaign?.name || ''
            const assetGroupName = row.assetGroup?.name || ''
            const assetGroupStatus = row.assetGroup?.status || ''
            const reportDate = row.segments?.date || ''
            const costMicros = Number(row.metrics?.costMicros || 0)
            const impressions = Number(row.metrics?.impressions || 0)
            const clicks = Number(row.metrics?.clicks || 0)
            const conversions = Number(row.metrics?.conversions || 0)
            const conversionsValue = Number(row.metrics?.conversionsValue || 0)

            // シリーズコードを自動マッピング
            const seriesCode = seriesMapping.get(assetGroupName) || null

            const { error } = await supabase
                .from('google_ads_performance')
                .upsert({
                    campaign_name: campaignName,
                    asset_group_name: assetGroupName,
                    asset_group_status: assetGroupStatus,
                    report_date: reportDate,
                    cost_micros: costMicros,
                    impressions,
                    clicks,
                    conversions,
                    conversions_value: conversionsValue,
                    series_code: seriesCode,
                    synced_at: new Date().toISOString(),
                }, {
                    onConflict: 'campaign_name,asset_group_name,report_date'
                })

            if (error) {
                console.error(`Insert error for ${assetGroupName} on ${reportDate}:`, error.message)
                errorCount++
            } else {
                insertedCount++
            }
        }

        // 5. advertising_costs の google_cost を自動更新
        await updateAdvertisingCosts(start, end)

        return NextResponse.json({
            success: true,
            message: `Synced ${insertedCount} rows (${errorCount} errors)`,
            totalFetched: rows.length,
            inserted: insertedCount,
            errors: errorCount,
            period: { start, end },
        })

    } catch (error: any) {
        console.error('Google Ads sync error:', error)
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        )
    }
}

// advertising_costs の google_cost を月次集計で更新
async function updateAdvertisingCosts(startDate: string, endDate: string) {
    // 月次集計データを取得
    const { data: monthlySummary, error: summaryError } = await supabase
        .from('google_ads_performance')
        .select('series_code, report_date, cost_micros')
        .gte('report_date', startDate)
        .lte('report_date', endDate)
        .not('series_code', 'is', null)

    if (summaryError) {
        console.error('Monthly summary error:', summaryError)
        return
    }

    // 月・シリーズ別に集計
    const monthlyMap = new Map<string, number>()
    monthlySummary?.forEach(row => {
        const month = row.report_date.substring(0, 7) // YYYY-MM
        const key = `${row.series_code}_${month}`
        const current = monthlyMap.get(key) || 0
        monthlyMap.set(key, current + Number(row.cost_micros))
    })

    // advertising_costs テーブルを更新
    for (const [key, totalCostMicros] of monthlyMap.entries()) {
        const [seriesCodeStr, month] = key.split('_')
        const seriesCode = parseInt(seriesCodeStr)
        const googleCost = Math.round(totalCostMicros / 1000000)

        const { error } = await supabase
            .from('advertising_costs')
            .update({ google_cost: googleCost })
            .eq('series_code', seriesCode)
            .eq('report_month', `${month}-01`)

        if (error) {
            console.error(`Failed to update advertising_costs for series ${seriesCode}, ${month}:`, error)
        } else {
            console.log(`Updated google_cost for series ${seriesCode}, ${month}: ¥${googleCost.toLocaleString()}`)
        }
    }
}

// GET: 保存済みデータの取得
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const month = searchParams.get('month') // YYYY-MM
        const view = searchParams.get('view') || 'summary' // summary or detail

        if (!month) {
            return NextResponse.json({ error: 'month parameter required' }, { status: 400 })
        }

        const startDate = `${month}-01`
        const endDate = new Date(
            parseInt(month.split('-')[0]),
            parseInt(month.split('-')[1]),
            0
        ).toISOString().split('T')[0]

        if (view === 'summary') {
            // アセットグループ別の月次サマリー
            const { data, error } = await supabase
                .from('google_ads_performance')
                .select('campaign_name, asset_group_name, asset_group_status, series_code, cost_micros, impressions, clicks, conversions, conversions_value')
                .gte('report_date', startDate)
                .lte('report_date', endDate)

            if (error) throw error

            // アセットグループ別に集計
            const summaryMap = new Map<string, any>()
            data?.forEach(row => {
                const key = `${row.campaign_name}|${row.asset_group_name}`
                const existing = summaryMap.get(key) || {
                    campaign_name: row.campaign_name,
                    asset_group_name: row.asset_group_name,
                    asset_group_status: row.asset_group_status,
                    series_code: row.series_code,
                    total_cost: 0,
                    total_impressions: 0,
                    total_clicks: 0,
                    total_conversions: 0,
                    total_conversions_value: 0,
                }
                existing.total_cost += Number(row.cost_micros || 0) / 1000000
                existing.total_impressions += Number(row.impressions || 0)
                existing.total_clicks += Number(row.clicks || 0)
                existing.total_conversions += Number(row.conversions || 0)
                existing.total_conversions_value += Number(row.conversions_value || 0)
                summaryMap.set(key, existing)
            })

            const summary = Array.from(summaryMap.values())
                .sort((a, b) => b.total_cost - a.total_cost)

            return NextResponse.json({ data: summary, month })
        } else {
            // 日次の詳細データ
            const { data, error } = await supabase
                .from('google_ads_performance')
                .select('*')
                .gte('report_date', startDate)
                .lte('report_date', endDate)
                .order('report_date', { ascending: false })

            if (error) throw error
            return NextResponse.json({ data, month })
        }
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
