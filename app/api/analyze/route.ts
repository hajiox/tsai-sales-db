// app/api/analyze/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

export async function POST(req: Request) {
  const { date } = await req.json();                // 例: "2025-06-13"
  const month = date.slice(0, 7);                   // "yyyy-MM"

  // --- env ---
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const okey = process.env.OPENAI_API_KEY!;
  if (!url || !key || !okey)
    return NextResponse.json({ ok: false, error: 'env_missing' });

  // --- DB ---
  const supabase = createClient(url, key);
  const { data: sales, error } = await supabase
    .from('daily_sales_report')
    .select('*')
    .gte('date', `${month}-01`)
    .lte('date', date);

  if (error)
    return NextResponse.json({ ok: false, error: error.message });

  // --- AI ---
  const openai = new OpenAI({ apiKey: okey });
  const { choices } = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: `以下は当月売上データです。JSON を読み取り、①今月の概況 ②前月比 ③前年同月比 ④特異日ベスト3 を日本語で簡潔にまとめてください。\n\n${JSON.stringify(
          sales,
        )}`,
      },
    ],
  });

  const summary = choices[0]?.message.content ?? '解析結果なし';

  // --- save ---
  await supabase
    .from('ai_reports')
    .upsert({ month, summary }, { onConflict: 'month' });

  return NextResponse.json({ ok: true, summary });
}
