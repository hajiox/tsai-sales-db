// app/web-sales/advertising/lp-tracking-tab.tsx
"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Plus, ExternalLink, Copy, ChevronDown, ChevronRight, Search, Crosshair } from "lucide-react"

interface LpTarget {
  id: string
  management_name: string
  lp_url: string
  product_value: string | null
  meta_pixel_id: string | null
  status: string
  test_status: string
  memo: string | null
  is_active: boolean
  updated_at: string
  links?: LpLink[]
}

interface LpLink {
  id: string
  destination_name: string
  destination_value: string | null
  url: string | null
  is_active: boolean
  is_tracking_target: boolean
  is_tested: boolean
}

const STATUS_OPTIONS = [
  { value: "未実装", bg: "bg-gray-100 text-gray-500" },
  { value: "実装中", bg: "bg-orange-100 text-orange-700" },
  { value: "実装済", bg: "bg-green-50 text-green-600" },
  { value: "公開済", bg: "bg-green-100 text-green-700" },
  { value: "要修正", bg: "bg-red-100 text-red-700" },
  { value: "停止中", bg: "bg-gray-200 text-gray-600" },
]

const TEST_OPTIONS = [
  { value: "テスト未", bg: "bg-gray-100 text-gray-500" },
  { value: "テスト中", bg: "bg-yellow-100 text-yellow-700" },
  { value: "テスト済", bg: "bg-blue-100 text-blue-700" },
]

const STATUS_COLORS: Record<string, string> = Object.fromEntries(
  [...STATUS_OPTIONS, ...TEST_OPTIONS].map(o => [o.value, o.bg])
)

