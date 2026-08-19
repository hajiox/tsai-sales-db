// /app/web-sales/advertising/page.client.tsx ver.3
// 統合経費管理ダッシュボード — EC精算・広告費・AI分析機能
"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"
import {
    ArrowLeft, RefreshCw, TrendingUp, TrendingDown,
    DollarSign, Eye, MousePointerClick, Target,
    BarChart3, Zap, ChevronDown, ChevronUp,
    Download, Check, Save, AlertCircle, ArrowRight,
    Brain, Sparkles, LayoutDashboard, CheckCircle, Crosshair, FileSpreadsheet, Bot
} from "lucide-react"
import MetaTab from "./meta-tab"
import RakutenTab from "./rakuten-tab"
import YahooTab from "./yahoo-tab"
import AmazonTab from "./amazon-tab"
import AdChatWindow from "@/components/AdChatWindow"
import LpTrackingInlineTab from "./lp-tracking-tab"
import RakutenSearchRequestTab from "./rakuten-search-request-tab"
import EcProfitOverview from "./ec-profit-overview"
import WebSalesCodexAnalysis from "@/components/web-sales-codex-analysis"

// ===== 型定義 =====
interface AssetGroupSummary {
    campaign_name: string
    asset_group_name: string
    asset_group_status: string
    series_code: number | null
    total_cost: number
    total_impressions: number
    total_clicks: number
    total_conversions: number
    total_conversions_value: number
}

interface MonthlyTrend {
    month: string
    cost: number
    impressions: number
    clicks: number
    conversions: number
}

interface SeriesOption {
    series_code: number
    series_name: string
}

interface MappingItem {
    asset_group_name: string
    series_code: number | null
    series_name: string
    cost: number
    impressions: number
    clicks: number
    conversions: number
    isLearned: boolean
    isConfirmed: boolean
    originalSeriesCode: number | null
}

interface PlatformCosts {
    google: number
    meta: number
    amazon: number
    rakuten: number
    yahoo: number
    other: number
}

interface AdCostRow {
    series_code: number
    google_cost: number
    meta_cost: number
    amazon_cost: number
    rakuten_cost: number
    yahoo_cost: number
    other_cost: number
}

type TabType = 'overview' | 'google' | 'meta' | 'rakuten' | 'rakuten-search' | 'yahoo' | 'amazon' | 'lp-tracking'
type SyncResultType = 'success' | 'warning' | 'error'
type AdPlatformKey = 'google' | 'meta' | 'rakuten' | 'yahoo' | 'amazon'

interface MonthlyPlatformAnalysis {
    platform: AdPlatformKey
    label: string
    success: boolean
    analysis?: string
    error?: string
    metrics?: Record<string, unknown>
}

interface MonthlyReviewResult {
    month: string
    summary: string
    analyses: MonthlyPlatformAnalysis[]
    generatedAt?: string
}

const AD_ANALYSIS_PLATFORMS: Array<{ key: AdPlatformKey; label: string; endpoint: string }> = [
    { key: 'google', label: 'Google', endpoint: '/api/google-ads/ai-analysis' },
    { key: 'meta', label: 'Meta', endpoint: '/api/meta-ads/ai-analysis' },
    { key: 'rakuten', label: '楽天', endpoint: '/api/rakuten-ads/ai-analysis' },
    { key: 'yahoo', label: 'Yahoo', endpoint: '/api/yahoo-ads/ai-analysis' },
    { key: 'amazon', label: 'Amazon', endpoint: '/api/amazon-ads/ai-analysis' },
]

