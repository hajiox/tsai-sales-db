// app/api/analyze/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// モデル名は環境変数 OPENAI_MODEL で上書き可（未設定なら gpt-4o-mini）
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

export async function POST(req: Request) {
  const { date } = await req.json();                 // 例: "2025-06-13"
  const month = date.slice(0, 7);                    // "yyyy-MM"

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: sales, error } = await supabase
    .from('daily_sales_report')
    .select('*')
    .gte('date', `${month}-01`)
    .lte('date', date);

  if (error) return NextResponse.json({ ok: false, error: error.message });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const { choices } = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      {
        role: 'user',
        content:
          `以下は当月売上データです。JSON を読み取り、①今月の概況 ②前月比 ③前年同月比 ④特異日ベスト3 を日本語で簡潔にまとめてください。\n\n${JSON.stringify(
            sales,
          )}`,
      },
    ],
  });

  const summary = choices[0]?.message.content ?? '解析結果なし';

  await supabase
    .from('ai_reports')
    .upsert({ month, summary }, { onConflict: 'month' });

  return NextResponse.json({ ok: true, summary });
}
