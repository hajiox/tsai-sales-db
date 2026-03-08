// /components/AdChatWindow.tsx
// 広告AI分析チャットウィンドウ — 全タブ共通コンポーネント
"use client"

import React, { useState, useRef, useEffect } from "react"
import { Send, RefreshCw, MessageCircle, X, Sparkles } from "lucide-react"

interface ChatMessage {
    role: 'user' | 'model'
    text: string
}

interface AdChatWindowProps {
    platform: 'amazon' | 'google' | 'meta' | 'rakuten' | 'yahoo'
    context: string      // 広告データサマリー（APIに渡すコンテキスト）
    analysisResult?: string | null  // 初回AI分析の結果（あれば会話に含める）
    onClose?: () => void
}

const platformColors: Record<string, { bg: string; accent: string; gradient: string }> = {
    amazon: { bg: 'bg-orange-50', accent: 'text-orange-600', gradient: 'from-amber-500 to-orange-600' },
    google: { bg: 'bg-blue-50', accent: 'text-blue-600', gradient: 'from-blue-500 to-blue-600' },
    meta: { bg: 'bg-indigo-50', accent: 'text-indigo-600', gradient: 'from-indigo-500 to-purple-600' },
    rakuten: { bg: 'bg-red-50', accent: 'text-red-600', gradient: 'from-red-500 to-red-600' },
    yahoo: { bg: 'bg-purple-50', accent: 'text-purple-600', gradient: 'from-purple-500 to-purple-600' },
}

const suggestedQuestions: Record<string, string[]> = {
    amazon: [
        'ACOSが高い商品の改善策は？',
        'CPCを下げるにはどうすれば？',
        '売上を伸ばすための入札戦略は？',
        '広告費の配分を最適化するには？',
    ],
    google: [
        'コンバージョン率を上げるには？',
        '品質スコアの改善方法は？',
        '予算配分の最適化提案を',
        'リマーケティングの効果的な活用法は？',
    ],
    meta: [
        'CTRを改善するクリエイティブのコツは？',
        'ターゲティングの最適化提案を',
        'フリークエンシーが高すぎる場合の対策は？',
        'インスタとFBの配分はどうすべき？',
    ],
    rakuten: [
        'RPP広告のROIを改善するには？',
        '入札単価の適正値は？',
        'シーズンに合わせた予算配分は？',
        '競合との差別化ポイントは？',
    ],
    yahoo: [
        'クリック単価を最適化するには？',
        '商品ページの改善で売上を上げるには？',
        '広告グループの構成見直し提案を',
        'Yahoo!ショッピングのSEO対策は？',
    ],
}

