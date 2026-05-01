// /app/web-sales/advertising/amazon-tab.tsx
// Amazon スポンサープロダクト広告タブ — XLSX/CSV取り込み、パフォーマンス表示、AI分析
"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"
import {
    Upload, Download, RefreshCw, Brain, Save,
    CheckCircle, AlertCircle, Target, DollarSign,
    ExternalLink, Trash2, Sparkles
} from "lucide-react"
import AdChatWindow from "@/components/AdChatWindow"

interface AmazonAdData {
    id: number
    report_month: string
    campaign_name: string
    sku: string
    asin: string
    impressions: number
    clicks: number
    ctr: number
    cpc: number
    cost: number
    sales: number
    acos: number
    roas: number
    orders: number
    units_sold: number
    series_code: number | null
}

interface SeriesOption {
    series_code: number
    series_name: string
}

export default function AmazonTab({ month }: { month: string }) {
    const supabase = getSupabaseBrowserClient()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [data, setData] = useState<AmazonAdData[]>([])
    const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isUploading, setIsUploading] = useState(false)
    const [isMatching, setIsMatching] = useState(false)
    const [isImporting, setIsImporting] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [uploadResult, setUploadResult] = useState<string | null>(null)
    const [matchResult, setMatchResult] = useState<string | null>(null)
    const [importResult, setImportResult] = useState<string | null>(null)
    const [showChat, setShowChat] = useState(false)
    const [mappingChanges, setMappingChanges] = useState<Map<string, number | null>>(new Map()) // key=campaign_name
    const [isCostImported, setIsCostImported] = useState(false)
    const [matchSourceMap, setMatchSourceMap] = useState<Map<string, string>>(new Map()) // asin -> source

    // キャンペーン単位で集約
    interface CampaignGroup {
        campaign_name: string
        ids: number[]
        asins: string[]
        cost: number
        clicks: number
        impressions: number
        sales: number
        orders: number
        series_code: number | null
    }

    const fetchData = useCallback(async () => {
        setIsLoading(true)
        const { data: ads } = await supabase
            .from('amazon_ads_performance')
            .select('*')
            .eq('report_month', month)
            .order('cost', { ascending: false })
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

        // 取り込み済みチェック
        const reportMonth = `${month}-01`
        const { data: adCostData } = await supabase
            .from('advertising_costs')
            .select('amazon_cost')
            .eq('report_month', reportMonth)
        setIsCostImported(adCostData?.some((r: any) => (r.amazon_cost || 0) > 0) || false)

        // マッチソース取得
        const { data: mappingSources } = await supabase
            .from('amazon_code_series_map')
            .select('asin, source')
        const srcMap = new Map<string, string>()
        mappingSources?.forEach((m: any) => srcMap.set(m.asin, m.source || 'manual'))
        setMatchSourceMap(srcMap)

        setIsLoading(false)
    }, [month, supabase])

    useEffect(() => { fetchData() }, [fetchData])

    // キャンペーン名で集約
    const campaignGroups: CampaignGroup[] = React.useMemo(() => {
        const map = new Map<string, CampaignGroup>()
        data.forEach(item => {
            const key = item.campaign_name
            if (!map.has(key)) {
                map.set(key, {
                    campaign_name: key,
                    ids: [],
                    asins: [],
                    cost: 0,
                    clicks: 0,
                    impressions: 0,
                    sales: 0,
                    orders: 0,
                    series_code: item.series_code,
                })
            }
            const g = map.get(key)!
            g.ids.push(item.id)
            if (!g.asins.includes(item.asin)) g.asins.push(item.asin)
            g.cost += item.cost
            g.clicks += item.clicks
            g.impressions += item.impressions
            g.sales += item.sales
            g.orders += item.orders
            // series_code: 紐付け済みがあればそれを使う
            if (item.series_code !== null) g.series_code = item.series_code
        })
        return Array.from(map.values()).sort((a, b) => b.cost - a.cost)
    }, [data])

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setIsUploading(true)
        setUploadResult(null)
        const formData = new FormData()
        formData.append('file', file)
        formData.append('month', month)
        try {
            const res = await fetch('/api/amazon-ads/upload-csv', { method: 'POST', body: formData })
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

    const handleAutoMatch = async () => {
        setIsMatching(true)
        setMatchResult(null)
        try {
            const res = await fetch('/api/amazon-ads/auto-match', {
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

    const handleSaveMappings = async () => {
        for (const [campaignName, seriesCode] of mappingChanges) {
            const group = campaignGroups.find(g => g.campaign_name === campaignName)
            if (!group) continue
            // グループ内の全レコードを更新
            for (const id of group.ids) {
                await supabase.from('amazon_ads_performance').update({ series_code: seriesCode }).eq('id', id)
            }
            // 全ASINの学習マッピングを保存
            if (seriesCode !== null) {
                for (const asin of group.asins) {
                    await supabase.from('amazon_code_series_map').upsert({
                        asin,
                        series_code: seriesCode,
                        source: 'manual',
                        updated_at: new Date().toISOString(),
                    }, { onConflict: 'asin' })
                }
            }
        }
        setMappingChanges(new Map())
        fetchData()
    }

    const handleImportCosts = async () => {
        setIsImporting(true)
        setImportResult(null)
        try {
            const res = await fetch('/api/amazon-ads/import-costs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month }),
            })
            const result = await res.json()
            if (result.success) {
                setImportResult(`✅ Amazon広告費 ¥${result.amazon_cost?.toLocaleString()} を取り込みました`)
            } else {
                setImportResult(`❌ ${result.error}`)
            }
        } catch (err: any) {
            setImportResult(`❌ ${err.message}`)
        }
        setIsImporting(false)
    }

    // AIチャットコンテキスト生成
    const getChatContext = () => {
        const topCampaigns = campaignGroups.slice(0, 5).map(g => 
            `${g.campaign_name}(広告費¥${Math.round(g.cost)} 売上¥${Math.round(g.sales)} ROAS${g.cost > 0 ? (g.sales / g.cost).toFixed(2) : '0'})`
        ).join(', ')
        return `${month} Amazon SP広告サマリー: 総広告費¥${Math.round(totalCost).toLocaleString()} / クリック${totalClicks.toLocaleString()} / 平均CPC¥${Math.round(avgCpc)} / 売上¥${Math.round(totalSales).toLocaleString()} / 注文${totalOrders}件 / ROAS${overallRoas.toFixed(2)} / ACOS${(overallAcos * 100).toFixed(1)}% / ${campaignGroups.length}キャンペーン(${data.length}ASIN)\nキャンペーンTOP5: ${topCampaigns}`
    }

    const handleClearMappings = async () => {
        if (!confirm('Amazon広告の紐付けをすべてクリアしますか？')) return
        await fetch('/api/amazon-ads/clear-mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month }),
        })
        fetchData()
    }

    const handleDeleteData = async () => {
        if (!confirm(`${month} のAmazon広告データを全て削除しますか？\nこの操作は取り消しできません。`)) return
        try {
            const res = await fetch('/api/amazon-ads/delete-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month }),
            })
            const result = await res.json()
            if (result.success) {
                setUploadResult(`✅ ${result.deleted}件のデータを削除しました`)
                fetchData()
            } else {
                setUploadResult(`❌ ${result.error}`)
            }
        } catch (err: any) {
            setUploadResult(`❌ ${err.message}`)
        }
    }

    const fmt = (n: number) => n.toLocaleString()
    const fmtCur = (n: number) => `¥${Math.round(n).toLocaleString()}`
    const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`

    const totalCost = data.reduce((s, d) => s + d.cost, 0)
    const totalClicks = data.reduce((s, d) => s + d.clicks, 0)
    const totalImpressions = data.reduce((s, d) => s + d.impressions, 0)
    const totalSales = data.reduce((s, d) => s + d.sales, 0)
    const totalOrders = data.reduce((s, d) => s + d.orders, 0)
    const overallRoas = totalCost > 0 ? totalSales / totalCost : 0
    const overallAcos = totalSales > 0 ? totalCost / totalSales : 0
    const avgCpc = totalClicks > 0 ? totalCost / totalClicks : 0
    const hasMappings = data.some(d => d.series_code !== null)

    const kpis = [
        { label: '広告費', value: fmtCur(totalCost), color: 'text-emerald-600' },
        { label: '表示回数', value: fmt(totalImpressions), color: 'text-blue-600' },
        { label: 'クリック', value: fmt(totalClicks), color: 'text-orange-600' },
        { label: 'CPC', value: fmtCur(avgCpc), color: 'text-pink-600' },
        { label: '売上', value: fmtCur(totalSales), color: 'text-green-600' },
        { label: '注文数', value: fmt(totalOrders), color: 'text-indigo-600' },
        { label: 'ROAS', value: overallRoas.toFixed(2), color: 'text-violet-600' },
        { label: 'ACOS', value: fmtPct(overallAcos), color: 'text-red-600' },
    ]

    return (
        <div className="space-y-5">
            {/* アクションバー */}
            <div className="flex flex-wrap items-center gap-3">
                <input ref={fileInputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleUpload} />
                <button onClick={() => fileInputRef.current?.click()} disabled={isUploading}
                    className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-orange-300 transition-colors font-medium">
                    <Upload size={16} /> {isUploading ? 'アップロード中...' : 'CSVアップロード'}
                </button>

                {data.length > 0 && (
                    <>
                        <button onClick={handleAutoMatch} disabled={isMatching}
                            className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:bg-amber-300 transition-colors font-medium">
                            <Brain size={16} /> {isMatching ? '紐付け中...' : 'AI自動紐付け'}
                        </button>
                        {mappingChanges.size > 0 && (
                            <button onClick={handleSaveMappings}
                                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
                                <Save size={16} /> 保存 ({mappingChanges.size})
                            </button>
                        )}
                        {hasMappings && (
                            <>
                                <button onClick={handleImportCosts} disabled={isImporting}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-colors font-medium ${isCostImported ? 'bg-gray-100 text-gray-500 border border-gray-300' : 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-emerald-300'}`}>
                                    {isCostImported ? <><CheckCircle size={16} /> 取り込み済み</> : <><Download size={16} /> {isImporting ? '取り込み中...' : '広告費取り込み'}</>}
                                </button>
                                <button onClick={handleClearMappings}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium">
                                    <Trash2 size={16} /> 紐付けクリア
                                </button>
                            </>
                        )}

                        <button onClick={handleDeleteData}
                            className="flex items-center gap-2 px-4 py-2.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium text-sm">
                            <Trash2 size={14} /> データ削除
                        </button>
                    </>
                )}

                {data.length > 0 && (
                    <span className="text-sm text-gray-500 flex items-center gap-1">
                        <CheckCircle size={14} className="text-green-500" />
                        {data.length}件取り込み済み
                    </span>
                )}

                <div className="ml-auto flex items-center gap-3">
                    <a href="/docs/amazon-sp-guide" target="_blank"
                        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-orange-600">
                        <ExternalLink size={14} /> ダウンロードガイド
                    </a>
                    {data.length > 0 && (
                        <button onClick={() => setShowChat(!showChat)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${showChat ? 'bg-violet-100 text-violet-700 border border-violet-300' : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white hover:opacity-90'}`}>
                            <Sparkles size={16} /> {showChat ? 'AIチャットを閉じる' : 'AIに質問'}
                        </button>
                    )}
                </div>
            </div>

            {/* 結果メッセージ */}
            {uploadResult && (
                <div className={`px-4 py-2 rounded-lg text-sm ${uploadResult.includes('❌') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{uploadResult}</div>
            )}
            {matchResult && (
                <div className={`px-4 py-2 rounded-lg text-sm ${matchResult.includes('❌') ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{matchResult}</div>
            )}
            {importResult && (
                <div className={`px-4 py-2 rounded-lg text-sm ${importResult.includes('❌') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{importResult}</div>
            )}

            {isLoading ? (
                <div className="text-center py-12 text-gray-500">
                    <RefreshCw size={24} className="animate-spin mx-auto mb-3" />
                    読み込み中...
                </div>
            ) : data.length === 0 ? (
                <div className="bg-white border rounded-xl p-12 text-center text-gray-500">
                    <Upload size={48} className="mx-auto mb-4 text-gray-300" />
                    <p className="text-lg font-medium mb-2">Amazon広告データがありません</p>
                    <p className="text-sm">Amazon Advertisingから「広告対象商品」レポートをダウンロードしてアップロードしてください</p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
                        {kpis.map(kpi => (
                            <div key={kpi.label} className="bg-white border rounded-xl p-3 text-center">
                                <div className="text-xs text-gray-500 mb-1">{kpi.label}</div>
                                <div className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</div>
                            </div>
                        ))}
                    </div>

                    <div className="bg-white border rounded-xl">
                        <div className="p-4 border-b flex items-center justify-between">
                            <h3 className="font-semibold flex items-center gap-2">
                                <Target size={18} className="text-orange-500" />
                                キャンペーン別パフォーマンス — {month}
                            </h3>
                            <span className="text-sm text-gray-500">{campaignGroups.length}キャンペーン（{data.length} ASIN）</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                                <colgroup>
                                    <col style={{ width: '200px' }} />
                                    <col style={{ width: '55px' }} />
                                    <col style={{ width: '85px' }} />
                                    <col style={{ width: '70px' }} />
                                    <col style={{ width: '65px' }} />
                                    <col style={{ width: '85px' }} />
                                    <col style={{ width: '55px' }} />
                                    <col style={{ width: '65px' }} />
                                    <col style={{ width: '60px' }} />
                                    <col style={{ width: '140px' }} />
                                </colgroup>
                                <thead>
                                    <tr className="bg-gray-50 border-b text-gray-600">
                                        <th className="px-3 py-2 text-left">キャンペーン</th>
                                        <th className="px-3 py-2 text-center">ASIN数</th>
                                        <th className="px-3 py-2 text-right">広告費</th>
                                        <th className="px-3 py-2 text-right">クリック</th>
                                        <th className="px-3 py-2 text-right">CPC</th>
                                        <th className="px-3 py-2 text-right">売上</th>
                                        <th className="px-3 py-2 text-right">注文</th>
                                        <th className="px-3 py-2 text-right">ACOS</th>
                                        <th className="px-3 py-2 text-right">ROAS</th>
                                        <th className="px-3 py-2 text-center">シリーズ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {campaignGroups.map(g => {
                                        const cpc = g.clicks > 0 ? g.cost / g.clicks : 0
                                        const acos = g.sales > 0 ? g.cost / g.sales : 0
                                        const roas = g.cost > 0 ? g.sales / g.cost : 0
                                        const currentSc = mappingChanges.has(g.campaign_name)
                                            ? mappingChanges.get(g.campaign_name)
                                            : g.series_code
                                        return (
                                            <tr key={g.campaign_name} className="border-b hover:bg-gray-50">
                                                <td className="px-3 py-2 truncate" title={g.campaign_name}>{g.campaign_name}</td>
                                                <td className="px-3 py-2 text-center text-gray-500">{g.asins.length}</td>
                                                <td className="px-3 py-2 text-right">{fmtCur(g.cost)}</td>
                                                <td className="px-3 py-2 text-right">{fmt(g.clicks)}</td>
                                                <td className="px-3 py-2 text-right">{fmtCur(cpc)}</td>
                                                <td className="px-3 py-2 text-right">{fmtCur(g.sales)}</td>
                                                <td className="px-3 py-2 text-right">{g.orders}</td>
                                                <td className="px-3 py-2 text-right">{fmtPct(acos)}</td>
                                                <td className="px-3 py-2 text-right">{roas.toFixed(2)}</td>
                                                <td className="px-3 py-2">
                                                    <div className="flex flex-col gap-1">
                                                        <select
                                                            value={currentSc ?? ''}
                                                            onChange={e => {
                                                                const v = e.target.value ? parseInt(e.target.value) : null
                                                                setMappingChanges(prev => new Map(prev).set(g.campaign_name, v))
                                                            }}
                                                            className="w-full text-xs border rounded px-1.5 py-1"
                                                        >
                                                            <option value="">未設定</option>
                                                            {seriesOptions.map(s => (
                                                                <option key={s.series_code} value={s.series_code}>{s.series_name}</option>
                                                            ))}
                                                        </select>
                                                        {g.series_code !== null && (() => {
                                                            const asinSource = g.asins.find(a => matchSourceMap.has(a))
                                                            const source = asinSource ? matchSourceMap.get(asinSource) : undefined
                                                            return (
                                                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full text-center ${
                                                                    source === 'ai'
                                                                        ? 'bg-purple-100 text-purple-700'
                                                                        : 'bg-blue-100 text-blue-700'
                                                                }`}>
                                                                    {source === 'ai' ? '🤖 AI' : '📚 学習済'}
                                                                </span>
                                                            )
                                                        })()}
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                                <tfoot className="bg-gray-50 border-t-2 font-semibold">
                                    <tr>
                                        <td className="px-3 py-2">合計</td>
                                        <td className="px-3 py-2 text-center">{data.length}</td>
                                        <td className="px-3 py-2 text-right">{fmtCur(totalCost)}</td>
                                        <td className="px-3 py-2 text-right">{fmt(totalClicks)}</td>
                                        <td className="px-3 py-2 text-right">{fmtCur(avgCpc)}</td>
                                        <td className="px-3 py-2 text-right">{fmtCur(totalSales)}</td>
                                        <td className="px-3 py-2 text-right">{fmt(totalOrders)}</td>
                                        <td className="px-3 py-2 text-right">{fmtPct(overallAcos)}</td>
                                        <td className="px-3 py-2 text-right">{overallRoas.toFixed(2)}</td>
                                        <td className="px-3 py-2"></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* AIチャットウィンドウ */}
                    {showChat && (
                        <AdChatWindow
                            platform="amazon"
                            context={getChatContext()}
                            onClose={() => setShowChat(false)}
                        />
                    )}
                </>
            )}
        </div>
    )
}
