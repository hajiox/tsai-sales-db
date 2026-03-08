// /app/web-sales/advertising/yahoo-tab.tsx
// Yahoo!ショッピング アイテムリーチ広告タブ — CSV取り込み、パフォーマンス表示、AI分析
"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"
import {
    Upload, Download, RefreshCw, Brain, Save,
    CheckCircle, AlertCircle, Target, DollarSign,
    ExternalLink, Trash2
} from "lucide-react"

interface YahooAdData {
    id: number
    report_month: string
    product_code: string
    product_name: string
    category: string
    impressions: number
    clicks: number
    ctr: number
    cpc: number
    amount_spent: number
    orders: number
    order_quantity: number
    sales_amount: number
    cvr: number
    roas: number
    series_code: number | null
}

interface SeriesOption {
    series_code: number
    series_name: string
}

export default function YahooTab({ month }: { month: string }) {
    const supabase = getSupabaseBrowserClient()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [data, setData] = useState<YahooAdData[]>([])
    const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isUploading, setIsUploading] = useState(false)
    const [isMatching, setIsMatching] = useState(false)
    const [isImporting, setIsImporting] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [uploadResult, setUploadResult] = useState<string | null>(null)
    const [matchResult, setMatchResult] = useState<string | null>(null)
    const [importResult, setImportResult] = useState<string | null>(null)
    const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
    const [showAnalysis, setShowAnalysis] = useState(false)
    const [mappingChanges, setMappingChanges] = useState<Map<number, number | null>>(new Map())

    const fetchData = useCallback(async () => {
        setIsLoading(true)
        const { data: ads } = await supabase
            .from('yahoo_ads_performance')
            .select('*')
            .eq('report_month', month)
            .order('amount_spent', { ascending: false })
        setData(ads || [])

        const { data: products } = await supabase
            .from('products')
            .select('series_code, series')
            .not('series_code', 'is', null)

        const seen = new Set<number>()
        const options: SeriesOption[] = []
        products?.forEach((p: any) => {
            if (!seen.has(p.series_code)) {
                seen.add(p.series_code)
                options.push({ series_code: p.series_code, series_name: p.series })
            }
        })
        setSeriesOptions(options.sort((a, b) => a.series_code - b.series_code))
        setIsLoading(false)
    }, [month, supabase])

    useEffect(() => { fetchData() }, [fetchData])

    // CSVアップロード
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setIsUploading(true)
        setUploadResult(null)
        const formData = new FormData()
        formData.append('file', file)
        formData.append('month', month)
        try {
            const res = await fetch('/api/yahoo-ads/upload-csv', { method: 'POST', body: formData })
            const result = await res.json()
            if (result.success) {
                setUploadResult(`✅ ${result.inserted}件のデータを取り込みました`)
                fetchData()
            } else {
                setUploadResult(`❌ ${result.error}`)
            }
        } catch (err: any) {
            setUploadResult(`❌ ${err.message}`)
        }
        setIsUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    // AI自動紐付け
    const handleAutoMatch = async () => {
        setIsMatching(true)
        setMatchResult(null)
        try {
            const res = await fetch('/api/yahoo-ads/auto-match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month }),
            })
            const result = await res.json()
            if (result.success) {
                setMatchResult(`✅ ${result.auto_applied || 0}件学習済み + ${result.ai_matched || 0}件AI紐付け`)
                fetchData()
            } else {
                setMatchResult(`❌ ${result.error}`)
            }
        } catch (err: any) {
            setMatchResult(`❌ ${err.message}`)
        }
        setIsMatching(false)
    }

    // 手動紐付け保存
    const handleSaveMappings = async () => {
        for (const [id, seriesCode] of mappingChanges) {
            await supabase.from('yahoo_ads_performance').update({ series_code: seriesCode }).eq('id', id)

            const item = data.find(d => d.id === id)
            if (seriesCode !== null && item?.product_code) {
                await supabase.from('yahoo_code_series_map').upsert({
                    product_code: item.product_code,
                    series_code: seriesCode,
                    source: 'manual',
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'product_code' })

                // 同じ商品コードの全月データも一括更新
                await supabase.from('yahoo_ads_performance')
                    .update({ series_code: seriesCode })
                    .eq('product_code', item.product_code)
            }
        }
        setMappingChanges(new Map())
        fetchData()
    }

    // 広告費取り込み
    const handleImportCosts = async () => {
        setIsImporting(true)
        setImportResult(null)
        try {
            const res = await fetch('/api/yahoo-ads/import-costs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month }),
            })
            const result = await res.json()
            if (result.success) {
                setImportResult(`✅ Yahoo広告費 ¥${result.yahoo_cost?.toLocaleString()} を取り込みました`)
            } else {
                setImportResult(`❌ ${result.error}`)
            }
        } catch (err: any) {
            setImportResult(`❌ ${err.message}`)
        }
        setIsImporting(false)
    }

    // AI分析
    const handleAiAnalysis = async () => {
        setIsAnalyzing(true)
        setShowAnalysis(true)
        setAiAnalysis(null)
        try {
            const res = await fetch('/api/yahoo-ads/ai-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month }),
            })
            const result = await res.json()
            if (result.success) {
                setAiAnalysis(result.analysis)
            }
        } catch { }
        setIsAnalyzing(false)
    }

    // 紐付けクリア
    const handleClearMappings = async () => {
        if (!confirm('Yahoo広告の紐付けをすべてクリアしますか？')) return
        await fetch('/api/yahoo-ads/clear-mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month }),
        })
        fetchData()
    }

    const formatNumber = (n: number) => n.toLocaleString()
    const formatCurrency = (n: number) => `¥${Math.round(n).toLocaleString()}`
    const formatPercent = (n: number) => `${n.toFixed(1)}%`

    const totalSpent = data.reduce((s, d) => s + d.amount_spent, 0)
    const totalClicks = data.reduce((s, d) => s + d.clicks, 0)
    const totalImpressions = data.reduce((s, d) => s + d.impressions, 0)
    const totalSales = data.reduce((s, d) => s + d.sales_amount, 0)
    const totalOrders = data.reduce((s, d) => s + d.orders, 0)
    const overallRoas = totalSpent > 0 ? (totalSales / totalSpent) * 100 : 0
    const avgCpc = totalClicks > 0 ? totalSpent / totalClicks : 0
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
    const hasMappings = data.some(d => d.series_code !== null)

    const kpis = [
        { label: '広告費', value: formatCurrency(totalSpent), color: 'text-emerald-600' },
        { label: '表示回数', value: formatNumber(totalImpressions), color: 'text-blue-600' },
        { label: 'クリック', value: formatNumber(totalClicks), color: 'text-orange-600' },
        { label: 'CTR', value: formatPercent(avgCtr), color: 'text-violet-600' },
        { label: 'CPC', value: formatCurrency(avgCpc), color: 'text-pink-600' },
        { label: '売上', value: formatCurrency(totalSales), color: 'text-green-600' },
        { label: '注文数', value: formatNumber(totalOrders), color: 'text-indigo-600' },
        { label: 'ROAS', value: formatPercent(overallRoas), color: 'text-red-600' },
    ]

    return (
        <div className="space-y-6">
            {/* アクションバー */}
            <div className="bg-white border rounded-xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                        <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleUpload} />
                        <button onClick={() => fileInputRef.current?.click()} disabled={isUploading}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium">
                            <Upload size={16} /> {isUploading ? 'アップロード中...' : 'CSVアップロード'}
                        </button>
                        {data.length > 0 && (
                            <>
                                <button onClick={handleAutoMatch} disabled={isMatching}
                                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 text-sm font-medium">
                                    <Brain size={16} /> {isMatching ? '紐付け中...' : 'AI自動紐付け'}
                                </button>
                                {mappingChanges.size > 0 && (
                                    <button onClick={handleSaveMappings}
                                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                                        <Save size={16} /> 保存 ({mappingChanges.size})
                                    </button>
                                )}
                                {hasMappings && (
                                    <>
                                        <button onClick={handleImportCosts} disabled={isImporting}
                                            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium">
                                            <Download size={16} /> {isImporting ? '取り込み中...' : '広告費取り込み'}
                                        </button>
                                        <button onClick={handleClearMappings}
                                            className="flex items-center gap-2 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm">
                                            <Trash2 size={14} /> 紐付けクリア
                                        </button>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <a href="/docs/yahoo-itemreach-guide" target="_blank"
                            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
                            <ExternalLink size={14} /> CSVガイド
                        </a>
                        {data.length > 0 && (
                            <button onClick={handleAiAnalysis} disabled={isAnalyzing}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-lg hover:opacity-90 disabled:opacity-50 text-sm font-medium">
                                <Brain size={16} /> AI分析
                            </button>
                        )}
                    </div>
                </div>
                {/* メッセージ表示 */}
                {uploadResult && <div className="mt-3 text-sm">{uploadResult}</div>}
                {matchResult && <div className="mt-3 text-sm">{matchResult}</div>}
                {importResult && <div className="mt-3 text-sm">{importResult}</div>}
            </div>

            {isLoading ? (
                <div className="text-center py-12 text-gray-500">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-3" />
                    読み込み中...
                </div>
            ) : data.length === 0 ? (
                <div className="bg-white border rounded-xl p-12 text-center text-gray-500">
                    <Upload size={48} className="mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium mb-2">Yahoo広告データがありません</p>
                    <p className="text-sm">コマースアドマネージャーからCSVをダウンロードしてアップロードしてください</p>
                </div>
            ) : (
                <>
                    {/* KPIカード */}
                    <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
                        {kpis.map(kpi => (
                            <div key={kpi.label} className="bg-white border rounded-xl p-3 text-center">
                                <div className="text-xs text-gray-500 mb-1">{kpi.label}</div>
                                <div className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* テーブル */}
                    <div className="bg-white border rounded-xl">
                        <div className="p-4 border-b flex items-center justify-between">
                            <h3 className="font-semibold flex items-center gap-2">
                                <Target size={18} className="text-purple-600" />
                                商品別パフォーマンス — {month}
                            </h3>
                            <span className="text-sm text-gray-500">{data.length}商品</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                                <colgroup>
                                    <col style={{ width: '200px' }} />
                                    <col style={{ width: '90px' }} />
                                    <col style={{ width: '85px' }} />
                                    <col style={{ width: '70px' }} />
                                    <col style={{ width: '65px' }} />
                                    <col style={{ width: '70px' }} />
                                    <col style={{ width: '85px' }} />
                                    <col style={{ width: '60px' }} />
                                    <col style={{ width: '70px' }} />
                                    <col style={{ width: '140px' }} />
                                </colgroup>
                                <thead>
                                    <tr className="bg-gray-50 border-b text-gray-600">
                                        <th className="px-3 py-2 text-left">商品名</th>
                                        <th className="px-3 py-2 text-right">広告費</th>
                                        <th className="px-3 py-2 text-right">表示回数</th>
                                        <th className="px-3 py-2 text-right">クリック</th>
                                        <th className="px-3 py-2 text-right">CTR</th>
                                        <th className="px-3 py-2 text-right">CPC</th>
                                        <th className="px-3 py-2 text-right">売上</th>
                                        <th className="px-3 py-2 text-right">注文</th>
                                        <th className="px-3 py-2 text-right">ROAS</th>
                                        <th className="px-3 py-2 text-center">シリーズ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.map(item => (
                                        <tr key={item.id} className="border-b hover:bg-gray-50">
                                            <td className="px-3 py-2 truncate" title={item.product_name}>
                                                {item.product_name || item.product_code}
                                            </td>
                                            <td className="px-3 py-2 text-right">{formatCurrency(item.amount_spent)}</td>
                                            <td className="px-3 py-2 text-right">{formatNumber(item.impressions)}</td>
                                            <td className="px-3 py-2 text-right">{formatNumber(item.clicks)}</td>
                                            <td className="px-3 py-2 text-right">{formatPercent(item.ctr)}</td>
                                            <td className="px-3 py-2 text-right">{formatCurrency(item.cpc)}</td>
                                            <td className="px-3 py-2 text-right">{formatCurrency(item.sales_amount)}</td>
                                            <td className="px-3 py-2 text-right">{item.orders}</td>
                                            <td className="px-3 py-2 text-right">{formatPercent(item.roas)}</td>
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
                                    ))}
                                </tbody>
                                <tfoot className="bg-gray-50 border-t-2 font-semibold">
                                    <tr>
                                        <td className="px-3 py-2">合計</td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(totalSpent)}</td>
                                        <td className="px-3 py-2 text-right">{formatNumber(totalImpressions)}</td>
                                        <td className="px-3 py-2 text-right">{formatNumber(totalClicks)}</td>
                                        <td className="px-3 py-2 text-right">{formatPercent(avgCtr)}</td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(avgCpc)}</td>
                                        <td className="px-3 py-2 text-right">{formatCurrency(totalSales)}</td>
                                        <td className="px-3 py-2 text-right">{formatNumber(totalOrders)}</td>
                                        <td className="px-3 py-2 text-right">{formatPercent(overallRoas)}</td>
                                        <td className="px-3 py-2"></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* AI分析結果 */}
                    {showAnalysis && (
                        <div className="bg-white border rounded-xl overflow-hidden">
                            <div className="p-5 border-b flex items-center justify-between">
                                <h2 className="text-lg font-semibold flex items-center gap-2">
                                    <Brain size={20} className="text-violet-500" />
                                    AI分析レポート
                                </h2>
                                <button onClick={() => setShowAnalysis(false)} className="text-sm text-gray-400 hover:text-gray-600">閉じる</button>
                            </div>
                            <div className="p-6">
                                {isAnalyzing ? (
                                    <div className="flex items-center gap-3 text-violet-600">
                                        <RefreshCw size={20} className="animate-spin" />
                                        <span>Gemini 2.5 Flashで分析中...</span>
                                    </div>
                                ) : aiAnalysis ? (
                                    <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{
                                        __html: aiAnalysis
                                            .replace(/^## /gm, '<h2 class="text-lg font-bold mt-6 mb-2">')
                                            .replace(/^### /gm, '<h3 class="text-md font-semibold mt-4 mb-1">')
                                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                                            .replace(/\n/g, '<br/>')
                                    }} />
                                ) : null}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
