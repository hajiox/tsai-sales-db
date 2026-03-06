// /app/web-sales/advertising/page.client.tsx ver.3
// 統合広告管理ダッシュボード — 複数プラットフォーム対応 + AI分析機能
"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"
import {
    ArrowLeft, RefreshCw, TrendingUp, TrendingDown,
    DollarSign, Eye, MousePointerClick, Target,
    BarChart3, Zap, ChevronDown, ChevronUp,
    Download, Check, Save, AlertCircle, ArrowRight,
    Brain, Sparkles, LayoutDashboard, CheckCircle
} from "lucide-react"

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
    amazon: number
    rakuten: number
    yahoo: number
    other: number
}

interface AdCostRow {
    series_code: number
    google_cost: number
    amazon_cost: number
    rakuten_cost: number
    yahoo_cost: number
    other_cost: number
}

type TabType = 'overview' | 'google'

// ===== メインコンポーネント =====
export default function AdvertisingDashboard() {
    const router = useRouter()
    const supabase = getSupabaseBrowserClient()

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

    // 広告費取り込み関連
    const [showImportPanel, setShowImportPanel] = useState(false)
    const importPanelRef = useRef<HTMLDivElement>(null)
    const [mappings, setMappings] = useState<MappingItem[]>([])
    const [isImporting, setIsImporting] = useState(false)
    const [importResult, setImportResult] = useState<string | null>(null)
    const [savingMapping, setSavingMapping] = useState<string | null>(null)

    // プラットフォーム別広告費
    const [platformCosts, setPlatformCosts] = useState<PlatformCosts>({ google: 0, amazon: 0, rakuten: 0, yahoo: 0, other: 0 })
    const [seriesAdCosts, setSeriesAdCosts] = useState<AdCostRow[]>([])

    // AI分析
    const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [aiTarget, setAiTarget] = useState<string | null>(null)
    // 取り込み済み状態
    const [isImported, setIsImported] = useState(false)

    // データ取得
    const fetchData = useCallback(async () => {
        setIsLoading(true)
        try {
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
                .select('series_code, google_cost, amazon_cost, rakuten_cost, yahoo_cost, other_cost')
                .eq('report_month', `${month}-01`)

            if (adCostData) {
                setSeriesAdCosts(adCostData as AdCostRow[])
                const pCosts = { google: 0, amazon: 0, rakuten: 0, yahoo: 0, other: 0 }
                adCostData.forEach((r: any) => {
                    pCosts.google += r.google_cost || 0
                    pCosts.amazon += r.amazon_cost || 0
                    pCosts.rakuten += r.rakuten_cost || 0
                    pCosts.yahoo += r.yahoo_cost || 0
                    pCosts.other += r.other_cost || 0
                })
                setPlatformCosts(pCosts)
            }

            // 広告費取り込み済みチェック
            if (adCostData && adCostData.some((r: any) => (r.google_cost || 0) > 0)) {
                setIsImported(true)
            } else {
                setIsImported(false)
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

    // 手動同期
    const handleSync = async () => {
        setIsSyncing(true); setSyncResult(null)
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
            if (data.success) { setSyncResult(`${month} のデータを同期しました（${data.inserted}件）`); await fetchData() }
            else { setSyncResult(`同期エラー: ${data.error}`) }
        } catch (error: any) { setSyncResult(`同期エラー: ${error.message}`) }
        finally { setIsSyncing(false) }
    }

    // ===== 広告費取り込み =====
    const openImportPanel = async () => {
        setShowImportPanel(true); setImportResult(null)
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
            const { error } = await supabase.from('google_ads_series_mapping').upsert({ asset_group_name: mapping.asset_group_name, series_code: mapping.series_code }, { onConflict: 'asset_group_name' })
            if (error) throw error
            await supabase.from('google_ads_performance').update({ series_code: mapping.series_code }).eq('asset_group_name', mapping.asset_group_name)
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

    // ===== AI分析 =====
    const handleAiAnalysis = async (assetGroupName?: string) => {
        setIsAnalyzing(true); setAiAnalysis(null)
        setAiTarget(assetGroupName || null)
        try {
            const body: any = { month }
            if (assetGroupName) body.assetGroupName = assetGroupName
            const res = await fetch('/api/google-ads/ai-analysis', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const data = await res.json()
            if (data.success) { setAiAnalysis(data.analysis) }
            else { setAiAnalysis(`分析エラー: ${data.error}`) }
        } catch (error: any) { setAiAnalysis(`分析エラー: ${error.message}`) }
        finally { setIsAnalyzing(false) }
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
    const totalPlatformCost = platformCosts.google + platformCosts.amazon + platformCosts.rakuten + platformCosts.yahoo + platformCosts.other

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
    const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
        { id: 'overview', label: '概要', icon: <LayoutDashboard size={16} /> },
        { id: 'google', label: 'Google広告', icon: <span className="text-xs font-bold">G</span> },
    ]

    return (
        <div className="w-full space-y-5">
            {/* ヘッダー */}
            <header>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={() => router.push('/web-sales/dashboard')} className="p-2 rounded-lg hover:bg-gray-100 transition-colors"><ArrowLeft size={20} /></button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                                <BarChart3 className="text-emerald-600" size={28} />
                                広告管理システム
                            </h1>
                            <p className="text-gray-500 text-sm">Google / Meta / Amazon / 楽天 / Yahoo 広告の統合管理</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {lastSyncTime && <span className="text-xs text-gray-400">最終同期: {lastSyncTime}</span>}
                        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                </div>

                {syncResult && (<div className={`mt-3 px-4 py-2 rounded-lg text-sm ${syncResult.includes('エラー') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{syncResult}</div>)}
            </header>

            {/* タブナビゲーション */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        {tab.icon}{tab.label}
                    </button>
                ))}
                {/* 将来のプラットフォーム（グレーアウト） */}
                {['Meta', 'Amazon', '楽天', 'Yahoo'].map(name => (
                    <button key={name} disabled className="flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium text-gray-300 cursor-not-allowed">
                        {name}<span className="text-[10px] bg-gray-200 text-gray-400 px-1.5 py-0.5 rounded">準備中</span>
                    </button>
                ))}
            </div>

            {/* ===== 概要タブ ===== */}
            {activeTab === 'overview' && (
                <>
                    {/* プラットフォーム別広告費カード */}
                    <div className="bg-white border rounded-xl p-5">
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <DollarSign className="text-emerald-600" size={20} />
                            プラットフォーム別広告費 — {month}
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                            {[
                                { name: 'Google', cost: platformCosts.google, color: 'emerald', active: true },
                                { name: 'Amazon', cost: platformCosts.amazon, color: 'orange', active: false },
                                { name: '楽天', cost: platformCosts.rakuten, color: 'red', active: false },
                                { name: 'Yahoo', cost: platformCosts.yahoo, color: 'purple', active: false },
                                { name: 'その他', cost: platformCosts.other, color: 'gray', active: false },
                                { name: '合計', cost: totalPlatformCost, color: 'blue', active: true },
                            ].map(p => (
                                <div key={p.name} className={`rounded-lg p-3 border ${p.active ? 'bg-white' : 'bg-gray-50'}`}>
                                    <div className="text-xs text-gray-500 mb-1">{p.name}</div>
                                    <div className={`text-lg font-bold ${p.cost > 0 ? `text-${p.color}-700` : 'text-gray-300'}`}>
                                        {p.cost > 0 ? formatCurrency(p.cost) : '—'}
                                    </div>
                                    {totalPlatformCost > 0 && p.name !== '合計' && p.cost > 0 && (
                                        <div className="text-[10px] text-gray-400 mt-0.5">{(p.cost / totalPlatformCost * 100).toFixed(1)}%</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* シリーズ別広告費内訳 */}
                    {seriesAdCosts.length > 0 && (
                        <div className="bg-white border rounded-xl overflow-hidden">
                            <div className="p-5 border-b">
                                <h2 className="text-lg font-semibold flex items-center gap-2">
                                    <Zap size={20} className="text-amber-500" />
                                    シリーズ別広告費内訳 — {month}
                                </h2>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="bg-gray-50 text-xs text-gray-500">
                                            <th className="text-left px-5 py-3 font-medium">シリーズ</th>
                                            <th className="text-right px-4 py-3 font-medium">Google</th>
                                            <th className="text-right px-4 py-3 font-medium">Amazon</th>
                                            <th className="text-right px-4 py-3 font-medium">楽天</th>
                                            <th className="text-right px-4 py-3 font-medium">Yahoo</th>
                                            <th className="text-right px-4 py-3 font-medium">その他</th>
                                            <th className="text-right px-4 py-3 font-medium font-bold">合計</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {seriesAdCosts.sort((a, b) => (b.google_cost + b.amazon_cost + b.rakuten_cost + b.yahoo_cost + b.other_cost) - (a.google_cost + a.amazon_cost + a.rakuten_cost + a.yahoo_cost + a.other_cost)).map(row => {
                                            const total = (row.google_cost || 0) + (row.amazon_cost || 0) + (row.rakuten_cost || 0) + (row.yahoo_cost || 0) + (row.other_cost || 0)
                                            if (total === 0) return null
                                            return (
                                                <tr key={row.series_code} className="border-t hover:bg-gray-50">
                                                    <td className="px-5 py-2.5 text-sm font-medium">{seriesMap.get(row.series_code) || `シリーズ${row.series_code}`}</td>
                                                    <td className="text-right px-4 py-2.5 text-sm">{row.google_cost > 0 ? formatCurrency(row.google_cost) : '—'}</td>
                                                    <td className="text-right px-4 py-2.5 text-sm text-gray-400">{row.amazon_cost > 0 ? formatCurrency(row.amazon_cost) : '—'}</td>
                                                    <td className="text-right px-4 py-2.5 text-sm text-gray-400">{row.rakuten_cost > 0 ? formatCurrency(row.rakuten_cost) : '—'}</td>
                                                    <td className="text-right px-4 py-2.5 text-sm text-gray-400">{row.yahoo_cost > 0 ? formatCurrency(row.yahoo_cost) : '—'}</td>
                                                    <td className="text-right px-4 py-2.5 text-sm text-gray-400">{row.other_cost > 0 ? formatCurrency(row.other_cost) : '—'}</td>
                                                    <td className="text-right px-4 py-2.5 text-sm font-bold text-emerald-700">{formatCurrency(total)}</td>
                                                </tr>
                                            )
                                        })}
                                        <tr className="border-t-2 bg-gray-100 font-bold">
                                            <td className="px-5 py-2.5 text-sm">合計</td>
                                            <td className="text-right px-4 py-2.5 text-sm">{formatCurrency(platformCosts.google)}</td>
                                            <td className="text-right px-4 py-2.5 text-sm">{platformCosts.amazon > 0 ? formatCurrency(platformCosts.amazon) : '—'}</td>
                                            <td className="text-right px-4 py-2.5 text-sm">{platformCosts.rakuten > 0 ? formatCurrency(platformCosts.rakuten) : '—'}</td>
                                            <td className="text-right px-4 py-2.5 text-sm">{platformCosts.yahoo > 0 ? formatCurrency(platformCosts.yahoo) : '—'}</td>
                                            <td className="text-right px-4 py-2.5 text-sm">{platformCosts.other > 0 ? formatCurrency(platformCosts.other) : '—'}</td>
                                            <td className="text-right px-4 py-2.5 text-sm font-bold text-emerald-700">{formatCurrency(totalPlatformCost)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Google広告KPIカード + トレンド */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <KpiCard title="Google広告費" value={formatCurrency(totalCost)} icon={<DollarSign size={20} />} color="emerald" change={costChange} />
                        <KpiCard title="表示回数" value={formatNumber(totalImpressions)} icon={<Eye size={20} />} color="blue" subtitle={`CTR: ${formatPercent(avgCtr)}`} />
                        <KpiCard title="クリック数" value={formatNumber(totalClicks)} icon={<MousePointerClick size={20} />} color="purple" subtitle={`CPC: ${formatCurrency(avgCpc)}`} />
                        <KpiCard title="コンバージョン" value={totalConversions.toFixed(1)} icon={<Target size={20} />} color="orange" subtitle={`CVR: ${formatPercent(avgCvr)}`} />
                    </div>

                    {/* 月次トレンド */}
                    <div className="bg-white border rounded-lg p-5">
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><TrendingUp size={20} className="text-emerald-600" />月次Google広告費トレンド</h2>
                        <div className="flex items-end gap-2 h-40">
                            {monthlyTrend.map((m) => {
                                const maxCost = Math.max(...monthlyTrend.map(t => t.cost), 1)
                                const height = (m.cost / maxCost) * 100
                                const isCurrentMonth = m.month === month
                                return (
                                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                                        <span className="text-xs text-gray-500 font-medium">{formatCurrency(m.cost)}</span>
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
                    <div className="flex gap-3">
                        <button onClick={handleSync} disabled={isSyncing}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors text-sm font-medium">
                            <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />{isSyncing ? '同期中...' : `${month}を同期`}
                        </button>
                        <button onClick={openImportPanel} disabled={assetGroups.length === 0}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${isImported ? 'bg-gray-100 text-gray-500 border border-gray-300' : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-400'}`}>
                            {isImported ? <><CheckCircle size={16} />取り込み済み</> : <><Download size={16} />広告費取り込み</>}
                        </button>
                        <button onClick={() => handleAiAnalysis()} disabled={isAnalyzing || assetGroups.length === 0}
                            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:bg-gray-400 transition-colors text-sm font-medium">
                            <Brain size={16} className={isAnalyzing && !aiTarget ? 'animate-pulse' : ''} />{isAnalyzing && !aiTarget ? '分析中...' : 'AI分析'}
                        </button>
                    </div>

                    {/* 取り込みパネル */}
                    {showImportPanel && (
                        <div ref={importPanelRef} className="bg-white border-2 border-emerald-300 rounded-xl p-6 space-y-5">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-bold flex items-center gap-2"><Download className="text-emerald-600" size={22} />Google広告費取り込み — {month}</h2>
                                <button onClick={() => setShowImportPanel(false)} className="text-gray-400 hover:text-gray-600 text-sm">閉じる</button>
                            </div>
                            <p className="text-sm text-gray-600">アセットグループ名と商品グループ（シリーズ）を紐付けます。変更後は「学習」で記憶。</p>
                            <div className="grid grid-cols-4 gap-3">
                                <div className="bg-gray-50 rounded-lg p-3 text-center"><div className="text-xs text-gray-500">合計</div><div className="text-xl font-bold">{mappingStats.total}件</div></div>
                                <div className="bg-green-50 rounded-lg p-3 text-center"><div className="text-xs text-gray-500">マッチ済み</div><div className="text-xl font-bold text-green-600">{mappingStats.matched}件</div></div>
                                <div className={`rounded-lg p-3 text-center ${mappingStats.unmatched > 0 ? 'bg-yellow-50' : 'bg-green-50'}`}><div className="text-xs text-gray-500">未マッチ</div><div className={`text-xl font-bold ${mappingStats.unmatched > 0 ? 'text-yellow-600' : 'text-green-600'}`}>{mappingStats.unmatched}件</div></div>
                                <div className="bg-emerald-50 rounded-lg p-3 text-center"><div className="text-xs text-gray-500">取り込み広告費</div><div className="text-xl font-bold text-emerald-700">{formatCurrency(mappingStats.totalCost)}</div></div>
                            </div>
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full">
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
                            <div className="flex gap-3">
                                {mappings.some(m => !m.isLearned && m.series_code !== null) && (
                                    <button onClick={handleLearnAll} className="flex items-center gap-2 px-4 py-2.5 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium"><Save size={16} />一括学習</button>
                                )}
                                <div className="flex-1" />
                                <button onClick={() => setShowImportPanel(false)} className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">キャンセル</button>
                                <button onClick={handleImportCosts} disabled={isImporting || mappingStats.matched === 0} className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-400 transition-colors text-sm font-medium"><ArrowRight size={16} />{isImporting ? '取り込み中...' : `広告費を取り込み（${mappingStats.matched}件 / ${formatCurrency(mappingStats.totalCost)}）`}</button>
                            </div>
                        </div>
                    )}

                    {/* AI分析結果パネル（Googleタブ内） */}
                    {(aiAnalysis || isAnalyzing) && (
                        <div className="bg-white border-2 border-violet-200 rounded-xl overflow-hidden">
                            <div className="bg-gradient-to-r from-violet-50 to-blue-50 p-4 border-b border-violet-200 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="text-violet-600" size={20} />
                                    <h2 className="font-bold text-gray-900">
                                        AI分析 — {aiTarget ? `「${aiTarget}」` : 'Google広告全体'}
                                    </h2>
                                    <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">Gemini 2.5 Flash</span>
                                </div>
                                <button onClick={() => { setAiAnalysis(null); setAiTarget(null) }} className="text-gray-400 hover:text-gray-600 text-sm">閉じる</button>
                            </div>
                            {isAnalyzing && (
                                <div className="flex items-center gap-3 py-10 justify-center">
                                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-300 border-t-violet-600" />
                                    <span className="text-violet-700 font-medium">{aiTarget ? `「${aiTarget}」を分析中...` : '全体データを分析中...'}</span>
                                </div>
                            )}
                            {aiAnalysis && (
                                <div className="p-6">
                                    <div className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-p:text-gray-700">
                                        {aiAnalysis.split('\n').map((line, i) => {
                                            if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-bold mt-6 mb-3 pb-2 border-b border-gray-100">{line.replace('## ', '')}</h2>
                                            if (line.startsWith('### ')) return <h3 key={i} className="text-base font-semibold mt-4 mb-2">{line.replace('### ', '')}</h3>
                                            if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 mb-1 text-sm leading-relaxed">{line.replace(/^[-*]\s/, '')}</li>
                                            if (line.startsWith('**') && line.endsWith('**')) return <p key={i} className="font-semibold text-sm my-2">{line.replace(/\*\*/g, '')}</p>
                                            if (line.trim() === '') return <br key={i} />
                                            return <p key={i} className="text-sm leading-relaxed mb-2">{line}</p>
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Google広告 シリーズ別パフォーマンス */}
                    <div className="bg-white border rounded-lg overflow-hidden">
                        <div className="p-5 border-b"><h2 className="text-lg font-semibold flex items-center gap-2"><Zap size={20} className="text-amber-500" />シリーズ別パフォーマンス — {month}</h2></div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                                        <th className="text-left px-5 py-3 font-medium min-w-[180px]">シリーズ / アセットグループ</th>
                                        <th className="text-right px-4 py-3 font-medium min-w-[90px]">広告費</th>
                                        <th className="text-right px-4 py-3 font-medium min-w-[80px]">表示</th>
                                        <th className="text-right px-4 py-3 font-medium min-w-[70px]">クリック</th>
                                        <th className="text-right px-4 py-3 font-medium min-w-[60px]">CTR</th>
                                        <th className="text-right px-4 py-3 font-medium min-w-[70px]">CPC</th>
                                        <th className="text-right px-4 py-3 font-medium min-w-[60px]">CV</th>
                                        <th className="text-right px-4 py-3 font-medium min-w-[60px]">CVR</th>
                                        <th className="text-right px-4 py-3 font-medium min-w-[80px]">CV値</th>
                                        <th className="text-right px-4 py-3 font-medium min-w-[70px]">ROAS</th>
                                        <th className="text-center px-2 py-3 font-medium min-w-[40px]">AI</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {seriesSummary().map(([seriesCode, data]) => {
                                        const seriesName = seriesCode === 0 ? '未分類' : seriesMap.get(seriesCode) || `シリーズ ${seriesCode}`
                                        const ctr = data.impressions > 0 ? (data.clicks / data.impressions * 100) : 0
                                        const cpc = data.clicks > 0 ? (data.cost / data.clicks) : 0
                                        const cvr = data.clicks > 0 ? (data.conversions / data.clicks * 100) : 0
                                        const roas = data.cost > 0 ? (data.conversionsValue / data.cost * 100) : 0
                                        const isExpanded = expandedSeries.has(seriesCode)
                                        const hasMultipleGroups = data.groups.length > 1
                                        return (
                                            <tbody key={`series-block-${seriesCode}`}>
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
                                                    <td className="text-right px-4 py-3">{formatCurrency(data.conversionsValue)}</td>
                                                    <td className={`text-right px-4 py-3 font-semibold ${roas >= 100 ? 'text-emerald-600' : 'text-red-500'}`}>{roas.toFixed(0)}%</td>
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
                                                    const gRoas = g.total_cost > 0 ? (g.total_conversions_value / g.total_cost * 100) : 0
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
                                                            <td className="text-right px-4 py-2">{formatCurrency(g.total_conversions_value)}</td>
                                                            <td className={`text-right px-4 py-2 ${gRoas >= 100 ? 'text-emerald-600' : 'text-red-500'}`}>{gRoas.toFixed(0)}%</td>
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
                                            </tbody>
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
                                        <td className="text-right px-4 py-3">{formatCurrency(totalConversionsValue)}</td>
                                        <td className={`text-right px-4 py-3 ${totalCost > 0 ? (totalConversionsValue / totalCost * 100 >= 100 ? 'text-emerald-600' : 'text-red-500') : ''}`}>{totalCost > 0 ? `${(totalConversionsValue / totalCost * 100).toFixed(0)}%` : '—'}</td>
                                        <td></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
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
        <div className={`${c.bg} border ${c.border} rounded-xl p-4 transition-transform hover:scale-[1.02]`}>
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{title}</span>
                <span className={c.icon}>{icon}</span>
            </div>
            <div className={`text-2xl font-bold ${c.text}`}>{value}</div>
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
