import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function GET() {
  return NextResponse.json({ ok: false, error: 'GET not supported; use POST' })
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey)
    return NextResponse.json(
      { ok: false, error: 'OPENAI_API_KEY not set' },
      { status: 500 },
    )

  const { mode, payload } = await req.json()
  const openai = new OpenAI({ apiKey })

  try {
    const prompt = `mode: ${mode}, data: ${JSON.stringify(payload)}`
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    })
    return NextResponse.json({ ok: true, result: completion.choices[0].message.content })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 },
    )
  }
}