export default function LpTrackingInlineTab() {
  const router = useRouter()
  const [targets, setTargets] = useState<LpTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    fetchTargets()
  }, [])

  const fetchTargets = async () => {
    try {
      const res = await fetch("/api/lp-tracking")
      if (!res.ok) throw new Error("Failed to fetch")
      const { data } = await res.json()
      setTargets(data || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleInlineUpdate = async (id: string, field: "status" | "test_status", value: string) => {
    // Optimistic UI update
    setTargets(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t))
    try {
      // GET current data then PUT with updated field
      const res = await fetch(`/api/lp-tracking/${id}`)
      if (!res.ok) throw new Error("fetch failed")
      const { data: current } = await res.json()
      const putRes = await fetch(`/api/lp-tracking/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          management_name: current.management_name,
          lp_url: current.lp_url,
          product_value: current.product_value,
          meta_pixel_id: current.meta_pixel_id,
          status: field === "status" ? value : current.status,
          test_status: field === "test_status" ? value : current.test_status,
          memo: current.memo,
          is_active: current.is_active,
          links: current.links,
        }),
      })
      if (!putRes.ok) throw new Error("update failed")
    } catch {
      // Revert on error
      fetchTargets()
    }
  }

  const filteredTargets = targets.filter(t =>
    t.management_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.lp_url.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.product_value || "").toLowerCase().includes(searchQuery.toLowerCase())
  )

  const generateInstructions = (t: LpTarget) => {
    const activeLinks = (t.links || [])
      .filter(l => l.is_active && l.url && l.url.trim() !== '')

    const linkList = activeLinks.map(l => {
      const destLabel = l.destination_name === 'rakuten' ? '楽天' :
        l.destination_name === 'amazon' ? 'Amazon' :
        l.destination_name === 'yahoo' ? 'Yahoo' :
        l.destination_name === 'base' ? 'BASE' :
        l.destination_name === 'own_ec' ? '自社EC' : l.destination_name
      return `${destLabel}：\n${l.url}`
    }).join("\n\n")

    return `対象ページ：\n${t.lp_url}\n\nこのページにMetaピクセルと購入先クリック計測を追加してください。\n\nMeta広告では購入先別の分析は行いません。\n楽天・Amazon・Yahooなど、どの購入先ボタンをクリックしても、共通イベント MallClick だけを送信してください。\nEC別の分析はGoogle Analytics側で行います。\n\n1. 指定Metaピクセルを埋め込む\n\nMetaピクセルID：\n${t.meta_pixel_id || '未設定'}\n\nページ表示時に PageView が発火するようにしてください。\nすでに同じMetaピクセルが入っている場合は、二重設置しないでください。\n\n2. ViewContentを発火する\n\nページ表示時に以下のイベントを発火してください。\n\nfbq('track', 'ViewContent', {\n  content_name: '${t.product_value || ''}',\n  content_category: 'product_lp'\n});\n\n3. 既存の購入先クリックで MallClick を発火する\n\nページ内にすでに存在する購入ボタン／購入リンクを対象にしてください。\n新しいボタンや新しいリンクは作成しないでください。\nページのデザイン、文言、リンク先URLは変更しないでください。\n\n対象にする既存購入リンク：\n${linkList}\n\n上記リンク、または同じ商品コードを含む既存の購入リンクがクリックされた時に、以下のMetaイベントを1回だけ発火してください。\n\nfbq('trackCustom', 'MallClick', {\n  product: '${t.product_value || ''}'\n});\n\n注意点：\n・Googleタグマネージャーは使わず、ページ内に直接実装してください。\n・購入先別のイベント名は作らないでください。\n・destination パラメータは送らないでください。\n・url パラメータは送らないでください。\n・OutboundPurchaseClick は使わないでください。\n・PageView、ViewContent、MallClick が二重発火しないようにしてください。\n【重要】標準のリンク遷移（e.preventDefault()等）は絶対に阻害しないでください。\n【重要】setTimeoutやwindow.openは絶対に使用せず、標準の<a>タグのtarget="_blank"による自然な遷移に任せてください。\n【重要】イベント送信は<a>タグのonClick属性で直接発火させるだけにしてください。\n・window.fbq が存在しない場合でもページがエラーで止まらないようにしてください。\n・実装後、どのファイルを変更したか簡潔に報告してください。\n`
  }

  const handleCopy = (t: LpTarget) => {
    navigator.clipboard.writeText(generateInstructions(t))
    setCopiedId(t.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-3">
          <div className="h-10 bg-gray-200 rounded w-1/3"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
          <div className="h-20 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Crosshair className="text-teal-600" size={22} />
          <h2 className="text-lg font-bold">LP計測・実装指示管理</h2>
          <span className="text-sm text-gray-400">{targets.length}件</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="検索..."
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <button
            onClick={() => router.push("/lp-tracking/new")}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium"
          >
            <Plus size={16} />新規LP登録
          </button>
        </div>
      </div>

      {/* 一覧 */}
      {filteredTargets.length === 0 ? (
        <div className="text-center py-16 bg-white border rounded-xl">
          <Crosshair className="mx-auto text-gray-300 mb-3" size={40} />
          <p className="text-gray-500">
            {targets.length === 0
              ? "LP計測対象が登録されていません。「新規LP登録」から追加してください。"
              : "検索条件に一致するLPがありません。"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTargets.map(t => {
            const isExpanded = expandedId === t.id
            const activeLinks = t.links?.filter(l => l.is_active) || []

            return (
              <div key={t.id} className={`bg-white border rounded-xl overflow-hidden transition-shadow ${isExpanded ? 'shadow-md border-teal-300' : 'hover:shadow-sm'}`}>
                {/* メイン行 */}
                <div className="flex items-center gap-4 px-5 py-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : t.id)}>
                  <div className="flex-shrink-0">
                    {isExpanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-sm">{t.management_name}</span>
                      <select
                        value={t.status}
                        onChange={(e) => { e.stopPropagation(); handleInlineUpdate(t.id, 'status', e.target.value) }}
                        onClick={(e) => e.stopPropagation()}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium border-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-400 ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-500'}`}
                      >
                        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.value}</option>)}
                      </select>
                      {!t.is_active && <span className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full">無効</span>}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 truncate">{t.lp_url}</div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0 text-xs text-gray-500">
                    <div title="product値">{t.product_value || "-"}</div>
                    <div title="購入先数" className="bg-gray-100 px-2 py-0.5 rounded">{activeLinks.length}リンク</div>
                    <select
                      value={t.test_status}
                      onChange={(e) => { e.stopPropagation(); handleInlineUpdate(t.id, 'test_status', e.target.value) }}
                      onClick={(e) => e.stopPropagation()}
                      className={`text-xs px-2 py-0.5 rounded font-medium border-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-400 ${STATUS_COLORS[t.test_status] || 'bg-gray-100 text-gray-500'}`}
                    >
                      {TEST_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.value}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopy(t) }}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${copiedId === t.id ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      title="v0指示文をコピー"
                    >
                      <Copy size={12} />{copiedId === t.id ? "コピー済" : "指示文"}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); router.push(`/lp-tracking/${t.id}`) }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-teal-50 text-teal-700 rounded-lg text-xs font-medium hover:bg-teal-100 transition-colors"
                    >
                      編集
                    </button>
                  </div>
                </div>

                {/* 展開詳細 */}
                {isExpanded && (
                  <div className="border-t px-5 py-4 bg-gray-50/50 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">MetaピクセルID</div>
                        <div className="font-mono text-xs bg-white px-2 py-1 rounded border">{t.meta_pixel_id || "未設定"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">product値</div>
                        <div className="font-mono text-xs bg-white px-2 py-1 rounded border">{t.product_value || "未設定"}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">実装状況</div>
                        <div className={`text-xs px-2 py-1 rounded font-medium inline-block ${STATUS_COLORS[t.status] || ''}`}>{t.status}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">テスト</div>
                        <div className="text-xs">{t.test_status}</div>
                      </div>
                    </div>

                    {/* 購入先リンク一覧 */}
                    {activeLinks.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-gray-600 mb-2">購入先リンク（{activeLinks.length}件 / MallClick対象）</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {activeLinks.map(l => (
                            <div key={l.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border text-xs bg-white border-teal-200">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${l.is_tested ? 'bg-green-400' : 'bg-yellow-400'}`}></span>
                              <span className="font-medium">{l.destination_name}</span>
                              {l.url && (
                                <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 flex-shrink-0">
                                  <ExternalLink size={12} />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {t.memo && (
                      <div>
                        <div className="text-xs font-semibold text-gray-600 mb-1">備考</div>
                        <div className="text-xs text-gray-500 bg-white p-2 rounded border">{t.memo}</div>
                      </div>
                    )}

                    {/* v0指示文プレビュー */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-semibold text-gray-600">v0実装指示文</div>
                        <button
                          onClick={() => handleCopy(t)}
                          className={`flex items-center gap-1 px-3 py-1 rounded text-xs font-medium transition-colors ${copiedId === t.id ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
                        >
                          <Copy size={11} />{copiedId === t.id ? "コピー済!" : "コピー"}
                        </button>
                      </div>
                      <pre className="text-[11px] font-mono bg-slate-900 text-green-400 p-4 rounded-lg overflow-auto max-h-48 whitespace-pre-wrap leading-relaxed">
                        {generateInstructions(t)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
