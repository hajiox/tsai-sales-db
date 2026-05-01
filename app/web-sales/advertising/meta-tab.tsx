// /app/web-sales/advertising/meta-tab.tsx
// Meta広告タブコンポーネント — CSV取り込み、パフォーマンス表示、AI分析
"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"
import {
    Upload, Download, RefreshCw, Brain, Save,
    CheckCircle, AlertCircle, ChevronDown, ChevronUp,
    TrendingUp, Eye, MousePointerClick, Target, DollarSign,
    FileText, ExternalLink, Trash2, Sparkles
} from "lucide-react"
import AdChatWindow from "@/components/AdChatWindow"

interface MetaAdSet {
    id: number
    report_month: string
    campaign_name: string
    ad_set_name: string
    delivery: string
    results: number
    cost_per_result: number
    amount_spent: number
    impressions: number
    reach: number
    frequency: number
    cpm: number
    clicks: number
    link_clicks: number
    ctr: number
    cpc: number
    series_code: number | null
}

interface SeriesOption {
    series_code: number
    series_name: string
}

interface Props {
    month: string
}

export default function MetaTab({ month }: Props) {
    const supabase = getSupabaseBrowserClient()

    const [metaData, setMetaData] = useState<MetaAdSet[]>([])
    const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([])
    const [seriesMap, setSeriesMap] = useState<Map<number, string>>(new Map())
    const [isLoading, setIsLoading] = useState(true)
    const [isUploading, setIsUploading] = useState(false)
    const [isImporting, setIsImporting] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [uploadResult, setUploadResult] = useState<string | null>(null)
    const [importResult, setImportResult] = useState<string | null>(null)
    const [showChat, setShowChat] = useState(false)
    const [mappingChanges, setMappingChanges] = useState<Map<number, number | null>>(new Map())
    const [isAutoMatching, setIsAutoMatching] = useState(false)
    const [autoMatchResult, setAutoMatchResult] = useState<string | null>(null)
    const [isCostImported, setIsCostImported] = useState(false)
    const [matchSourceMap, setMatchSourceMap] = useState<Map<string, string>>(new Map()) // ad_set_name -> source
    const fileInputRef = useRef<HTMLInputElement>(null)

    // データ取得
    const fetchData = useCallback(async () => {
        setIsLoading(true)
        try {
            const [{ data: metaRows }, { data: products }] = await Promise.all([
                supabase.from('meta_ads_performance').select('*').eq('report_month', month).order('amount_spent', { ascending: false }),
                supabase.from('products').select('series_code, series').not('series_code', 'is', null),
            ])

            setMetaData(metaRows || [])

            const sMap = new Map<number, string>()
            const sOpts: SeriesOption[] = []
            const seen = new Set<number>()
            products?.forEach((p: any) => {
                if (p.series_code && !seen.has(p.series_code)) {
                    seen.add(p.series_code)
                    sMap.set(p.series_code, p.series)
                    sOpts.push({ series_code: p.series_code, series_name: p.series })
                }
            })
            setSeriesMap(sMap)
            setSeriesOptions(sOpts.sort((a, b) => a.series_code - b.series_code))
        } catch (err) {
            console.error('Meta データ取得エラー:', err)
        }

        // 取り込み済みチェック
        const reportMonth = `${month}-01`
        const { data: adCostData } = await supabase
            .from('advertising_costs')
            .select('meta_cost')
            .eq('report_month', reportMonth)
        setIsCostImported(adCostData?.some((r: any) => (r.meta_cost || 0) > 0) || false)

        // マッチソース取得
        const { data: mappingSources } = await supabase
            .from('meta_adset_series_map')
            .select('ad_set_name, source')
        const srcMap = new Map<string, string>()
        mappingSources?.forEach((m: any) => srcMap.set(m.ad_set_name, m.source || 'manual'))
        setMatchSourceMap(srcMap)

        setIsLoading(false)
    }, [month, supabase])

    useEffect(() => { fetchData() }, [fetchData])

    // CSVアップロード
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsUploading(true)
        setUploadResult(null)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('month', month)

            const res = await fetch('/api/meta-ads/upload-csv', { method: 'POST', body: formData })
            const data = await res.json()

            if (data.success) {
                setUploadResult(`✅ ${data.recordCount}件のデータを取り込みました（合計: ¥${data.totalSpent.toLocaleString()}）`)
                fetchData()
            } else {
                setUploadResult(`❌ エラー: ${data.error}`)
            }
        } catch (err: any) {
            setUploadResult(`❌ エラー: ${err.message}`)
        }
        setIsUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // シリーズ紐付け保存（+ 学習保存）
    const handleSaveMappings = async () => {
        if (mappingChanges.size === 0) return

        try {
            for (const [id, seriesCode] of mappingChanges.entries()) {
                await supabase.from('meta_ads_performance').update({ series_code: seriesCode }).eq('id', id)

                // 学習: 広告セット名とシリーズの紐付けを保存（次回以降自動適用）
                const item = metaData.find(d => d.id === id)
                if (seriesCode !== null && item?.ad_set_name) {
                    await supabase.from('meta_adset_series_map').upsert({
                        ad_set_name: item.ad_set_name,
                        series_code: seriesCode,
                        source: 'manual',
                        updated_at: new Date().toISOString(),
                    }, { onConflict: 'ad_set_name' })

                    // 同じ広告セット名の全月データも一括更新
                    await supabase.from('meta_ads_performance')
                        .update({ series_code: seriesCode })
                        .eq('ad_set_name', item.ad_set_name)
                }
            }
            setMappingChanges(new Map())
            fetchData()
        } catch (err) {
            console.error('マッピング保存エラー:', err)
        }
    }

    // 広告費取り込み
    const handleImportCosts = async () => {
        setIsImporting(true)
        setImportResult(null)
        try {
            const res = await fetch('/api/meta-ads/import-costs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month }),
            })
            const data = await res.json()
            if (data.success) {
                setImportResult(`✅ ${data.seriesCount}シリーズの広告費を取り込みました（合計: ¥${data.totalCost.toLocaleString()}）`)
            } else {
                setImportResult(`❌ エラー: ${data.error}`)
            }
        } catch (err: any) {
            setImportResult(`❌ エラー: ${err.message}`)
        }
        setIsImporting(false)
    }

    // AIチャットコンテキスト生成
    const getChatContext = () => {
        const topSets = metaData.slice(0, 10).map(d => 
            `${d.ad_set_name}(広告費¥${Math.round(d.amount_spent)} クリック${d.clicks} CPC¥${Math.round(d.cpc)} 結果${d.results.toFixed(0)} 結果単価¥${d.results > 0 ? Math.round(d.amount_spent / d.results) : '-'})`
        ).join(', ')
        return `${month} Meta広告サマリー: 総広告費¥${Math.round(totalSpent).toLocaleString()} / インプレッション${totalImpressions.toLocaleString()} / リーチ${totalReach.toLocaleString()} / クリック${totalClicks.toLocaleString()} / CTR${avgCtr.toFixed(2)}% / CPC¥${Math.round(avgCpc)} / CPM¥${Math.round(avgCpm)} / 結果${totalResults.toFixed(0)} / Freq${avgFreq.toFixed(2)} / ${metaData.length}広告セット\n上位10広告セット: ${topSets}`
    }

    // AI自動紐付け
    const handleAutoMatch = async () => {
        setIsAutoMatching(true)
        setAutoMatchResult(null)
        try {
            const res = await fetch('/api/meta-ads/auto-match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month }),
            })
            const data = await res.json()
            if (data.success) {
                setAutoMatchResult(`✅ ${data.matched}/${data.total}件を自動紐付け（学習済み:${data.auto_applied || 0}件、AI:${data.ai_matched || 0}件）`)
                fetchData()
            } else {
                setAutoMatchResult(`❌ エラー: ${data.error}`)
            }
        } catch (err: any) {
            setAutoMatchResult(`❌ エラー: ${err.message}`)
        }
        setIsAutoMatching(false)
    }

    const hasUnmapped = metaData.some(d => d.series_code === null)
    const hasMapped = metaData.some(d => d.series_code !== null)

    const handleClearMappings = async () => {
        if (!confirm(`${month} のMeta広告の紐付けを全てクリアしますか？\n（広告データ自体は削除されません）`)) return
        try {
            const res = await fetch('/api/meta-ads/clear-mappings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month }),
            })
            const result = await res.json()
            if (result.success) {
                setAutoMatchResult(`✅ ${result.cleared}件の紐付けをクリアしました`)
                fetchData()
            } else {
                setAutoMatchResult(`❌ ${result.error}`)
            }
        } catch (err: any) {
            setAutoMatchResult(`❌ ${err.message}`)
        }
    }

    const formatCurrency = (n: number) => `¥${Math.round(n).toLocaleString()}`
    const formatNumber = (n: number) => Math.round(n).toLocaleString()
    const formatPercent = (n: number) => `${n.toFixed(2)}%`

    const totalSpent = metaData.reduce((s, d) => s + d.amount_spent, 0)
    const totalImpressions = metaData.reduce((s, d) => s + d.impressions, 0)
    const totalReach = metaData.reduce((s, d) => s + d.reach, 0)
    const totalClicks = metaData.reduce((s, d) => s + d.clicks, 0)
    const totalResults = metaData.reduce((s, d) => s + d.results, 0)
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0
    const avgCpc = totalClicks > 0 ? (totalSpent / totalClicks) : 0
    const avgCpm = totalImpressions > 0 ? (totalSpent / totalImpressions * 1000) : 0
    const avgFreq = totalReach > 0 ? (totalImpressions / totalReach) : 0
    const hasData = metaData.length > 0
    const allMapped = hasData && metaData.every(d => d.series_code !== null)

    if (isLoading) {
        return <div className="animate-pulse space-y-4"><div className="h-32 bg-gray-200 rounded-lg"></div><div className="h-48 bg-gray-200 rounded-lg"></div></div>
    }

    return (
        <div className="space-y-5">
            {/* アクションバー */}
            <div className="flex flex-wrap items-center gap-3">
                <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleUpload} />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors font-medium"
                >
                    <Upload size={16} />
                    {isUploading ? 'アップロード中...' : `${month} CSVアップロード`}
                </button>

                {hasData && (
                    <>
                        {hasUnmapped && (
                            <button onClick={handleAutoMatch} disabled={isAutoMatching}
                                className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:bg-amber-300 transition-colors font-medium">
                                <Brain size={16} />
                                {isAutoMatching ? 'AI紐付け中...' : 'AI自動紐付け'}
                            </button>
                        )}
                        {allMapped && (
                            <button onClick={handleImportCosts} disabled={isImporting}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-colors font-medium ${isCostImported ? 'bg-gray-100 text-gray-500 border border-gray-300' : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300'}`}>
                                {isCostImported ? <><CheckCircle size={16} />取り込み済み</> : <><Download size={16} />{isImporting ? '取り込み中...' : '広告費取り込み'}</>}
                            </button>
                        )}

                        {hasMapped && (
                            <button onClick={handleClearMappings}
                                className="flex items-center gap-2 px-4 py-2.5 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium">
                                <Trash2 size={16} />
                                紐付けクリア
                            </button>
                        )}
                    </>
                )}

                {hasData && (
                    <span className="text-sm text-gray-500 flex items-center gap-1">
                        <CheckCircle size={14} className="text-green-500" />
                        {metaData.length}件取り込み済み
                    </span>
                )}

                <div className="ml-auto flex items-center gap-3">
                    <a href="/docs/meta-csv-guide" target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600">
                        <FileText size={14} />CSVエクスポートガイド<ExternalLink size={12} />
                    </a>
                    {hasData && (
                        <button onClick={() => setShowChat(!showChat)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-colors text-sm font-medium ${showChat ? 'bg-violet-100 text-violet-700 border border-violet-300' : 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:opacity-90'}`}>
                            <Sparkles size={16} /> {showChat ? 'AIチャットを閉じる' : 'AIに質問'}
                        </button>
                    )}
                </div>
            </div>

            {/* 結果メッセージ */}
            {uploadResult && (
                <div className={`px-4 py-2 rounded-lg text-sm ${uploadResult.includes('❌') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {uploadResult}
                </div>
            )}
            {importResult && (
                <div className={`px-4 py-2 rounded-lg text-sm ${importResult.includes('❌') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {importResult}
                </div>
            )}
            {autoMatchResult && (
                <div className={`px-4 py-2 rounded-lg text-sm ${autoMatchResult.includes('❌') ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                    {autoMatchResult}
                </div>
            )}

            {!hasData ? (
                <div className="bg-white border rounded-xl p-10 text-center space-y-4">
                    <Upload size={48} className="mx-auto text-gray-300" />
                    <div>
                        <h3 className="text-lg font-semibold text-gray-700">{month} のデータがありません</h3>
                        <p className="text-sm text-gray-500 mt-1">Meta広告マネージャからCSVをエクスポートしてアップロードしてください</p>
                    </div>
                    <a href="/docs/meta-csv-guide" target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium">
                        <FileText size={16} />CSVエクスポートガイドを見る<ExternalLink size={14} />
                    </a>
                </div>
            ) : (
                <>
                    {/* KPIカード */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <div className="bg-white border rounded-lg p-4">
                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><DollarSign size={14} />広告費</div>
                            <div className="text-xl font-bold text-emerald-700">{formatCurrency(totalSpent)}</div>
                        </div>
                        <div className="bg-white border rounded-lg p-4">
                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><Eye size={14} />インプレッション</div>
                            <div className="text-xl font-bold text-blue-700">{formatNumber(totalImpressions)}</div>
                            <div className="text-[10px] text-gray-400">リーチ: {formatNumber(totalReach)}</div>
                        </div>
                        <div className="bg-white border rounded-lg p-4">
                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><MousePointerClick size={14} />クリック</div>
                            <div className="text-xl font-bold text-indigo-700">{formatNumber(totalClicks)}</div>
                            <div className="text-[10px] text-gray-400">CTR: {formatPercent(avgCtr)} / CPC: {formatCurrency(avgCpc)}</div>
                        </div>
                        <div className="bg-white border rounded-lg p-4">
                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><Target size={14} />結果</div>
                            <div className="text-xl font-bold text-violet-700">{totalResults.toFixed(0)}</div>
                            <div className="text-[10px] text-gray-400">単価: {totalResults > 0 ? formatCurrency(totalSpent / totalResults) : '—'}</div>
                        </div>
                        <div className="bg-white border rounded-lg p-4">
                            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><TrendingUp size={14} />効率</div>
                            <div className="text-xl font-bold text-amber-700">CPM {formatCurrency(avgCpm)}</div>
                            <div className="text-[10px] text-gray-400">Freq: {avgFreq.toFixed(2)}</div>
                        </div>
                    </div>

                    {/* 広告セット一覧テーブル */}
                    <div className="bg-white border rounded-xl overflow-hidden">
                        <div className="p-5 border-b flex items-center justify-between">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <Target size={20} className="text-blue-500" />
                                広告セット別パフォーマンス — {month}
                            </h2>
                            {mappingChanges.size > 0 && (
                                <button onClick={handleSaveMappings}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
                                    <Save size={14} /> 紐付け保存 ({mappingChanges.size}件)
                                </button>
                            )}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full" style={{ tableLayout: 'fixed' }}>
                                <colgroup>
                                    <col style={{ width: '14%' }} />
                                    <col style={{ width: '12%' }} />
                                    <col style={{ width: '9%' }} />
                                    <col style={{ width: '8%' }} />
                                    <col style={{ width: '7%' }} />
                                    <col style={{ width: '6%' }} />
                                    <col style={{ width: '7%' }} />
                                    <col style={{ width: '6%' }} />
                                    <col style={{ width: '7%' }} />
                                    <col style={{ width: '6%' }} />
                                    <col style={{ width: '13%' }} />
                                </colgroup>
                                <thead>
                                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                                        <th className="text-left px-4 py-3 font-medium">広告セット</th>
                                        <th className="text-left px-3 py-3 font-medium">キャンペーン</th>
                                        <th className="text-right px-3 py-3 font-medium">広告費</th>
                                        <th className="text-right px-3 py-3 font-medium">インプレ</th>
                                        <th className="text-right px-3 py-3 font-medium">リーチ</th>
                                        <th className="text-right px-3 py-3 font-medium">クリック</th>
                                        <th className="text-right px-3 py-3 font-medium">CTR</th>
                                        <th className="text-right px-3 py-3 font-medium">CPC</th>
                                        <th className="text-right px-3 py-3 font-medium">結果</th>
                                        <th className="text-right px-3 py-3 font-medium">結果単価</th>
                                        <th className="text-center px-2 py-3 font-medium">シリーズ紐付け</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {metaData.map(d => {
                                        const ctr = d.impressions > 0 ? (d.clicks / d.impressions * 100) : 0
                                        const cpc = d.clicks > 0 ? (d.amount_spent / d.clicks) : 0
                                        const costPerResult = d.results > 0 ? (d.amount_spent / d.results) : 0
                                        const currentMapping = mappingChanges.has(d.id) ? mappingChanges.get(d.id) : d.series_code

                                        return (
                                            <tr key={d.id} className="border-b hover:bg-gray-50">
                                                <td className="px-4 py-3 font-medium">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`inline-block w-2 h-2 rounded-full ${d.amount_spent > 10000 ? 'bg-emerald-500' : d.amount_spent > 1000 ? 'bg-yellow-400' : 'bg-gray-300'}`} />
                                                        <span className="truncate text-sm">{d.ad_set_name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3 text-sm text-gray-500 truncate">{d.campaign_name}</td>
                                                <td className="text-right px-3 py-3 text-emerald-700 font-semibold">{formatCurrency(d.amount_spent)}</td>
                                                <td className="text-right px-3 py-3 text-sm">{formatNumber(d.impressions)}</td>
                                                <td className="text-right px-3 py-3 text-sm">{formatNumber(d.reach)}</td>
                                                <td className="text-right px-3 py-3 text-sm">{formatNumber(d.clicks)}</td>
                                                <td className="text-right px-3 py-3 text-sm">{formatPercent(ctr)}</td>
                                                <td className="text-right px-3 py-3 text-sm">{formatCurrency(cpc)}</td>
                                                <td className="text-right px-3 py-3 font-medium">{d.results.toFixed(0)}</td>
                                                <td className="text-right px-3 py-3 text-sm">{formatCurrency(costPerResult)}</td>
                                                <td className="px-2 py-3">
                                                    <div className="flex flex-col gap-1">
                                                        <select
                                                            value={currentMapping ?? ''}
                                                            onChange={(e) => {
                                                                const val = e.target.value ? parseInt(e.target.value) : null
                                                                setMappingChanges(prev => new Map(prev).set(d.id, val))
                                                            }}
                                                            className="w-full text-xs border rounded px-1.5 py-1 bg-white"
                                                        >
                                                            <option value="">未設定</option>
                                                            {seriesOptions.map(s => (
                                                                <option key={s.series_code} value={s.series_code}>{s.series_name}</option>
                                                            ))}
                                                        </select>
                                                        {d.series_code !== null && (
                                                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full text-center ${
                                                                matchSourceMap.get(d.ad_set_name) === 'ai'
                                                                    ? 'bg-purple-100 text-purple-700'
                                                                    : 'bg-blue-100 text-blue-700'
                                                            }`}>
                                                                {matchSourceMap.get(d.ad_set_name) === 'ai' ? '🤖 AI' : '📚 学習済'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    <tr className="bg-gray-100 font-bold border-t-2">
                                        <td className="px-4 py-3">合計</td>
                                        <td></td>
                                        <td className="text-right px-3 py-3 text-emerald-700">{formatCurrency(totalSpent)}</td>
                                        <td className="text-right px-3 py-3">{formatNumber(totalImpressions)}</td>
                                        <td className="text-right px-3 py-3">{formatNumber(totalReach)}</td>
                                        <td className="text-right px-3 py-3">{formatNumber(totalClicks)}</td>
                                        <td className="text-right px-3 py-3">{formatPercent(avgCtr)}</td>
                                        <td className="text-right px-3 py-3">{formatCurrency(avgCpc)}</td>
                                        <td className="text-right px-3 py-3">{totalResults.toFixed(0)}</td>
                                        <td className="text-right px-3 py-3">{totalResults > 0 ? formatCurrency(totalSpent / totalResults) : '—'}</td>
                                        <td></td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* AIチャットウィンドウ */}
                    {showChat && (
                        <AdChatWindow
                            platform="meta"
                            context={getChatContext()}
                            onClose={() => setShowChat(false)}
                        />
                    )}
                </>
            )}
        </div>
    )
}
