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
    
    // 日別データ取得用のRPCを使用
    const { data: salesData, error } = await supabase.rpc('get_sales_report_data', {
      report_date: date
    });

    console.log('Debug info:', {
      rpcCall: 'get_sales_report_data',
      reportDate: date,
      result: salesData || 'null'
    });

    if (error) throw new Error('rpc_failed: ' + error.message);

    // 6月の全日別データを取得
    const { data: allJuneData, error: juneError } = await supabase
      .from('daily_sales_report')
      .select('*')
      .gte('date', '2025-06-01')
      .lte('date', '2025-06-13');

    if (juneError) throw new Error('june_data_failed: ' + juneError.message);
    
    if (!allJuneData || allJuneData.length === 0) {
      return NextResponse.json({ 
        ok: false, 
        error: `6月の日別データが取得できません`,
        debug: { 
          rpcResult: salesData,
          juneDataCount: allJuneData?.length || 0
        }
      });
    }

    // AI用データとして日別データを使用
    const sales = allJuneData;

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
