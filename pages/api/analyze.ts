import type { NextApiRequest, NextApiResponse } from 'next'
import OpenAI from 'openai'

/* ---------- 型 ---------- */
type ReqBody = {
  mode: 'summary' | 'compare_recent' | 'compare_last_year' | 'top3'
  payload: any
}
type ResBody =
  | { ok: true; result: string }
  | { ok: false; error: string }

/* ---------- ハンドラ ---------- */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResBody>,
) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method Not Allowed' })
    return
  }

  /* env チェック */
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  if (!OPENAI_API_KEY) {
    res
      .status(500)
      .json({ ok: false, error: 'OPENAI_API_KEY is not set in Vercel env' })
    return
  }

  const body = req.body as ReqBody
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

  try {
    const prompt = buildPrompt(body.mode, body.payload)
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    })
    const answer = completion.choices[0].message.content ?? ''
    res.status(200).json({ ok: true, result: answer })
  } catch (err: any) {
    console.error('analyze error:', err)
    res
      .status(500)
      .json({ ok: false, error: err?.message || 'internal server error' })
  }
}

/* ---------- プロンプト組立 ---------- */
function buildPrompt(mode: ReqBody['mode'], payload: any): string {
  switch (mode) {
    case 'summary':
      return `以下の売上データを要約してください: ${JSON.stringify(payload)}`
    case 'compare_recent':
      return `直近データとの比較をしてください: ${JSON.stringify(payload)}`
    case 'compare_last_year':
      return `昨年同時期との比較をしてください: ${JSON.stringify(payload)}`
    case 'top3':
      return `最も特徴的な3点を抽出してください: ${JSON.stringify(payload)}`
    default:
      return '入力が不正です'
  }
}
