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
    const date = (body.date ?? formatDateJST(new Date())) as string; // 例: "2025-06-13"
    const month = date.slice(0, 7);                // "yyyy-MM"

    // ------- env -------
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const okey = process.env.OPENAI_API_KEY!;
    if (!url || !key || !okey) throw new Error('env_missing');

    // ------- db -------
    const supabase = createClient(url, key);
    
    // 修正: 6月の全データを取得
    const { data: sales, error } = await supabase
      .from('daily_sales_report')
      .select('*')
      .gte('date', '2025-06-01')
      .lte('date', '2025-06-30')
      .order('date', { ascending: true });

    if (error) throw new Error('select_failed: ' + error.message);

    // データが少なくても分析を実行
    if (!sales || sales.length === 0) {
      return NextResponse.json({ 
        ok: true, 
        result: '6月のデータが見つかりませんでした。データを入力後、再度分析を実行してください。',
        meta: { month, dataPoints: 0 }
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
            `以下は2025年6月の売上データです。次の3つの観点で詳細に分析してください：
            
            ## 📊 今月の概況
            - 全体的な売上傾向と特徴
            - フロア売上とEC売上のバランス
            - 1日あたりの平均売上
            
            ## 📈 売上推移分析
            - 日ごとの売上変動パターン
            - 週末と平日の違い
            - 売上の増減要因
            
            ## ⭐ 特異日ベスト3
            - 売上が特に高い日TOP3とその要因
            - 売上が特に低い日とその要因
            - ECサイト別の好調日
            
            ## 💡 改善提案
            - 売上向上のための具体的な提案

            【データ】
            ${JSON.stringify(sales, null, 2)}
            
            各項目は見出しをつけて、数値を含めて具体的に分析してください。`,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000
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
      meta: { month, dataPoints: sales.length }
    });
  } catch (e: any) {
    console.error('analyze_error', e);
    return NextResponse.json({ ok: false, error: e.message });
  }
}
