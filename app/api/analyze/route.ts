// app/api/analyze/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { formatDateJST } from '@/lib/utils';

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

export async function POST(req: Request) {
  try {
    // ------- input -------
    const body = await req.json().catch(() => ({}));
    const date = '2025-06-13'; // 固定: データがある最新日
    const month = date.slice(0, 7); // "2025-06"

    // ------- env -------
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const okey = process.env.OPENAI_API_KEY!;
    if (!url || !key || !okey) throw new Error('env_missing');

    // ------- db -------
    const supabase = createClient(url, key);
    const { data: sales, error } = await supabase
      .from('daily_sales_report')
      .select('*')
      .gte('date', `${month}-01`)
      .lte('date', date);

    console.log('Debug info:', {
      searchFrom: `${month}-01`,
      searchTo: date,
      resultCount: sales?.length || 0,
      error: error?.message || 'no error',
      firstRecord: sales?.[0] || 'none'
    });

    if (error) throw new Error('select_failed: ' + error.message);

    // デバッグ用レスポンス
    if (!sales || sales.length === 0) {
      return NextResponse.json({ 
        ok: false, 
        error: `データなし: ${month}-01 から ${date} の範囲で検索したが0件`,
        debug: {
          searchFrom: `${month}-01`,
          searchTo: date,
          supabaseError: error?.message || null
        }
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

    return NextResponse.json({ ok: true, result: summary });
  } catch (e: any) {
    console.error('analyze_error', e);
    return NextResponse.json({ ok: false, error: e.message });
  }
}