function renderMarkdown(text: string): string {
    return text
        .replace(/^#### (.*$)/gm, '<h4 class="text-sm font-semibold mt-3 mb-1">$1</h4>')
        .replace(/^### (.*$)/gm, '<h3 class="text-md font-semibold mt-4 mb-1">$1</h3>')
        .replace(/^## (.*$)/gm, '<h2 class="text-lg font-bold mt-5 mb-2">$1</h2>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm">$1</code>')
        .replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>')
        .replace(/^(\d+)\. (.*$)/gm, '<li class="ml-4 list-decimal">$2</li>')
        .replace(/\n/g, '<br/>')
}

export default function AdChatWindow({ platform, context, analysisResult, onClose }: AdChatWindowProps) {
    const colors = platformColors[platform] || platformColors.amazon
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    // 初回分析結果があれば会話履歴に含める
    useEffect(() => {
        if (analysisResult) {
            setMessages([
                { role: 'user', text: '広告パフォーマンスを分析してください' },
                { role: 'model', text: analysisResult },
            ])
        }
    }, [analysisResult])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const sendMessage = async (text: string) => {
        if (!text.trim() || isLoading) return

        const userMsg: ChatMessage = { role: 'user', text: text.trim() }
        const newMessages = [...messages, userMsg]
        setMessages(newMessages)
        setInput('')
        setIsLoading(true)

        try {
            const res = await fetch('/api/ads/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: newMessages,
                    context,
                    platform,
                }),
            })
            const result = await res.json()
            if (result.success) {
                setMessages([...newMessages, { role: 'model', text: result.reply }])
            } else {
                setMessages([...newMessages, { role: 'model', text: `⚠️ エラー: ${result.error}` }])
            }
        } catch (err: any) {
            setMessages([...newMessages, { role: 'model', text: `⚠️ 通信エラー: ${err.message}` }])
        }
        setIsLoading(false)
        setTimeout(() => inputRef.current?.focus(), 100)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage(input)
        }
    }

    const handleReset = () => {
        if (analysisResult) {
            setMessages([
                { role: 'user', text: '広告パフォーマンスを分析してください' },
                { role: 'model', text: analysisResult },
            ])
        } else {
            setMessages([])
        }
        setInput('')
    }

    return (
        <div className="bg-white border rounded-xl overflow-hidden flex flex-col" style={{ maxHeight: '600px' }}>
            {/* ヘッダー */}
            <div className={`px-5 py-3 border-b flex items-center justify-between bg-gradient-to-r ${colors.gradient}`}>
                <div className="flex items-center gap-2 text-white">
                    <Sparkles size={18} />
                    <h3 className="font-semibold text-sm">AI アドバイザー</h3>
                    <span className="text-xs opacity-75">— Gemini 2.5 Flash</span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleReset} className="text-white/70 hover:text-white transition-colors" title="会話リセット">
                        <RefreshCw size={15} />
                    </button>
                    {onClose && (
                        <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
                            <X size={15} />
                        </button>
                    )}
                </div>
            </div>

            {/* メッセージ一覧 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px]" style={{ maxHeight: '400px' }}>
                {messages.length === 0 ? (
                    <div className="text-center py-8">
                        <MessageCircle size={32} className={`mx-auto mb-3 ${colors.accent} opacity-40`} />
                        <p className="text-gray-500 text-sm mb-4">広告データについて何でも質問できます</p>
                        <div className="flex flex-wrap gap-2 justify-center">
                            {(suggestedQuestions[platform] || []).map((q, i) => (
                                <button
                                    key={i}
                                    onClick={() => sendMessage(q)}
                                    className={`text-xs px-3 py-1.5 rounded-full border hover:${colors.bg} ${colors.accent} transition-colors`}
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    messages.map((msg, i) => (
                        <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${msg.role === 'user'
                                    ? `bg-gradient-to-r ${colors.gradient} text-white`
                                    : `${colors.bg} text-gray-800`
                                }`}>
                                {msg.role === 'user' ? (
                                    <p>{msg.text}</p>
                                ) : (
                                    <div
                                        className="prose prose-sm max-w-none [&_li]:my-0.5 [&_h2]:text-base [&_h3]:text-sm"
                                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
                                    />
                                )}
                            </div>
                        </div>
                    ))
                )}

                {isLoading && (
                    <div className="flex justify-start">
                        <div className={`rounded-xl px-4 py-3 ${colors.bg}`}>
                            <div className="flex items-center gap-2">
                                <RefreshCw size={14} className={`animate-spin ${colors.accent}`} />
                                <span className="text-sm text-gray-500">考え中...</span>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* 入力エリア */}
            <div className="border-t p-3">
                <div className="flex items-center gap-2">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="質問を入力... (Enterで送信)"
                        disabled={isLoading}
                        className="flex-1 px-4 py-2 border rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:bg-gray-50"
                    />
                    <button
                        onClick={() => sendMessage(input)}
                        disabled={!input.trim() || isLoading}
                        className={`p-2 rounded-full bg-gradient-to-r ${colors.gradient} text-white disabled:opacity-30 hover:opacity-90 transition-opacity`}
                    >
                        <Send size={16} />
                    </button>
                </div>
                {messages.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {(suggestedQuestions[platform] || [])
                            .filter(q => !messages.some(m => m.text === q))
                            .slice(0, 3)
                            .map((q, i) => (
                                <button
                                    key={i}
                                    onClick={() => sendMessage(q)}
                                    disabled={isLoading}
                                    className="text-xs px-2.5 py-1 rounded-full border text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                                >
                                    {q}
                                </button>
                            ))
                        }
                    </div>
                )}
            </div>
        </div>
    )
}
