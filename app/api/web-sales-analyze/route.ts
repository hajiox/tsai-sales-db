import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    // ------- input -------
    const { month } = await req.json();
    const targetMonth = month || '2025-06'; // デフォルトは2025年6月

    // ------- env -------
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const okey = process.env.OPENAI_API_KEY!;
    if (!url || !key || !okey) throw new Error('env_missing');

    // ------- db -------
    const supabase = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    // WEB販売データを取得（商品情報と販売実績を結合）
    const { data: salesData, error } = await supabase.rpc('web_sales_full_month', {
      target_month: targetMonth
    });

    if (error) throw new Error('select_failed: ' + error.message);
    
    if (!salesData || salesData.length === 0) {
      return NextResponse.json({ 
        ok: false, 
        error: `${targetMonth}のWEB販売データが取得できません`
      });
    }

    // ECサイト別集計データを追加作成
    const siteData = {
      amazon: salesData.reduce((sum: number, item: any) => sum + (item.amazon_count || 0), 0),
      rakuten: salesData.reduce((sum: number, item: any) => sum + (item.rakuten_count || 0), 0),
      yahoo: salesData.reduce((sum: number, item: any) => sum + (item.yahoo_count || 0), 0),
      mercari: salesData.reduce((sum: number, item: any) => sum + (item.mercari_count || 0), 0),
      base: salesData.reduce((sum: number, item: any) => sum + (item.base_count || 0), 0),
      qoo10: salesData.reduce((sum: number, item: any) => sum + (item.qoo10_count || 0), 0)
    };

    // 売上トップ10商品を抽出
    const topProducts = salesData
      .map((item: any) => ({
        name: item.product_name,
        series: item.series_name,
        total_count: (item.amazon_count || 0) + (item.rakuten_count || 0) + (item.yahoo_count || 0) + 
                    (item.mercari_count || 0) + (item.base_count || 0) + (item.qoo10_count || 0),
        total_amount: ((item.amazon_count || 0) + (item.rakuten_count || 0) + (item.yahoo_count || 0) + 
                      (item.mercari_count || 0) + (item.base_count || 0) + (item.qoo10_count || 0)) * (item.price || 0)
      }))
      .filter((item: any) => item.total_count > 0)
      .sort((a: any, b: any) => b.total_count - a.total_count)
      .slice(0, 10);

    // ------- ai -------
    const openai = new OpenAI({ apiKey: okey });
    const { choices } = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'user',
          content: `以下は${targetMonth}のWEB販売データです。
          
【ECサイト別売上件数】
${JSON.stringify(siteData, null, 2)}

【売上トップ10商品】
${JSON.stringify(topProducts, null, 2)}

このデータを分析して、以下の内容で日本語レポートを作成してください：
①今月の概況（総売上件数、ECサイト別の傾向）
②ECサイト別分析（どのサイトが好調/不調か）
③商品・シリーズ別分析（売れ筋商品の特徴）
④改善提案（売上向上のためのアクションプラン）

簡潔で実用的なレポートをお願いします。`,
        },
      ],
    });

    const raw = choices[0]?.message.content ?? '';
    const summary = raw.trim() === '' ? '解析結果なし' : raw;

    // ------- save -------
    await supabase
      .from('web_sales_ai_reports')
      .upsert({ month: targetMonth, content: summary }, { onConflict: 'month' });

    return NextResponse.json({ ok: true, result: summary, month: targetMonth });
  } catch (e: any) {
    console.error('web_sales_analyze_error', e);
    return NextResponse.json({ ok: false, error: e.message });
  }
}
