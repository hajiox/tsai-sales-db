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

    console.log('分析開始:', { date, month });

    // ------- env -------
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const okey = process.env.OPENAI_API_KEY!;
    if (!url || !key || !okey) throw new Error('env_missing');

    // ------- db -------
    const supabase = createClient(url, key);
    
    // デバッグ: 全6月データを確認
    const { data: allJuneData, error: allError } = await supabase
      .from('daily_sales_report')
      .select('date')
      .gte('date', '2025-06-01')
      .lte('date', '2025-06-30');
    
    console.log('6月の全データ日付:', allJuneData?.map(d => d.date));

    const { data: sales, error } = await supabase
      .from('daily_sales_report')
      .select('*')
      .gte('date', `${month}-01`)
      .lte('date', date)
      .order('date', { ascending: true });

    console.log('取得されたデータ:', { 
      searchRange: `${month}-01 から ${date}`,
      resultCount: sales?.length || 0,
      firstResult: sales?.[0]?.date
    });

    if (error) throw new Error('select_failed: ' + error.message);

    // データが少なくても分析を実行
    if (!sales || sales.length === 0) {
      return NextResponse.json({ 
        ok: true, 
        result: `データ検索結果: ${month}-01から${date}の範囲でデータが見つかりませんでした。\n\n6月の利用可能なデータ: ${allJuneData?.map(d => d.date).join(', ') || 'なし'}\n\nデータを入力後、再度分析を実行してください。`,
        meta: { month, dataPoints: 0, availableDates: allJuneData?.map(d => d.date) || [] }
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
            `以下は${month}月の売上データです。次の3つの観点で簡潔に分析してください：
            
            1. 📊 **今月の概況** - 全体的な売上傾向と特徴
            2. 📈 **前月・前々月との比較** - 増減の傾向と要因分析  
            3. ⭐ **特異日ベスト3** - 売上が特に高い/低い日とその理由

            データ：
            ${JSON.stringify(sales, null, 2)}
            
            各項目は見出しをつけて、分かりやすく日本語で記述してください。`,
        },
      ],
      temperature: 0.7,
      max_tokens: 1500
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
