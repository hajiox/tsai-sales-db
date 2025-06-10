// app/api/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

type ReqBody = {
  mode: 'summary' | 'compare_recent' | 'compare_last_year' | 'top3'
  payload: any
}

export async function POST(req: NextRequest) {
  /* ---------- env チェック ---------- */
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'OPENAI_API_KEY is not set' },
      { status: 500 },
    )
  }

  const { mode, payload } = (await req.json()) as ReqBody
  const openai = new OpenAI({ apiKey })

  try {
    const prompt = buildPrompt(mode, payload)
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    })
    const answer = completion.choices[0].message.content ?? ''
    return NextResponse.json({ ok: true, result: answer })
  } catch (err: any) {
    console.error("analyze API error:", err)
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 },
    )
  }
}

function buildPrompt(mode: ReqBody['mode'], data: any): string {
  switch (mode) {
    case 'summary':
      return `以下の売上データを要約してください: ${JSON.stringify(data)}`
    case 'compare_recent':
      return `直近データと比較してください: ${JSON.stringify(data)}`
    case 'compare_last_year':
      return `昨年同時期と比較してください: ${JSON.stringify(data)}`
    case 'top3':
      return `最も特徴的な3点を抽出してください: ${JSON.stringify(data)}`
    default:
      return '入力が不正です'
  }
}
