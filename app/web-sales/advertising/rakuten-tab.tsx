// /app/web-sales/advertising/rakuten-tab.tsx
// 楽天RPP広告タブコンポーネント — CSV取り込み、パフォーマンス表示、AI分析
"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"
import {
    Upload, Download, RefreshCw, Brain, Save,
    CheckCircle, AlertCircle, ChevronDown, ChevronUp,
    TrendingUp, Eye, MousePointerClick, Target, DollarSign,
    FileText, ExternalLink, Edit3
} from "lucide-react"

interface RakutenItem {
    id: number
    report_month: string
    product_code: string
    product_url: string
    bid_price: number
    ctr: number
    clicks: number
    amount_spent: number
    cpc_actual: number
    clicks_new: number
    amount_spent_new: number
    clicks_existing: number
    amount_spent_existing: number
    sales_amount: number
    sales_count: number
    cvr: number
    roas: number
    cost_per_order: number
    series_code: number | null
}

interface SeriesOption {
    series_code: number
    series_name: string
}

interface Props {
    month: string
}

export default function RakutenTab({ month }: Props) {
    const supabase = getSupabaseBrowserClient()

    const [data, setData] = useState<RakutenItem[]>([])
    const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([])
    const [seriesMap, setSeriesMap] = useState<Map<number, string>>(new Map())
    const [isLoading, setIsLoading] = useState(true)
    const [isUploading, setIsUploading] = useState(false)
    const [isImporting, setIsImporting] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [isAutoMatching, setIsAutoMatching] = useState(false)
    const [uploadResult, setUploadResult] = useState<string | null>(null)
    const [importResult, setImportResult] = useState<string | null>(null)
    const [autoMatchResult, setAutoMatchResult] = useState<string | null>(null)
    const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
    const [showAnalysis, setShowAnalysis] = useState(false)
    const [mappingChanges, setMappingChanges] = useState<Map<number, number | null>>(new Map())
    const [productNameMap, setProductNameMap] = useState<Map<string, string>>(new Map())
    const [newProductNames, setNewProductNames] = useState<Map<string, string>>(new Map())
    const [isSavingNames, setIsSavingNames] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const fetchData = useCallback(async () => {
        setIsLoading(true)
        const [{ data: items }, { data: products }, { data: pNames }] = await Promise.all([
            supabase.from('rakuten_ads_performance').select('*').eq('report_month', month).order('amount_spent', { ascending: false }),
            supabase.from('products').select('series_code, series').not('series_code', 'is', null),
            supabase.from('rakuten_product_names').select('product_code, product_name'),
        ])
        setData(items || [])

        // 商品名マップ
        const pnMap = new Map<string, string>()
        pNames?.forEach((p: any) => pnMap.set(p.product_code, p.product_name))
        setProductNameMap(pnMap)

        const opts: SeriesOption[] = []
        const sMap = new Map<number, string>()
        const seen = new Set<number>()
        products?.forEach((p: any) => {
            if (p.series_code && !seen.has(p.series_code)) {
                seen.add(p.series_code)
                opts.push({ series_code: p.series_code, series_name: p.series })
                sMap.set(p.series_code, p.series)
            }
        })
        setSeriesOptions(opts)
        setSeriesMap(sMap)
        setIsLoading(false)
    }, [month, supabase])

    useEffect(() => { fetchData() }, [fetchData])

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setIsUploading(true)
        setUploadResult(null)
        const formData = new FormData()
        formData.append('file', file)
        formData.append('month', month)
        try {
            const res = await fetch('/api/rakuten-ads/upload-csv', { method: 'POST', body: formData })
            const result = await res.json()
            if (result.success) {
                setUploadResult(`✅ ${result.inserted}件の商品データを取り込みました`)
                fetchData()
            } else {
                setUploadResult(`❌ エラー: ${result.error}`)
            }
        } catch (err: any) {
            setUploadResult(`❌ エラー: ${err.message}`)
        }
        setIsUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleAutoMatch = async () => {
        setIsAutoMatching(true)
        setAutoMatchResult(null)
        try {
            const res = await fetch('/api/rakuten-ads/auto-match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month }),
            })
            const result = await res.json()
            if (result.success) {
                setAutoMatchResult(`✅ ${result.matched}/${result.total}件を紐付け（直接:${result.direct_matched || 0}件）`)
                fetchData()
            } else {
                setAutoMatchResult(`❌ ${result.error}`)
            }
        } catch (err: any) {
            setAutoMatchResult(`❌ ${err.message}`)
        }
        setIsAutoMatching(false)
    }

    const handleImportCosts = async () => {
        setIsImporting(true)
        setImportResult(null)
        try {
            const res = await fetch('/api/rakuten-ads/import-costs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month }),
            })
            const result = await res.json()
            if (result.success) {
                setImportResult(`✅ 楽天広告費 ¥${result.rakuten_cost?.toLocaleString()} を取り込みました`)
            } else {
                setImportResult(`❌ ${result.error}`)
            }
        } catch (err: any) {
            setImportResult(`❌ ${err.message}`)
        }
        setIsImporting(false)
    }

    const handleAiAnalysis = async () => {
        setIsAnalyzing(true)
        try {
            const res = await fetch('/api/rakuten-ads/ai-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month }),
            })
            const result = await res.json()
            if (result.success) {
                setAiAnalysis(result.analysis)
                setShowAnalysis(true)
            }
        } catch { }
        setIsAnalyzing(false)
    }

    const handleSaveMappings = async () => {
        for (const [id, seriesCode] of mappingChanges) {
            await supabase.from('rakuten_ads_performance').update({ series_code: seriesCode }).eq('id', id)
        }
        setMappingChanges(new Map())
        fetchData()
    }

    const handleSaveProductNames = async () => {
        if (newProductNames.size === 0) return
        setIsSavingNames(true)
        const items = Array.from(newProductNames.entries()).map(([code, name]) => ({ product_code: code, product_name: name }))
        try {
            const res = await fetch('/api/rakuten-ads/product-names', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items }),
            })
            const result = await res.json()
            if (result.success) {
                setNewProductNames(new Map())
                fetchData()
            }
        } catch { }
        setIsSavingNames(false)
    }

    const hasUnmapped = data.some(d => d.series_code === null)
    const hasUnnamedCodes = data.some(d => d.product_code && !productNameMap.has(d.product_code))

    const formatCurrency = (n: number) => `¥${Math.round(n).toLocaleString()}`
    const formatNumber = (n: number) => Math.round(n).toLocaleString()
    const formatPercent = (n: number) => `${n.toFixed(2)}%`

    const totalSpent = data.reduce((s, d) => s + d.amount_spent, 0)
    const totalClicks = data.reduce((s, d) => s + d.clicks, 0)
    const totalSales = data.reduce((s, d) => s + d.sales_amount, 0)
    const totalOrders = data.reduce((s, d) => s + d.sales_count, 0)
    const avgCpc = totalClicks > 0 ? totalSpent / totalClicks : 0
    const overallRoas = totalSpent > 0 ? (totalSales / totalSpent * 100) : 0
    const overallCvr = totalClicks > 0 ? (totalOrders / totalClicks * 100) : 0
    const hasData = data.length > 0
    const allMapped = hasData && data.every(d => d.series_code !== null)

    if (isLoading) {
        return <div className="animate-pulse space-y-4"><div className="h-32 bg-gray-200 rounded-lg"></div><div className="h-48 bg-gray-200 rounded-lg"></div></div>
    }

    return (
        <div className="space-y-5">
            {/* ヘッダー・アクション */}
            <div className="flex flex-wrap items-center gap-3">
                <input ref={fileInputRef} type="file" accept=".csv,.zip" className="hidden" onChange={handleUpload} />
                <button onClick={() => fileInputRef.current?.click()} disabled={isUploading}
                    className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-300 transition-colors font-medium">
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
                                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-emerald-300 transition-colors font-medium">
                                <Download size={16} />
                                {isImporting ? '取り込み中...' : '広告費取り込み'}
                            </button>
                        )}
                        <button onClick={handleAiAnalysis} disabled={isAnalyzing}
                            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:bg-violet-300 transition-colors font-medium">
                            <Brain size={16} />
                            AI分析
                        </button>
                    </>
                )}

                {hasData && (
                    <span className="text-sm text-gray-500 flex items-center gap-1">
                        <CheckCircle size={14} className="text-green-500" />
                        {data.length}件取り込み済み
                    </span>
                )}

                <a href="/docs/rakuten-rpp-guide" target="_blank" rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600">
                    <FileText size={14} />CSVエクスポートガイド<ExternalLink size={12} />
                </a>
            </div>

            {/* 結果メッセージ */}
            {uploadResult && (
                <div className={`px-4 py-2 rounded-lg text-sm ${uploadResult.includes('❌') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{uploadResult}</div>
            )}
            {importResult && (
                <div className={`px-4 py-2 rounded-lg text-sm ${importResult.includes('❌') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{importResult}</div>
            )}
            {autoMatchResult && (
                <div className={`px-4 py-2 rounded-lg text-sm ${autoMatchResult.includes('❌') ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{autoMatchResult}</div>
            )}

            {!hasData ? (
                <div className="bg-white border rounded-xl p-10 text-center space-y-4">
                    <Upload size={48} className="mx-auto text-gray-300" />
                    <div>
                        <h3 className="text-lg font-semibold text-gray-700">{month} のデータがありません</h3>
                        <p className="text-sm text-gray-500 mt-1">楽天RMSからRPPレポートCSV（ZIP）をダウンロードしてアップロードしてください</p>
                    </div>
                    <a href="/docs/rakuten-rpp-guide" target="_blank"
                        className="inline-flex items-center gap-2 text-red-600 hover:text-red-700 text-sm font-medium">
                        <FileText size={16} />CSVエクスポートガイドを見る<ExternalLink size={14} />
                    </a>
                </div>
            ) : (
                <>
                    {/* KPIカード */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                        {[
                            { label: '広告費', value: formatCurrency(totalSpent), icon: <DollarSign size={16} />, color: 'red' },
                            { label: 'クリック', value: formatNumber(totalClicks), icon: <MousePointerClick size={16} />, color: 'blue' },
                            { label: 'CPC', value: formatCurrency(avgCpc), icon: <Target size={16} />, color: 'purple' },
                            { label: '売上(720h)', value: formatCurrency(totalSales), icon: <TrendingUp size={16} />, color: 'emerald' },
                            { label: '注文数', value: formatNumber(totalOrders), icon: <CheckCircle size={16} />, color: 'cyan' },
                            { label: 'ROAS', value: formatPercent(overallRoas), icon: <TrendingUp size={16} />, color: 'amber' },
                            { label: 'CVR', value: formatPercent(overallCvr), icon: <Eye size={16} />, color: 'indigo' },
                        ].map(kpi => (
                            <div key={kpi.label} className={`bg-white border rounded-xl p-4 border-l-4 border-l-${kpi.color}-500`}>
                                <div className={`flex items-center gap-1.5 text-${kpi.color}-600 text-xs font-medium mb-1`}>{kpi.icon}{kpi.label}</div>
                                <div className="text-xl font-bold">{kpi.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* AI分析パネル */}
                    {aiAnalysis && (
                        <div className="bg-white border rounded-xl">
                            <button onClick={() => setShowAnalysis(!showAnalysis)}
                                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-2 font-semibold">
                                    <Brain size={18} className="text-violet-600" />AI分析レポート
                                </div>
                                {showAnalysis ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </button>
                            {showAnalysis && (
                                <div className="px-4 pb-4 prose prose-sm max-w-none whitespace-pre-wrap text-sm text-gray-700">
                                    {aiAnalysis}
                                </div>
                            )}
                        </div>
                    )}

                    {/* 商品別パフォーマンステーブル */}
                    <div className="bg-white border rounded-xl">
                        <div className="p-4 border-b flex items-center justify-between">
                            <h3 className="font-semibold flex items-center gap-2">
                                <Target size={18} className="text-red-600" />
                                商品別パフォーマンス — {month}
                                <span className="text-xs text-gray-400 font-normal">({data.length}商品)</span>
                            </h3>
                            <div className="flex items-center gap-2">
                                {newProductNames.size > 0 && (
                                    <button onClick={handleSaveProductNames} disabled={isSavingNames}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:bg-amber-300">
                                        <Edit3 size={14} />{isSavingNames ? '保存中...' : `商品名保存 (${newProductNames.size}件)`}
                                    </button>
                                )}
                                {mappingChanges.size > 0 && (
                                    <button onClick={handleSaveMappings}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                                        <Save size={14} />保存
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-medium text-gray-600" style={{ width: '100px' }}>商品コード</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-600" style={{ width: '160px' }}>商品名</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-600" style={{ width: '90px' }}>広告費</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-600" style={{ width: '60px' }}>クリック</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-600" style={{ width: '60px' }}>CPC</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-600" style={{ width: '50px' }}>CTR</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-600" style={{ width: '90px' }}>売上(720h)</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-600" style={{ width: '50px' }}>注文</th>
                                        <th className="px-3 py-2 text-right font-medium text-gray-600" style={{ width: '60px' }}>ROAS</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-600" style={{ width: '130px' }}>シリーズ紐付け</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {data.map(item => {
                                        const pName = productNameMap.get(item.product_code)
                                        return (
                                            <tr key={item.id} className="hover:bg-gray-50">
                                                <td className="px-3 py-2">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className={`w-2 h-2 rounded-full ${item.series_code ? 'bg-green-500' : 'bg-orange-400'}`}></span>
                                                        <span className="font-mono text-xs truncate" title={item.product_code}>{item.product_code}</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    {pName ? (
                                                        <span className="text-xs text-gray-700 truncate block" title={pName}>{pName}</span>
                                                    ) : (
                                                        <input
                                                            type="text"
                                                            placeholder="商品名を入力"
                                                            maxLength={30}
                                                            value={newProductNames.get(item.product_code) || ''}
                                                            onChange={e => setNewProductNames(prev => new Map(prev).set(item.product_code, e.target.value))}
                                                            className="w-full text-xs border border-amber-300 rounded px-1.5 py-1 bg-amber-50 focus:border-amber-500 focus:outline-none"
                                                        />
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.amount_spent)}</td>
                                                <td className="px-3 py-2 text-right">{formatNumber(item.clicks)}</td>
                                                <td className="px-3 py-2 text-right">{formatCurrency(item.cpc_actual)}</td>
                                                <td className="px-3 py-2 text-right">{formatPercent(item.ctr)}</td>
                                                <td className="px-3 py-2 text-right">{formatCurrency(item.sales_amount)}</td>
                                                <td className="px-3 py-2 text-right">{item.sales_count}</td>
                                                <td className="px-3 py-2 text-right">
                                                    <span className={`font-semibold ${item.roas >= 300 ? 'text-green-600' : item.roas >= 100 ? 'text-amber-600' : 'text-red-600'}`}>
                                                        {formatPercent(item.roas)}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <select
                                                        value={mappingChanges.has(item.id) ? (mappingChanges.get(item.id) ?? '') : (item.series_code ?? '')}
                                                        onChange={e => {
                                                            const v = e.target.value ? parseInt(e.target.value) : null
                                                            setMappingChanges(prev => new Map(prev).set(item.id, v))
                                                        }}
                                                        className="w-full text-xs border rounded px-1.5 py-1"
                                                    >
                                                        <option value="">未設定</option>
                                                        {seriesOptions.map(s => (
                                                            <option key={s.series_code} value={s.series_code}>{s.series_name}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                                <tfoot className="bg-gray-50 border-t-2 font-semibold">
                                    <tr>
                                        <td className="px-3 py-2">合計</td>
                                        <td className="px-3 py-2"></td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(totalSpent)}</td>
                                        <td className="px-3 py-2 text-right">{formatNumber(totalClicks)}</td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(avgCpc)}</td>
                                        <td className="px-3 py-2 text-right">-</td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(totalSales)}</td>
                                        <td className="px-3 py-2 text-right">{formatNumber(totalOrders)}</td>
                                        <td className="px-3 py-2 text-right">{formatPercent(overallRoas)}</td>
                                        <td className="px-3 py-2"></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
