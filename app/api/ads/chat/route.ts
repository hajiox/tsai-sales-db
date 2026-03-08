// /app/api/ads/chat/route.ts
// 広告AI分析チャット — 会話履歴を保持しつつGeminiに問い合わせ
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface ChatMessage {
    role: 'user' | 'model'
    text: string
}

export async function POST(request: NextRequest) {
    try {
        const { messages, context, platform } = await request.json() as {
            messages: ChatMessage[]
            context: string  // 広告データのサマリー
            platform: string // amazon | google | meta | rakuten | yahoo
        }

        if (!messages || messages.length === 0) {
            return NextResponse.json({ success: false, error: 'メッセージは必須です' }, { status: 400 })
        }

        const geminiApiKey = process.env.GEMINI_API_KEY
        if (!geminiApiKey) {
            return NextResponse.json({ success: false, error: 'GEMINI_API_KEY未設定' }, { status: 500 })
        }

        const platformNames: Record<string, string> = {
            amazon: 'Amazon スポンサープロダクト広告',
            google: 'Google広告',
            meta: 'Meta（Facebook/Instagram）広告',
            rakuten: '楽天広告（RPP）',
            yahoo: 'Yahoo!広告（アイテムマッチ）',
        }

        const systemPrompt = `あなたは${platformNames[platform] || 'WEB広告'}の専門アドバイザーです。
以下の広告パフォーマンスデータに基づいて、質問に対して的確に回答してください。

## 広告データコンテキスト
${context}

## ルール
- 日本語で回答してください
- データに基づいた具体的なアドバイスをしてください
- 広告運用の改善提案は具体的な数値や施策を含めてください
- マーケティング全般の質問にも対応してください
- 回答はMarkdown形式で構造化してください`

        // Gemini API用の会話履歴を構築
        const contents = [
            {
                role: 'user',
                parts: [{ text: systemPrompt + '\n\n' + messages[0].text }]
            }
        ]

        // 2つ目以降のメッセージを追加
        for (let i = 1; i < messages.length; i++) {
            contents.push({
                role: messages[i].role === 'user' ? 'user' : 'model',
                parts: [{ text: messages[i].text }]
            })
        }

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents }),
            }
        )

        const geminiData = await geminiRes.json()
        const reply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
            || '回答を生成できませんでした。もう一度お試しください。'

        return NextResponse.json({ success: true, reply })
    } catch (error: any) {
        console.error('広告チャットエラー:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