// ===== メインコンポーネント =====
export default function AdvertisingDashboard() {
    const router = useRouter()

    // デフォルトは前月
    const [month, setMonth] = useState(() => {
        const now = new Date()
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
    })

    const [activeTab, setActiveTab] = useState<TabType>('overview')
    const [assetGroups, setAssetGroups] = useState<AssetGroupSummary[]>([])
    const [seriesMap, setSeriesMap] = useState<Map<number, string>>(new Map())
    const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([])
    const [monthlyTrend, setMonthlyTrend] = useState<MonthlyTrend[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSyncing, setIsSyncing] = useState(false)
    const [lastSyncTime, setLastSyncTime] = useState<string | null>(null)
    const [expandedSeries, setExpandedSeries] = useState<Set<number>>(new Set())
    const [syncResult, setSyncResult] = useState<string | null>(null)
    const [syncResultType, setSyncResultType] = useState<SyncResultType>('success')

    // 広告費取り込み関連
    const [showImportPanel, setShowImportPanel] = useState(false)
    const importPanelRef = useRef<HTMLDivElement>(null)
    const [mappings, setMappings] = useState<MappingItem[]>([])
    const [isImporting, setIsImporting] = useState(false)
    const [importResult, setImportResult] = useState<string | null>(null)
    const [savingMapping, setSavingMapping] = useState<string | null>(null)

    // プラットフォーム別広告費
    const [platformCosts, setPlatformCosts] = useState<PlatformCosts>({ google: 0, meta: 0, amazon: 0, rakuten: 0, yahoo: 0, other: 0 })
    const [seriesAdCosts, setSeriesAdCosts] = useState<AdCostRow[]>([])
    const [seriesSalesMap, setSeriesSalesMap] = useState<Map<number, number>>(new Map())

    // AI分析
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [aiTarget, setAiTarget] = useState<string | null>(null)
    const [showGoogleChat, setShowGoogleChat] = useState(false)
    const [googleAnalysisResult, setGoogleAnalysisResult] = useState<string | null>(null)
    const [isMonthlyReviewing, setIsMonthlyReviewing] = useState(false)
    const [monthlyReviewStatus, setMonthlyReviewStatus] = useState<string | null>(null)
    const [monthlyReviewError, setMonthlyReviewError] = useState<string | null>(null)
    const [monthlyReview, setMonthlyReview] = useState<MonthlyReviewResult | null>(null)
    // 取り込み済み状態（プラットフォーム別）
    const [importedPlatforms, setImportedPlatforms] = useState<{ google: boolean; meta: boolean; amazon: boolean; rakuten: boolean; yahoo: boolean }>({ google: false, meta: false, amazon: false, rakuten: false, yahoo: false })

    // データ取得
    const fetchData = useCallback(async () => {
        setIsLoading(true)
        try {
            const supabase = getSupabaseBrowserClient()
            // シリーズマスター取得
            const { data: products } = await supabase
                .from('products')
                .select('series_code, series')
                .not('series_code', 'is', null)
                .order('series_code')

            const sMap = new Map<number, string>()
            const sOpts: SeriesOption[] = []
            products?.forEach((p: { series_code: number; series: string }) => {
                if (!sMap.has(p.series_code)) {
                    sMap.set(p.series_code, p.series)
                    sOpts.push({ series_code: p.series_code, series_name: p.series })
                }
            })
            setSeriesMap(sMap)
            setSeriesOptions(sOpts)

            // 月の範囲計算
            const startDate = `${month}-01`
            const endYear = parseInt(month.split('-')[0])
            const endMonth = parseInt(month.split('-')[1])
            const lastDay = new Date(endYear, endMonth, 0).getDate()
            const endDate = `${month}-${String(lastDay).padStart(2, '0')}`

            // パフォーマンスデータ取得（DB）
            let { data: perfData } = await supabase
                .from('google_ads_performance')
                .select('campaign_name, asset_group_name, asset_group_status, series_code, cost_micros, impressions, clicks, conversions, conversions_value')
                .gte('report_date', startDate)
                .lte('report_date', endDate)


            // アセットグループ別に集計
            const groupMap = new Map<string, AssetGroupSummary>()
            perfData?.forEach((row: any) => {
                const key = `${row.campaign_name}|${row.asset_group_name}`
                const existing = groupMap.get(key) || {
                    campaign_name: row.campaign_name, asset_group_name: row.asset_group_name,
                    asset_group_status: row.asset_group_status, series_code: row.series_code,
                    total_cost: 0, total_impressions: 0, total_clicks: 0, total_conversions: 0, total_conversions_value: 0,
                }
                existing.total_cost += Number(row.cost_micros || 0) / 1000000
                existing.total_impressions += Number(row.impressions || 0)
                existing.total_clicks += Number(row.clicks || 0)
                existing.total_conversions += Number(row.conversions || 0)
                existing.total_conversions_value += Number(row.conversions_value || 0)
                groupMap.set(key, existing)
            })

            const groups = Array.from(groupMap.values())
                .filter(g => g.total_cost > 0 || g.asset_group_status === 'ENABLED')
                .sort((a, b) => b.total_cost - a.total_cost)
            setAssetGroups(groups)

            // 月次トレンド（過去6ヶ月）
            const trendMonths: MonthlyTrend[] = []
            for (let i = 5; i >= 0; i--) {
                const d = new Date(endYear, endMonth - 1 - i, 1)
                const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                const mStart = `${m}-01`
                const mEnd = `${m}-${String(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()).padStart(2, '0')}`
                const { data: mData } = await supabase
                    .from('google_ads_performance')
                    .select('cost_micros, impressions, clicks, conversions')
                    .gte('report_date', mStart).lte('report_date', mEnd)
                const totals = { month: m, cost: 0, impressions: 0, clicks: 0, conversions: 0 }
                mData?.forEach((r: any) => {
                    totals.cost += Number(r.cost_micros || 0) / 1000000
                    totals.impressions += Number(r.impressions || 0)
                    totals.clicks += Number(r.clicks || 0)
                    totals.conversions += Number(r.conversions || 0)
                })
                trendMonths.push(totals)
            }
            setMonthlyTrend(trendMonths)

            // プラットフォーム別広告費
            const { data: adCostData } = await supabase
                .from('advertising_costs')
                .select('series_code, google_cost, meta_cost, amazon_cost, rakuten_cost, yahoo_cost, other_cost')
                .eq('report_month', `${month}-01`)

            if (adCostData) {
                setSeriesAdCosts(adCostData as AdCostRow[])
                const pCosts = { google: 0, meta: 0, amazon: 0, rakuten: 0, yahoo: 0, other: 0 }
                adCostData.forEach((r: any) => {
                    pCosts.google += r.google_cost || 0
                    pCosts.meta += r.meta_cost || 0
                    pCosts.amazon += r.amazon_cost || 0
                    pCosts.rakuten += r.rakuten_cost || 0
                    pCosts.yahoo += r.yahoo_cost || 0
                    pCosts.other += r.other_cost || 0
                })
                setPlatformCosts(pCosts)
            }

            // 広告費取り込み済みチェック（プラットフォーム別）
            if (adCostData) {
                setImportedPlatforms({
                    google: adCostData.some((r: any) => (r.google_cost || 0) > 0),
                    meta: adCostData.some((r: any) => (r.meta_cost || 0) > 0),
                    amazon: adCostData.some((r: any) => (r.amazon_cost || 0) > 0),
                    rakuten: adCostData.some((r: any) => (r.rakuten_cost || 0) > 0),
                    yahoo: adCostData.some((r: any) => (r.yahoo_cost || 0) > 0),
                })
            }

            // シリーズ別売上データ取得（web_sales_summary + products JOIN）
            const { data: salesData } = await supabase
                .from('web_sales_summary')
                .select('product_id, amazon_count, rakuten_count, yahoo_count, mercari_count, base_count, qoo10_count, tiktok_count, unit_price, base_amount')
                .eq('report_month', `${month}-01`)
            const { data: productList } = await supabase
                .from('products')
                .select('id, series_code')
                .not('series_code', 'is', null)
            if (salesData && productList) {
                const pidToSeries = new Map<string, number>()
                productList.forEach((p: any) => pidToSeries.set(p.id, p.series_code))
                const salesMap = new Map<number, number>()
                salesData.forEach((row: any) => {
                    const sc = pidToSeries.get(row.product_id)
                    if (!sc) return
                    const totalCount = (row.amazon_count || 0) + (row.rakuten_count || 0) + (row.yahoo_count || 0) + (row.mercari_count || 0) + (row.base_count || 0) + (row.qoo10_count || 0) + (row.tiktok_count || 0)
                    const sales = totalCount * (row.unit_price || 0) + (row.base_amount || 0)
                    salesMap.set(sc, (salesMap.get(sc) || 0) + sales)
                })
                setSeriesSalesMap(salesMap)
            }

            // 最終同期日時
            const { data: syncData } = await supabase
                .from('google_ads_performance')
                .select('synced_at')
                .order('synced_at', { ascending: false })
                .limit(1)
            if (syncData?.[0]) {
                setLastSyncTime(new Date(syncData[0].synced_at).toLocaleString('ja-JP'))
            }

        } catch (error) {
            console.error('データ取得エラー:', error)
        } finally {
            setIsLoading(false)
        }
    }, [month])

    useEffect(() => { fetchData() }, [fetchData])

    useEffect(() => {
        setMonthlyReview(null)
        setMonthlyReviewError(null)
        setMonthlyReviewStatus(null)
    }, [month])

    // 手動同期
    const handleSync = async () => {
        setIsSyncing(true); setSyncResult(null); setSyncResultType('success')
        try {
            const startDate = `${month}-01`
            const y = parseInt(month.split('-')[0]); const m = parseInt(month.split('-')[1])
            const lastDay = new Date(y, m, 0).getDate()
            const endDate = `${month}-${String(lastDay).padStart(2, '0')}`
            const res = await fetch('/api/google-ads/sync', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ startDate, endDate }),
            })
            const data = await res.json()
            if (data.success) {
                setSyncResultType('success')
                setSyncResult(`${month} のデータを同期しました（${data.inserted}件）`)
                await fetchData()
            } else if (data.reauthRequired || data.code === 'GOOGLE_ADS_REAUTH_REQUIRED') {
                setSyncResultType('warning')
                setSyncResult('Google広告の認証期限が切れています。保存済みデータは表示できますが、新しく同期するにはGoogle広告の再連携が必要です。')
            } else {
                setSyncResultType('error')
                setSyncResult(`同期エラー: ${data.error || '同期に失敗しました'}`)
            }
        } catch (error: any) {
            setSyncResultType('error')
            setSyncResult(`同期エラー: ${error.message}`)
        }
        finally { setIsSyncing(false) }
    }

    // ===== 広告費取り込み =====
    const openImportPanel = async () => {
        setShowImportPanel(true); setImportResult(null)
        const supabase = getSupabaseBrowserClient()
        const { data: learnedMappings } = await supabase
            .from('google_ads_series_mapping').select('asset_group_name, series_code')
        const learnedMap = new Map<string, number>()
        learnedMappings?.forEach((m: { asset_group_name: string; series_code: number }) => learnedMap.set(m.asset_group_name, m.series_code))
        const items: MappingItem[] = assetGroups.filter(g => g.total_cost > 0).map(g => {
            const learned = learnedMap.get(g.asset_group_name)
            const sc = learned ?? g.series_code ?? null
            return {
                asset_group_name: g.asset_group_name, series_code: sc,
                series_name: sc ? (seriesMap.get(sc) || `シリーズ ${sc}`) : '',
                cost: g.total_cost, impressions: g.total_impressions,
                clicks: g.total_clicks, conversions: g.total_conversions,
                isLearned: learned !== undefined, isConfirmed: learned !== undefined,
                originalSeriesCode: sc,
            }
        })
        setMappings(items)
        // パネルが開いたら自動スクロール
        setTimeout(() => importPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    }

    const handleMappingChange = (index: number, seriesCodeStr: string) => {
        const sc = seriesCodeStr ? parseInt(seriesCodeStr) : null
        setMappings(prev => prev.map((m, i) => i === index ? { ...m, series_code: sc, series_name: sc ? (seriesMap.get(sc) || `シリーズ ${sc}`) : '', isConfirmed: true, isLearned: false } : m))
    }

    const handleLearnMapping = async (index: number) => {
        const mapping = mappings[index]; if (mapping.series_code === null) return
        setSavingMapping(mapping.asset_group_name)
        try {
            const res = await fetch('/api/google-ads/learn-mapping', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ asset_group_name: mapping.asset_group_name, series_code: mapping.series_code }),
            })
            const data = await res.json()
            if (!data.success) throw new Error(data.error)
            setMappings(prev => prev.map((m, i) => i === index ? { ...m, isLearned: true, isConfirmed: true } : m))
        } catch (error) { console.error('学習エラー:', error); alert('学習に失敗しました') }
        finally { setSavingMapping(null) }
    }

    const handleLearnAll = async () => {
        for (let i = 0; i < mappings.length; i++) {
            if (!mappings[i].isLearned && mappings[i].series_code !== null) await handleLearnMapping(i)
        }
    }

    const handleImportCosts = async () => {
        setIsImporting(true); setImportResult(null)
        try {
            const costMappings = mappings.filter(m => m.series_code !== null && m.cost > 0).map(m => ({ series_code: m.series_code, cost: m.cost }))
            const res = await fetch('/api/google-ads/import-costs', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month, mappings: costMappings }),
            })
            const data = await res.json()
            if (data.success) {
                setImportResult(`${month}のGoogle広告費を反映しました\n合計: ¥${data.totalCost.toLocaleString()}（${data.seriesCount}シリーズ）\n更新: ${data.updated}件 / 新規: ${data.created}件`)
                await fetchData()
            } else { setImportResult(`エラー: ${data.error}`) }
        } catch (error: any) { setImportResult(`エラー: ${error.message}`) }
        finally { setIsImporting(false) }
    }

    const handleAiAnalysis = async (assetGroupName?: string) => {
        setIsAnalyzing(true)
        setAiTarget(assetGroupName || 'Google広告全体')
        setGoogleAnalysisResult(null)
        try {
            const res = await fetch('/api/google-ads/ai-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month, assetGroupName }),
            })
            const result = await res.json()
            if (!res.ok || !result.success) {
                throw new Error(result.error || 'Google広告のAI分析に失敗しました')
            }
            setGoogleAnalysisResult(result.analysis)
            setShowGoogleChat(true)
        } catch (error: any) {
            alert(error.message || 'AI分析に失敗しました')
        } finally {
            setIsAnalyzing(false)
            setAiTarget(null)
        }
    }

    const handleMonthlyReview = async () => {
        if (isMonthlyReviewing) return
        setIsMonthlyReviewing(true)
        setMonthlyReview(null)
        setMonthlyReviewError(null)
        setMonthlyReviewStatus('各媒体のAI分析を実行中...')

        try {
            const analyses = await Promise.all(AD_ANALYSIS_PLATFORMS.map(async (platform): Promise<MonthlyPlatformAnalysis> => {
                try {
                    const res = await fetch(platform.endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ month }),
                    })
                    const result = await res.json().catch(() => ({}))
                    if (!res.ok || !result.success || !result.analysis) {
                        return {
                            platform: platform.key,
                            label: platform.label,
                            success: false,
                            error: result.error || `HTTP ${res.status}`,
                        }
                    }
                    return {
                        platform: platform.key,
                        label: platform.label,
                        success: true,
                        analysis: result.analysis,
                        metrics: result.metrics,
                    }
                } catch (error: any) {
                    return {
                        platform: platform.key,
                        label: platform.label,
                        success: false,
                        error: error.message || '通信エラー',
                    }
                }
            }))

            if (!analyses.some(item => item.success && item.analysis?.trim())) {
                throw new Error('各媒体のAI分析結果を取得できませんでした')
            }

            setMonthlyReviewStatus('媒体横断の総まとめを作成中...')
            const profitRes = await fetch(`/api/web-sales/ec-profit?month=${encodeURIComponent(month)}`, { cache: 'no-store' })
            const profitResult = await profitRes.json().catch(() => null)
            const summaryRes = await fetch('/api/ads/monthly-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    month,
                    analyses,
                    costs: { ...platformCosts, total: totalPlatformCost },
                    ecProfit: profitRes.ok ? profitResult : null,
                }),
            })
            const summaryResult = await summaryRes.json().catch(() => ({}))
            if (!summaryRes.ok || !summaryResult.success || !summaryResult.summary) {
                throw new Error(summaryResult.error || '総評の作成に失敗しました')
            }

            setMonthlyReview({
                month,
                summary: summaryResult.summary,
                analyses,
                generatedAt: summaryResult.generatedAt,
            })
        } catch (error: any) {
            setMonthlyReviewError(error.message || '今月の総評を作成できませんでした')
        } finally {
            setMonthlyReviewStatus(null)
            setIsMonthlyReviewing(false)
        }
    }

    // ===== Google AIチャットコンテキスト生成 =====
    const getGoogleChatContext = () => {
        const cpa = totalConversions > 0 ? Math.round(totalCost / totalConversions) : 0
        const topGroups = seriesSummary().slice(0, 5).map(([sc, d]) => {
            const name = sc === 0 ? '未分類' : seriesMap.get(sc) || `シリーズ${sc}`
            const groupCpa = d.conversions > 0 ? Math.round(d.cost / d.conversions) : 0
            const groupCvr = d.clicks > 0 ? (d.conversions / d.clicks * 100).toFixed(2) : '0'
            return `${name}(広告費¥${Math.round(d.cost)} クリック${d.clicks} CV${d.conversions.toFixed(1)} CVR${groupCvr}% CPA¥${groupCpa})`
        }).join(', ')
        // 注意: conversions_valueはGoogle Adsのコンバージョン値設定に依存し、EC売上と一致しない場合がある
        const cvValueNote = totalConversionsValue > 0 && totalConversionsValue < totalCost * 0.5
            ? '（※CV値はGoogle Adsの設定上の値であり、実際のEC売上とは異なる可能性があります。CV数・CVR・CPAで成果を判断してください）'
            : ''
        return `${month} Google広告(P-MAX)サマリー: 総広告費¥${Math.round(totalCost).toLocaleString()} / 表示${totalImpressions.toLocaleString()} / クリック${totalClicks.toLocaleString()} / CTR${avgCtr.toFixed(2)}% / CPC¥${Math.round(avgCpc)} / CV${totalConversions.toFixed(1)} / CVR${avgCvr.toFixed(2)}% / CPA¥${cpa} / CV値¥${Math.round(totalConversionsValue).toLocaleString()}${cvValueNote} / ${assetGroups.length}アセットグループ\nシリーズTOP5: ${topGroups}`
    }

    // ===== 表示用ユーティリティ =====
    const seriesSummary = () => {
        const map = new Map<number, { cost: number, impressions: number, clicks: number, conversions: number, conversionsValue: number, groups: AssetGroupSummary[] }>()
        assetGroups.forEach(g => {
            const sc = g.series_code || 0
            const existing = map.get(sc) || { cost: 0, impressions: 0, clicks: 0, conversions: 0, conversionsValue: 0, groups: [] }
            existing.cost += g.total_cost; existing.impressions += g.total_impressions
            existing.clicks += g.total_clicks; existing.conversions += g.total_conversions
            existing.conversionsValue += g.total_conversions_value; existing.groups.push(g)
            map.set(sc, existing)
        })
        return Array.from(map.entries()).sort((a, b) => b[1].cost - a[1].cost)
    }

    const totalCost = assetGroups.reduce((s, g) => s + g.total_cost, 0)
    const totalImpressions = assetGroups.reduce((s, g) => s + g.total_impressions, 0)
    const totalClicks = assetGroups.reduce((s, g) => s + g.total_clicks, 0)
    const totalConversions = assetGroups.reduce((s, g) => s + g.total_conversions, 0)
    const totalConversionsValue = assetGroups.reduce((s, g) => s + g.total_conversions_value, 0)
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0
    const avgCpc = totalClicks > 0 ? (totalCost / totalClicks) : 0
    const avgCvr = totalClicks > 0 ? (totalConversions / totalClicks * 100) : 0

    const prevMonthTrend = monthlyTrend.length >= 2 ? monthlyTrend[monthlyTrend.length - 2] : null
    const currentMonthTrend = monthlyTrend.length >= 1 ? monthlyTrend[monthlyTrend.length - 1] : null
    const costChange = prevMonthTrend && prevMonthTrend.cost > 0 ? ((currentMonthTrend?.cost || 0) - prevMonthTrend.cost) / prevMonthTrend.cost * 100 : null

    const toggleSeries = (code: number) => setExpandedSeries(prev => { const next = new Set(prev); if (next.has(code)) next.delete(code); else next.add(code); return next })
    const formatNumber = (n: number) => Math.round(n).toLocaleString()
    const formatCurrency = (n: number) => `¥${Math.round(n).toLocaleString()}`
    const formatPercent = (n: number) => `${n.toFixed(2)}%`
    const totalPlatformCost = platformCosts.google + platformCosts.meta + platformCosts.amazon + platformCosts.rakuten + platformCosts.yahoo + platformCosts.other

    const mappingStats = {
        total: mappings.length,
        matched: mappings.filter(m => m.series_code !== null).length,
        unmatched: mappings.filter(m => m.series_code === null).length,
        totalCost: mappings.filter(m => m.series_code !== null).reduce((s, m) => s + m.cost, 0),
    }

    if (isLoading) {
        return (<div className="w-full space-y-6"><div className="animate-pulse space-y-4"><div className="h-8 bg-gray-200 rounded w-1/3"></div><div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-gray-200 rounded-lg"></div>)}</div></div></div>)
    }

    // ===== タブ定義 =====
    const primaryTabs: { id: TabType; label: string; icon: React.ReactNode; imported?: boolean; platformKey?: TabType }[] = [
        { id: 'overview', label: '経費サマリー', icon: <LayoutDashboard size={16} /> },
        { id: 'google', label: 'Google広告', icon: <span className="text-xs font-bold">G</span>, imported: importedPlatforms.google },
        { id: 'meta', label: 'Meta広告', icon: <span className="text-xs font-bold">M</span>, imported: importedPlatforms.meta },
        { id: 'rakuten', label: '楽天広告', icon: <span className="text-xs font-bold text-red-600">R</span>, imported: importedPlatforms.rakuten },
        { id: 'yahoo', label: 'Yahoo!広告', icon: <span className="text-xs font-bold text-purple-600">Y</span>, imported: importedPlatforms.yahoo },
        { id: 'amazon', label: 'Amazon広告', icon: <span className="text-xs font-bold text-orange-500">A</span>, imported: importedPlatforms.amazon },
        { id: 'lp-tracking', label: 'LP計測', icon: <Crosshair size={16} className="text-teal-600" /> },
    ]
    const activePrimaryTab: TabType = activeTab === 'rakuten-search' ? 'rakuten' : activeTab
    const secondaryTabs: Partial<Record<TabType, Array<{ id?: TabType; href?: string; label: string; icon: React.ReactNode }>>> = {
        rakuten: [
            { id: 'rakuten', label: '広告費管理', icon: <span className="text-xs font-bold text-red-600">R</span> },
            { id: 'rakuten-search', label: '楽天サーチ申請', icon: <Target size={16} className="text-red-600" /> },
        ],
        amazon: [
            { id: 'amazon', label: '広告費管理', icon: <span className="text-xs font-bold text-orange-500">A</span> },
            { href: '/web-sales/advertising/amazon-deals', label: 'タイムセール設定', icon: <FileSpreadsheet size={16} className="text-orange-500" /> },
        ],
    }
    const activeSecondaryTabs = secondaryTabs[activePrimaryTab] ?? []

    return (
        <div className="w-full min-w-0 space-y-4 lg:space-y-5">
            {/* ヘッダー */}
            <header>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-2 lg:items-center lg:gap-3">
                        <button onClick={() => router.push('/web-sales/dashboard')} className="min-h-11 min-w-11 shrink-0 rounded-lg p-2 hover:bg-gray-100 transition-colors lg:min-h-0 lg:min-w-0"><ArrowLeft size={20} /></button>
                        <div className="min-w-0">
                            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight lg:text-2xl">
                                <BarChart3 className="text-emerald-600" size={28} />
                                EC経費管理
                            </h1>
                            <p className="mt-1 text-xs leading-5 text-gray-500 lg:mt-0 lg:text-sm">売上・商品原価・EC控除・広告費から月次利益を確認</p>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:gap-3">
                        {lastSyncTime && <span className="order-2 text-xs text-gray-400 sm:order-1">最終同期: {lastSyncTime}</span>}
                        <label className="order-1 flex items-center gap-2 sm:order-2">
                            <span className="shrink-0 text-xs font-medium text-gray-500 lg:hidden">対象月</span>
                            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-base sm:w-auto lg:min-h-0 lg:text-sm" />
                        </label>
                        <Link
                            href="/web-sales/automation"
                            className="order-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800 lg:min-h-0 lg:py-2"
                            title="商品売上・EC精算・広告費をまとめて更新"
                        >
                            <Bot size={16} /> データ更新
                        </Link>
                    </div>
                </div>

                {syncResult && (
                    <div className={`mt-3 px-4 py-2 rounded-lg text-sm ${syncResultType === 'error'
                        ? 'bg-red-50 text-red-700'
                        : syncResultType === 'warning'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-green-50 text-green-700'
                        }`}>{syncResult}</div>
                )}
            </header>

            {/* タブナビゲーション */}
            <div className="space-y-2">
                <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
                    <div className="flex w-max min-w-full gap-1 rounded-lg bg-gray-100 p-1">
                        {primaryTabs.map(tab => (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                className={`flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-md text-sm font-medium transition-all lg:min-h-0 ${activePrimaryTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                <span className="shrink-0">{tab.icon}</span>
                                <span>{tab.label}</span>
                                {tab.imported && <CheckCircle size={14} className="shrink-0 text-green-500" />}
                            </button>
                        ))}
                    </div>
                </div>
                {activeSecondaryTabs.length > 0 && (
                    <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
                        <div className="flex w-max min-w-full gap-2 border-b border-gray-200 pb-2">
                            {activeSecondaryTabs.map(tab => {
                                if (tab.href) {
                                    return (
                                        <Link key={tab.href} href={tab.href}
                                            className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 transition-colors hover:bg-orange-100 lg:min-h-0">
                                            <span className="shrink-0">{tab.icon}</span>
                                            <span>{tab.label}</span>
                                        </Link>
                                    )
                                }
                                return (
                                    <button key={tab.id} onClick={() => tab.id && setActiveTab(tab.id)}
                                        className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors lg:min-h-0 ${activeTab === tab.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                                        <span className="shrink-0">{tab.icon}</span>
                                        <span>{tab.label}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* ===== 概要タブ ===== */}
            {activeTab === 'overview' && (
                <>
                    <EcProfitOverview month={month} />
                    <WebSalesCodexAnalysis month={month} focus="expense" />
                    {false && <section className="border-y border-gray-200 bg-white p-3 lg:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h2 className="flex items-center gap-2 text-base font-semibold lg:text-lg">
                                    <Sparkles size={18} className="text-violet-600" /> 今月の総評
                                </h2>
                                <p className="mt-1 text-xs text-gray-500">各広告媒体のAI分析をまとめて確認します</p>
                            </div>
                            <button
                                onClick={handleMonthlyReview}
                                disabled={isMonthlyReviewing}
                                title="Google / Meta / 楽天 / Yahoo / Amazon のAI分析を実行して総まとめします"
                                className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:bg-gray-400"
                            >
                                {isMonthlyReviewing ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                {isMonthlyReviewing ? '総評作成中...' : '総評を更新'}
                            </button>
                        </div>
                        {(isMonthlyReviewing || monthlyReviewError || monthlyReview) && (
                            <div className="mt-4 border-t pt-4">
                                {isMonthlyReviewing && (
                                    <div className="flex items-center gap-2 border-l-4 border-violet-500 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-700">
                                        <RefreshCw size={16} className="animate-spin" />
                                        {monthlyReviewStatus || 'AI分析を実行中...'}
                                    </div>
                                )}
                                {monthlyReviewError && (
                                    <div className="flex items-start gap-2 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-700">
                                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                                        <span>{monthlyReviewError}</span>
                                    </div>
                                )}
                                {monthlyReview && (
                                    <div className="mt-3 border-l-4 border-violet-400 bg-violet-50/50 p-4">
                                        <div className="prose prose-sm max-w-none break-words text-gray-800 prose-headings:text-gray-900 prose-li:my-0.5">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{monthlyReview.summary}</ReactMarkdown>
                                        </div>
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {monthlyReview.analyses.map(item => (
                                                <span key={item.platform} className={`rounded border px-2.5 py-1 text-xs font-medium ${item.success ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                                                    {item.label}: {item.success ? '分析済み' : '未取得'}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </section>}
                </>
            )}
            {false && activeTab === 'overview' && (
                <>
                    {/* プラットフォーム別広告費カード */}
                    <div className="rounded-lg border bg-white p-3 lg:rounded-xl lg:p-5">
                        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                            <h2 className="flex items-center gap-2 text-base font-semibold lg:text-lg">
                                <DollarSign className="text-emerald-600" size={20} />
                                プラットフォーム別広告費 — {month}
                            </h2>
                            <button
                                onClick={handleMonthlyReview}
                                disabled={isMonthlyReviewing}
                                title="Google / Meta / 楽天 / Yahoo / Amazon のAI分析を実行して総まとめします"
                                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:bg-gray-400 sm:w-auto lg:min-h-0"
                            >
                                {isMonthlyReviewing ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                {isMonthlyReviewing ? '総評作成中...' : '今月の総評'}
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 lg:gap-3">
                            {[
                                { name: 'Google', cost: platformCosts.google, color: 'emerald', active: true },
                                { name: 'Meta', cost: platformCosts.meta, color: 'blue', active: true },
                                { name: 'Amazon', cost: platformCosts.amazon, color: 'orange', active: false },
                                { name: '楽天', cost: platformCosts.rakuten, color: 'red', active: true },
                                { name: 'Yahoo', cost: platformCosts.yahoo, color: 'purple', active: false },
                                { name: 'その他', cost: platformCosts.other, color: 'gray', active: false },
                                { name: '合計', cost: totalPlatformCost, color: 'indigo', active: true },
                            ].map(p => (
                                <div key={p.name} className={`min-w-0 rounded-lg border p-3 ${p.active ? 'bg-white' : 'bg-gray-50'}`}>
                                    <div className="text-xs text-gray-500 mb-1">{p.name}</div>
                                    <div className={`break-words text-base font-bold sm:text-lg ${p.cost > 0 ? `text-${p.color}-700` : 'text-gray-300'}`}>
                                        {p.cost > 0 ? formatCurrency(p.cost) : '—'}
                                    </div>
                                    {totalPlatformCost > 0 && p.name !== '合計' && p.cost > 0 && (
                                        <div className="text-[10px] text-gray-400 mt-0.5">{(p.cost / totalPlatformCost * 100).toFixed(1)}%</div>
                                    )}
                                </div>
                            ))}
                        </div>
                        {(isMonthlyReviewing || monthlyReviewError || monthlyReview) && (
                            <div className="mt-5 border-t pt-4">
                                {isMonthlyReviewing && (
                                    <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-700">
                                        <RefreshCw size={16} className="animate-spin" />
                                        {monthlyReviewStatus || 'AI分析を実行中...'}
                                    </div>
                                )}

                                {monthlyReviewError && (
                                    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                                        <span>{monthlyReviewError}</span>
                                    </div>
                                )}

                                {monthlyReview && (
                                    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 lg:p-4">
                                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 text-sm font-bold text-violet-800">
                                                <Sparkles size={16} />
                                                今月の総評
                                            </div>
                                            {monthlyReview.generatedAt && (
                                                <div className="text-xs text-gray-400">
                                                    {new Date(monthlyReview.generatedAt).toLocaleString('ja-JP')}
                                                </div>
                                            )}
                                        </div>
                                        <div className="prose prose-sm max-w-none break-words text-gray-800 prose-headings:text-gray-900 prose-li:my-0.5">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{monthlyReview.summary}</ReactMarkdown>
                                        </div>
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {monthlyReview.analyses.map(item => (
                                                <span
                                                    key={item.platform}
                                                    title={item.success ? 'AI分析完了' : item.error || '分析エラー'}
                                                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${item.success
                                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                        : 'border-amber-200 bg-amber-50 text-amber-700'
                                                        }`}
                                                >
                                                    {item.label}: {item.success ? '分析済み' : '未取得'}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* シリーズ別広告費内訳 */}
                    {seriesAdCosts.length > 0 && (
                        <div className="bg-white border rounded-xl overflow-hidden">
                            <div className="border-b p-3 lg:p-5">
                                <h2 className="flex items-center gap-2 text-base font-semibold lg:text-lg">
                                    <Zap size={20} className="text-amber-500" />
                                    シリーズ別広告費内訳 — {month}
                                </h2>
                            </div>
                            <div className="overflow-x-auto [scrollbar-width:thin]">
                                <table className="min-w-[920px] w-full lg:min-w-0">
                                    <thead>
                                        <tr className="bg-gray-50 text-xs text-gray-500">
                                            <th className="text-left px-5 py-3 font-medium">シリーズ</th>
                                            <th className="text-right px-4 py-3 font-medium">Google</th>
                                            <th className="text-right px-4 py-3 font-medium">Meta</th>
                                            <th className="text-right px-4 py-3 font-medium">Amazon</th>
                                            <th className="text-right px-4 py-3 font-medium">楽天</th>
                                            <th className="text-right px-4 py-3 font-medium">Yahoo</th>
                                            <th className="text-right px-4 py-3 font-medium">その他</th>
                                            <th className="text-right px-4 py-3 font-medium font-bold">広告費計</th>
                                            <th className="text-right px-4 py-3 font-medium text-blue-600">総売上</th>
                                            <th className="text-right px-4 py-3 font-medium text-amber-600">広告費率</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(() => {
                                            let grandTotalSales = 0
                                            const rows = seriesAdCosts.sort((a, b) => ((b.google_cost || 0) + (b.meta_cost || 0) + (b.amazon_cost || 0) + (b.rakuten_cost || 0) + (b.yahoo_cost || 0) + (b.other_cost || 0)) - ((a.google_cost || 0) + (a.meta_cost || 0) + (a.amazon_cost || 0) + (a.rakuten_cost || 0) + (a.yahoo_cost || 0) + (a.other_cost || 0))).map(row => {
                                                const total = (row.google_cost || 0) + (row.meta_cost || 0) + (row.amazon_cost || 0) + (row.rakuten_cost || 0) + (row.yahoo_cost || 0) + (row.other_cost || 0)
                                                if (total === 0) return null
                                                const sales = seriesSalesMap.get(row.series_code) || 0
                                                grandTotalSales += sales
                                                const adRatio = sales > 0 ? (total / sales * 100) : 0
                                                return (
                                                    <tr key={row.series_code} className="border-t hover:bg-gray-50">
                                                        <td className="px-5 py-2.5 text-sm font-medium">{seriesMap.get(row.series_code) || `シリーズ${row.series_code}`}</td>
                                                        <td className="text-right px-4 py-2.5 text-sm">{row.google_cost > 0 ? formatCurrency(row.google_cost) : '—'}</td>
                                                        <td className="text-right px-4 py-2.5 text-sm text-gray-400">{(row.meta_cost || 0) > 0 ? formatCurrency(row.meta_cost) : '—'}</td>
                                                        <td className="text-right px-4 py-2.5 text-sm text-gray-400">{row.amazon_cost > 0 ? formatCurrency(row.amazon_cost) : '—'}</td>
                                                        <td className="text-right px-4 py-2.5 text-sm text-gray-400">{row.rakuten_cost > 0 ? formatCurrency(row.rakuten_cost) : '—'}</td>
                                                        <td className="text-right px-4 py-2.5 text-sm text-gray-400">{row.yahoo_cost > 0 ? formatCurrency(row.yahoo_cost) : '—'}</td>
                                                        <td className="text-right px-4 py-2.5 text-sm text-gray-400">{row.other_cost > 0 ? formatCurrency(row.other_cost) : '—'}</td>
                                                        <td className="text-right px-4 py-2.5 text-sm font-bold text-emerald-700">{formatCurrency(total)}</td>
                                                        <td className="text-right px-4 py-2.5 text-sm font-semibold text-blue-700">{sales > 0 ? formatCurrency(sales) : '—'}</td>
                                                        <td className={`text-right px-4 py-2.5 text-sm font-medium ${adRatio > 30 ? 'text-red-600' : adRatio > 15 ? 'text-amber-600' : 'text-green-600'}`}>{sales > 0 ? `${adRatio.toFixed(1)}%` : '—'}</td>
                                                    </tr>
                                                )
                                            })
                                            const totalSalesAll = grandTotalSales
                                            const totalAdRatio = totalSalesAll > 0 ? (totalPlatformCost / totalSalesAll * 100) : 0
                                            return (
                                                <>
                                                    {rows}
                                                    <tr className="border-t-2 bg-gray-100 font-bold">
                                                        <td className="px-5 py-2.5 text-sm">合計</td>
                                                        <td className="text-right px-4 py-2.5 text-sm">{formatCurrency(platformCosts.google)}</td>
                                                        <td className="text-right px-4 py-2.5 text-sm">{platformCosts.meta > 0 ? formatCurrency(platformCosts.meta) : '—'}</td>
                                                        <td className="text-right px-4 py-2.5 text-sm">{platformCosts.amazon > 0 ? formatCurrency(platformCosts.amazon) : '—'}</td>
                                                        <td className="text-right px-4 py-2.5 text-sm">{platformCosts.rakuten > 0 ? formatCurrency(platformCosts.rakuten) : '—'}</td>
                                                        <td className="text-right px-4 py-2.5 text-sm">{platformCosts.yahoo > 0 ? formatCurrency(platformCosts.yahoo) : '—'}</td>
                                                        <td className="text-right px-4 py-2.5 text-sm">{platformCosts.other > 0 ? formatCurrency(platformCosts.other) : '—'}</td>
                                                        <td className="text-right px-4 py-2.5 text-sm font-bold text-emerald-700">{formatCurrency(totalPlatformCost)}</td>
                                                        <td className="text-right px-4 py-2.5 text-sm font-bold text-blue-700">{totalSalesAll > 0 ? formatCurrency(totalSalesAll) : '—'}</td>
                                                        <td className={`text-right px-4 py-2.5 text-sm font-bold ${totalAdRatio > 30 ? 'text-red-600' : totalAdRatio > 15 ? 'text-amber-600' : 'text-green-600'}`}>{totalSalesAll > 0 ? `${totalAdRatio.toFixed(1)}%` : '—'}</td>
                                                    </tr>
                                                </>
                                            )
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Google広告KPIカード + トレンド */}
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-4">
                        <KpiCard title="Google広告費" value={formatCurrency(totalCost)} icon={<DollarSign size={20} />} color="emerald" change={costChange} />
                        <KpiCard title="表示回数" value={formatNumber(totalImpressions)} icon={<Eye size={20} />} color="blue" subtitle={`CTR: ${formatPercent(avgCtr)}`} />
                        <KpiCard title="クリック数" value={formatNumber(totalClicks)} icon={<MousePointerClick size={20} />} color="purple" subtitle={`CPC: ${formatCurrency(avgCpc)}`} />
                        <KpiCard title="コンバージョン" value={totalConversions.toFixed(1)} icon={<Target size={20} />} color="orange" subtitle={`CVR: ${formatPercent(avgCvr)}`} />
                    </div>

                    {/* 月次トレンド */}
                    <div className="rounded-lg border bg-white p-3 lg:p-5">
                        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold lg:text-lg"><TrendingUp size={20} className="text-emerald-600" />月次Google広告費トレンド</h2>
                        <div className="flex h-40 items-end gap-1.5 lg:gap-2">
                            {monthlyTrend.map((m) => {
                                const maxCost = Math.max(...monthlyTrend.map(t => t.cost), 1)
                                const height = (m.cost / maxCost) * 100
                                const isCurrentMonth = m.month === month
                                return (
                                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                                        <span className="max-w-full truncate text-[10px] font-medium text-gray-500 lg:text-xs">{formatCurrency(m.cost)}</span>
                                        <div className={`w-full rounded-t-md transition-all ${isCurrentMonth ? 'bg-emerald-500' : 'bg-emerald-200'}`} style={{ height: `${Math.max(height, 2)}%` }} />
                                        <span className="text-xs text-gray-400">{m.month.split('-')[1]}月</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </>
            )}

            {/* ===== Google広告タブ ===== */}
            {activeTab === 'google' && (
                <>
                    {/* アクションボタン */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
                            <button onClick={handleSync} disabled={isSyncing}
                                className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-gray-400 lg:min-h-0 lg:px-4">
                                <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />{isSyncing ? '同期中...' : `${month}を同期`}
                            </button>
                            <button onClick={openImportPanel} disabled={assetGroups.length === 0}
                                className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors lg:min-h-0 lg:px-4 ${importedPlatforms.google ? 'bg-gray-100 text-gray-500 border border-gray-300' : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-400'}`}>
                                {importedPlatforms.google ? <><CheckCircle size={16} />マッチ済み</> : <><Download size={16} />商品マッチング</>}
                            </button>
                        </div>
                        {assetGroups.length > 0 && (
                            <button onClick={() => setShowGoogleChat(!showGoogleChat)}
                                className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:w-auto lg:min-h-0 ${showGoogleChat ? 'bg-violet-100 text-violet-700 border border-violet-300' : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:opacity-90'}`}>
                                <Sparkles size={16} /> {showGoogleChat ? 'AIチャットを閉じる' : 'AIに質問'}
                            </button>
                        )}
                    </div>
                    {isAnalyzing && aiTarget && (
                        <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700">
                            <RefreshCw size={15} className="animate-spin" />
                            {aiTarget} を分析中...
                        </div>
                    )}

                    {/* Google広告 KPIサマリー */}
                    {assetGroups.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5 lg:gap-3">
                            <div className="min-w-0 rounded-lg border bg-white p-3 lg:p-4">
                                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><DollarSign size={14} />広告費</div>
                                <div className="break-words text-lg font-bold text-emerald-700 lg:text-xl">{formatCurrency(totalCost)}</div>
                                {costChange !== null && (
                                    <div className={`text-[10px] flex items-center gap-0.5 mt-0.5 ${costChange >= 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                                        {costChange >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}{Math.abs(costChange).toFixed(1)}% 前月比
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0 rounded-lg border bg-white p-3 lg:p-4">
                                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><Eye size={14} />表示回数</div>
                                <div className="break-words text-lg font-bold text-blue-700 lg:text-xl">{formatNumber(totalImpressions)}</div>
                                <div className="text-[10px] text-gray-400">CTR: {formatPercent(avgCtr)}</div>
                            </div>
                            <div className="min-w-0 rounded-lg border bg-white p-3 lg:p-4">
                                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><MousePointerClick size={14} />クリック</div>
                                <div className="break-words text-lg font-bold text-purple-700 lg:text-xl">{formatNumber(totalClicks)}</div>
                                <div className="text-[10px] text-gray-400">CPC: {formatCurrency(avgCpc)}</div>
                            </div>
                            <div className="min-w-0 rounded-lg border bg-white p-3 lg:p-4">
                                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><Target size={14} />コンバージョン</div>
                                <div className="break-words text-lg font-bold text-orange-700 lg:text-xl">{totalConversions.toFixed(1)}</div>
                                <div className="text-[10px] text-gray-400">CVR: {formatPercent(avgCvr)}</div>
                            </div>
                            <div className="min-w-0 rounded-lg border bg-white p-3 lg:p-4">
                                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><TrendingUp size={14} />CPA</div>
                                <div className="break-words text-lg font-bold text-amber-700 lg:text-xl">{totalConversions > 0 ? formatCurrency(totalCost / totalConversions) : '—'}</div>
                                <div className="text-[10px] text-gray-400">CV値: {formatCurrency(totalConversionsValue)}</div>
                            </div>
                        </div>
                    )}

                    {/* 取り込みパネル */}
                    {showImportPanel && (
                        <div ref={importPanelRef} className="space-y-4 rounded-lg border-2 border-emerald-300 bg-white p-3 lg:space-y-5 lg:rounded-xl lg:p-6">
                            <div className="flex items-start justify-between gap-3">
                                <h2 className="flex items-start gap-2 text-base font-bold lg:items-center lg:text-lg"><Download className="shrink-0 text-emerald-600" size={22} />Google広告 商品マッチング — {month}</h2>
                                <button onClick={() => setShowImportPanel(false)} className="min-h-11 shrink-0 px-2 text-sm text-gray-500 hover:text-gray-700 lg:min-h-0 lg:px-0">閉じる</button>
                            </div>
                            <p className="text-sm text-gray-600">アセットグループ名と商品グループ（シリーズ）を紐付けます。変更後は「学習」で記憶。</p>
                            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
                                <div className="bg-gray-50 rounded-lg p-3 text-center"><div className="text-xs text-gray-500">合計</div><div className="text-xl font-bold">{mappingStats.total}件</div></div>
                                <div className="bg-green-50 rounded-lg p-3 text-center"><div className="text-xs text-gray-500">マッチ済み</div><div className="text-xl font-bold text-green-600">{mappingStats.matched}件</div></div>
                                <div className={`rounded-lg p-3 text-center ${mappingStats.unmatched > 0 ? 'bg-yellow-50' : 'bg-green-50'}`}><div className="text-xs text-gray-500">未マッチ</div><div className={`text-xl font-bold ${mappingStats.unmatched > 0 ? 'text-yellow-600' : 'text-green-600'}`}>{mappingStats.unmatched}件</div></div>
                                <div className="bg-emerald-50 rounded-lg p-3 text-center"><div className="text-xs text-gray-500">取り込み広告費</div><div className="text-xl font-bold text-emerald-700">{formatCurrency(mappingStats.totalCost)}</div></div>
                            </div>
                            <div className="overflow-x-auto rounded-lg border [scrollbar-width:thin]">
                                <table className="min-w-[760px] w-full lg:min-w-0">
                                    <thead><tr className="bg-gray-50 text-xs text-gray-500">
                                        <th className="text-left px-4 py-2 font-medium">広告名</th>
                                        <th className="text-right px-4 py-2 font-medium">広告費</th>
                                        <th className="text-left px-4 py-2 font-medium" style={{ minWidth: '250px' }}>商品グループ</th>
                                        <th className="text-center px-4 py-2 font-medium">状態</th>
                                        <th className="text-center px-4 py-2 font-medium">学習</th>
                                    </tr></thead>
                                    <tbody>
                                        {mappings.map((mapping, index) => (
                                            <tr key={mapping.asset_group_name} className={`border-t ${mapping.series_code !== null ? 'bg-white' : 'bg-yellow-50'}`}>
                                                <td className="px-4 py-3"><div className="text-sm font-medium">{mapping.asset_group_name}</div><div className="text-xs text-gray-400 mt-0.5">{formatNumber(mapping.impressions)}表示 / {formatNumber(mapping.clicks)}クリック</div></td>
                                                <td className="text-right px-4 py-3 text-sm font-semibold text-emerald-700">{formatCurrency(mapping.cost)}</td>
                                                <td className="px-4 py-3">
                                                    <select value={mapping.series_code?.toString() || ''} onChange={(e) => handleMappingChange(index, e.target.value)} className={`w-full p-2 border rounded-lg text-sm ${mapping.series_code !== null ? 'border-green-300 bg-green-50' : 'border-yellow-300 bg-yellow-50'}`}>
                                                        <option value="">-- 未選択 --</option>
                                                        {seriesOptions.map(s => (<option key={s.series_code} value={s.series_code.toString()}>{s.series_code}: {s.series_name}</option>))}
                                                    </select>
                                                </td>
                                                <td className="text-center px-4 py-3">
                                                    {mapping.isLearned ? <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full"><Check size={12} />学習済み</span>
                                                        : mapping.series_code !== null ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">確認済み</span>
                                                            : <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full"><AlertCircle size={12} />未設定</span>}
                                                </td>
                                                <td className="text-center px-4 py-3">
                                                    {mapping.series_code !== null && !mapping.isLearned && (
                                                        <button onClick={() => handleLearnMapping(index)} disabled={savingMapping === mapping.asset_group_name} className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"><Save size={12} />{savingMapping === mapping.asset_group_name ? '...' : '学習'}</button>
                                                    )}
                                                    {mapping.isLearned && <Check size={16} className="text-green-500 mx-auto" />}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {importResult && (<div className={`px-4 py-3 rounded-lg text-sm whitespace-pre-line ${importResult.includes('エラー') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{importResult}</div>)}
                            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                                {mappings.some(m => !m.isLearned && m.series_code !== null) && (
                                    <button onClick={handleLearnAll} className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-blue-300 px-4 py-2.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 lg:min-h-0"><Save size={16} />一括学習</button>
                                )}
                                <div className="flex-1" />
                                <button onClick={() => setShowImportPanel(false)} className="min-h-11 rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 lg:min-h-0">キャンセル</button>
                                <button onClick={handleImportCosts} disabled={isImporting || mappingStats.matched === 0} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:bg-gray-400 lg:min-h-0 lg:px-6"><ArrowRight size={16} />{isImporting ? '取り込み中...' : `広告費を取り込み（${mappingStats.matched}件 / ${formatCurrency(mappingStats.totalCost)}）`}</button>
                            </div>
                        </div>
                    )}

                    {/* AIチャットウィンドウ（Google広告） */}
                    {showGoogleChat && (
                        <AdChatWindow
                            platform="google"
                            context={getGoogleChatContext()}
                            analysisResult={googleAnalysisResult}
                            onClose={() => setShowGoogleChat(false)}
                        />
                    )}

                    {/* Google広告 シリーズ別パフォーマンス */}
                    <div className="bg-white border rounded-lg overflow-hidden">
                        <div className="border-b p-3 lg:p-5"><h2 className="flex items-center gap-2 text-base font-semibold lg:text-lg"><Zap size={20} className="text-amber-500" />シリーズ別パフォーマンス — {month}</h2></div>
                        <div className="overflow-x-auto [scrollbar-width:thin]">
                            <table className="min-w-[920px] w-full lg:min-w-0" style={{ tableLayout: 'fixed' }}>
                                <colgroup>
                                    <col style={{ width: '22%' }} />
                                    <col style={{ width: '10%' }} />
                                    <col style={{ width: '10%' }} />
                                    <col style={{ width: '9%' }} />
                                    <col style={{ width: '8%' }} />
                                    <col style={{ width: '8%' }} />
                                    <col style={{ width: '8%' }} />
                                    <col style={{ width: '8%' }} />
                                    <col style={{ width: '5%' }} />
                                </colgroup>
                                <thead>
                                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                                        <th className="text-left px-5 py-3 font-medium">シリーズ / アセットグループ</th>
                                        <th className="text-right px-4 py-3 font-medium">広告費</th>
                                        <th className="text-right px-4 py-3 font-medium">表示</th>
                                        <th className="text-right px-4 py-3 font-medium">クリック</th>
                                        <th className="text-right px-4 py-3 font-medium">CTR</th>
                                        <th className="text-right px-4 py-3 font-medium">CPC</th>
                                        <th className="text-right px-4 py-3 font-medium">CV</th>
                                        <th className="text-right px-4 py-3 font-medium">CVR</th>
                                        <th className="text-center px-2 py-3 font-medium">AI</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {seriesSummary().map(([seriesCode, data]) => {
                                        const seriesName = seriesCode === 0 ? '未分類' : seriesMap.get(seriesCode) || `シリーズ ${seriesCode}`
                                        const ctr = data.impressions > 0 ? (data.clicks / data.impressions * 100) : 0
                                        const cpc = data.clicks > 0 ? (data.cost / data.clicks) : 0
                                        const cvr = data.clicks > 0 ? (data.conversions / data.clicks * 100) : 0

                                        const isExpanded = expandedSeries.has(seriesCode)
                                        const hasMultipleGroups = data.groups.length > 1
                                        return (
                                            <React.Fragment key={`series-block-${seriesCode}`}>
                                                <tr className="border-b hover:bg-gray-50 cursor-pointer font-medium" onClick={() => hasMultipleGroups && toggleSeries(seriesCode)}>
                                                    <td className="px-5 py-3">
                                                        <div className="flex items-center gap-2">
                                                            {hasMultipleGroups && (isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />)}
                                                            <span className={`inline-block w-2 h-2 rounded-full ${data.cost > 10000 ? 'bg-emerald-500' : data.cost > 1000 ? 'bg-yellow-400' : 'bg-gray-300'}`} />
                                                            {seriesName}
                                                            {hasMultipleGroups && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{data.groups.length}</span>}
                                                        </div>
                                                    </td>
                                                    <td className="text-right px-4 py-3 text-emerald-700 font-semibold">{formatCurrency(data.cost)}</td>
                                                    <td className="text-right px-4 py-3">{formatNumber(data.impressions)}</td>
                                                    <td className="text-right px-4 py-3">{formatNumber(data.clicks)}</td>
                                                    <td className="text-right px-4 py-3">{formatPercent(ctr)}</td>
                                                    <td className="text-right px-4 py-3">{formatCurrency(cpc)}</td>
                                                    <td className="text-right px-4 py-3 font-medium">{data.conversions.toFixed(1)}</td>
                                                    <td className="text-right px-4 py-3">{formatPercent(cvr)}</td>
                                                    <td className="text-center px-2 py-3">
                                                        {data.groups.length === 1 && (
                                                            <button onClick={(e) => { e.stopPropagation(); handleAiAnalysis(data.groups[0].asset_group_name) }}
                                                                disabled={isAnalyzing} title={`「${data.groups[0].asset_group_name}」をAI分析`}
                                                                className="p-1.5 rounded-lg hover:bg-violet-100 text-violet-500 hover:text-violet-700 disabled:text-gray-300 transition-colors">
                                                                <Brain size={14} />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                                {isExpanded && data.groups.map(g => {
                                                    const gCtr = g.total_impressions > 0 ? (g.total_clicks / g.total_impressions * 100) : 0
                                                    const gCpc = g.total_clicks > 0 ? (g.total_cost / g.total_clicks) : 0
                                                    const gCvr = g.total_clicks > 0 ? (g.total_conversions / g.total_clicks * 100) : 0

                                                    return (
                                                        <tr key={`${g.campaign_name}-${g.asset_group_name}`} className="border-b bg-gray-50/50 text-sm text-gray-600">
                                                            <td className="px-5 py-2 pl-12"><span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${g.asset_group_status === 'ENABLED' ? 'bg-green-400' : 'bg-gray-300'}`} />{g.asset_group_name}</td>
                                                            <td className="text-right px-4 py-2">{formatCurrency(g.total_cost)}</td>
                                                            <td className="text-right px-4 py-2">{formatNumber(g.total_impressions)}</td>
                                                            <td className="text-right px-4 py-2">{formatNumber(g.total_clicks)}</td>
                                                            <td className="text-right px-4 py-2">{formatPercent(gCtr)}</td>
                                                            <td className="text-right px-4 py-2">{formatCurrency(gCpc)}</td>
                                                            <td className="text-right px-4 py-2">{g.total_conversions.toFixed(1)}</td>
                                                            <td className="text-right px-4 py-2">{formatPercent(gCvr)}</td>
                                                            <td className="text-center px-2 py-2">
                                                                <button onClick={() => handleAiAnalysis(g.asset_group_name)}
                                                                    disabled={isAnalyzing} title={`「${g.asset_group_name}」をAI分析`}
                                                                    className="p-1 rounded hover:bg-violet-100 text-violet-400 hover:text-violet-700 disabled:text-gray-300 transition-colors">
                                                                    <Brain size={12} />
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </React.Fragment>
                                        )
                                    })}
                                    <tr className="bg-gray-100 font-bold border-t-2">
                                        <td className="px-5 py-3">合計</td>
                                        <td className="text-right px-4 py-3 text-emerald-700">{formatCurrency(totalCost)}</td>
                                        <td className="text-right px-4 py-3">{formatNumber(totalImpressions)}</td>
                                        <td className="text-right px-4 py-3">{formatNumber(totalClicks)}</td>
                                        <td className="text-right px-4 py-3">{formatPercent(avgCtr)}</td>
                                        <td className="text-right px-4 py-3">{formatCurrency(avgCpc)}</td>
                                        <td className="text-right px-4 py-3">{totalConversions.toFixed(1)}</td>
                                        <td className="text-right px-4 py-3">{formatPercent(avgCvr)}</td>
                                        <td></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>


                </>
            )}

            {/* ===== Metaタブ ===== */}
            {activeTab === 'meta' && (
                <div className="min-w-0 overflow-x-auto lg:overflow-visible">
                    <MetaTab month={month} />
                </div>
            )}

            {/* ===== 楽天タブ ===== */}
            {activeTab === 'rakuten' && (
                <div className="min-w-0 overflow-x-auto lg:overflow-visible">
                    <RakutenTab month={month} />
                </div>
            )}

            {/* ===== 楽天サーチ申請タブ ===== */}
            {activeTab === 'rakuten-search' && (
                <div className="min-w-0 overflow-x-auto lg:overflow-visible">
                    <RakutenSearchRequestTab />
                </div>
            )}

            {/* ===== Yahoo!タブ ===== */}
            {activeTab === 'yahoo' && (
                <div className="min-w-0 overflow-x-auto lg:overflow-visible">
                    <YahooTab month={month} />
                </div>
            )}

            {activeTab === 'amazon' && (
                <div className="min-w-0 overflow-x-auto lg:overflow-visible">
                    <AmazonTab month={month} />
                </div>
            )}

            {/* ===== LP計測タブ ===== */}
            {activeTab === 'lp-tracking' && (
                <div className="min-w-0 overflow-x-auto lg:overflow-visible">
                    <LpTrackingInlineTab />
                </div>
            )}


        </div>
    )
}

// ===== KPIカード =====
function KpiCard({ title, value, icon, color, subtitle, change }: {
    title: string; value: string; icon: React.ReactNode; color: string; subtitle?: string; change?: number | null
}) {
    const colorMap: Record<string, { bg: string, text: string, icon: string, border: string }> = {
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'text-emerald-500', border: 'border-emerald-200' },
        blue: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-500', border: 'border-blue-200' },
        purple: { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-500', border: 'border-purple-200' },
        orange: { bg: 'bg-orange-50', text: 'text-orange-700', icon: 'text-orange-500', border: 'border-orange-200' },
    }
    const c = colorMap[color] || colorMap.emerald
    return (
        <div className={`${c.bg} border ${c.border} min-w-0 rounded-lg p-3 transition-transform hover:scale-[1.02] lg:rounded-xl lg:p-4`}>
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{title}</span>
                <span className={c.icon}>{icon}</span>
            </div>
            <div className={`break-words text-lg font-bold sm:text-xl lg:text-2xl ${c.text}`}>{value}</div>
            <div className="flex items-center gap-2 mt-1">
                {subtitle && <span className="text-xs text-gray-500">{subtitle}</span>}
                {change !== undefined && change !== null && (
                    <span className={`text-xs flex items-center gap-0.5 ${change >= 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                        {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{Math.abs(change).toFixed(1)}% 前月比
                    </span>
                )}
            </div>
        </div>
    )
}
