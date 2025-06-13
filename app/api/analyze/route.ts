// app/api/analyze/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: Request) {
  const { date } = await req.json() // 例: "2025-06-13"
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: 'missing_openai_key' })
  }

  const month = date.slice(0, 7) // "yyyy-MM"
  const { data: sales, error } = await supabase
    .from('daily_sales_report')
    .select('*')
    .gte('date', `${month}-01`)
    .lte('date', date)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message })
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: `以下は当月売上データです。JSON を読み取り、①今月の概況 ②前月比 ③前年同月比 ④特異日ベスト3 を日本語で簡潔にまとめてください。\n\n${JSON.stringify(
          sales,
        )}`,
      },
    ],
  })

  const summary = completion.choices[0]?.message?.content ?? '解析結果なし'

  await supabase.from('ai_reports').upsert({ month, summary }, { onConflict: 'month' })

  return NextResponse.json({ ok: true, summary })
}
