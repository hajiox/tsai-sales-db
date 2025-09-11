// app/api/analyze/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

export async function POST(req: Request) {
  try {
    // ------- input -------
    const date = '2025-06-13'; // 固定: データがある最新日
    const month = date.slice(0, 7); // "2025-06"

    // ------- env -------
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
    const key  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
    const okey = process.env.OPENAI_API_KEY ?? (() => { throw new Error("OPENAI_API_KEY is not set"); })();
    if (!url || !key || !okey) throw new Error('env_missing');

    // ------- db -------
    const supabase = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    // 6月の全日別データを取得（Service Role KeyでRLSをバイパス）
    const { data: sales, error } = await supabase
      .from('daily_sales_report')
      .select('*')
      .gte('date', '2025-06-01')
      .lte('date', '2025-06-13')
      .order('date', { ascending: true });

    if (error) throw new Error('select_failed: ' + error.message);
    
    if (!sales || sales.length === 0) {
      return NextResponse.json({ 
        ok: false, 
        error: '6月の日別データが取得できません'
      });
    }

    // ------- ai -------
    const openai = new OpenAI({ apiKey: okey });
    const { choices } = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'user',
          content:
            `以下は2025年6月の売上データです。JSON を読み取り、①今月の概況 ②前月比 ③前年同月比 ④特異日ベスト3 を日本語で簡潔にまとめてください。\n\n${JSON.stringify(
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

    return NextResponse.json({ ok: true, result: summary });
  } catch (e: any) {
    console.error('analyze_error', e);
    return NextResponse.json({ ok: false, error: e.message });
  }
}
