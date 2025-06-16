// app/api/analyze/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

export async function POST(req: Request) {
  try {
    // ------- input -------
    const body = await req.json().catch(() => ({}));
    // クライアントから日付(YYYY-MM-DD)が送られてくる想定。無ければ今日の日付を使用
    const date = typeof body.date === 'string'
      ? body.date
      : new Date().toISOString().slice(0, 10);
    const month = date.slice(0, 7); // 例: "2025-06"

    // ------- env -------
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const okey = process.env.OPENAI_API_KEY!;
    if (!url || !key || !okey) throw new Error('env_missing');

    // ------- db -------
    const supabase = createClient(url, key);
    const dateObj = new Date(date);
    const lastDay = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);

    const { data: sales, error } = await supabase
      .from('daily_sales_report')
      .select('*')
      .gte('date', `${month}-01`)
      .lte('date', lastDay);

    if (error) throw new Error('select_failed: ' + error.message);

    // ------- ai -------
    const openai = new OpenAI({ apiKey: okey });
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

    const raw = choices[0]?.message.content ?? '';
    const summary = raw.trim() === '' ? '解析結果なし' : raw;

    // ------- save -------
    await supabase
      .from('ai_reports')
      .upsert({ month, content: summary }, { onConflict: 'month' });

    return NextResponse.json({
      ok: true,
      result: summary,
      meta: { month, dataPoints: sales.length },
    });
  } catch (e: any) {
    console.error('analyze_error', e);
    return NextResponse.json({ ok: false, error: e.message });
  }
}
