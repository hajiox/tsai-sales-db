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
    if (!url || !key || !okey) throw new Error('環境変数が設定されていません');

    // ------- db -------
    const supabase = createClient(url, key);
    
    // 当月データ取得
    const { data: currentMonthSales, error: currentError } = await supabase
      .from('daily_sales_report')
      .select('*')
      .gte('date', `${month}-01`)
      .lte('date', date)
      .order('date', { ascending: true });

    if (currentError) throw new Error('当月データ取得失敗: ' + currentError.message);
    if (!currentMonthSales || currentMonthSales.length === 0) {
      throw new Error('分析対象データが存在しません');
    }

    // 前月データ取得（比較用）
    const prevMonth = new Date(date);
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const prevMonthStr = prevMonth.toISOString().slice(0, 7);
    
    const { data: prevMonthSales } = await supabase
      .from('daily_sales_report')
      .select('*')
      .gte('date', `${prevMonthStr}-01`)
      .lt('date', `${month}-01`)
      .order('date', { ascending: true });

    // 前年同月データ取得（比較用）
    const prevYearMonth = new Date(date);
    prevYearMonth.setFullYear(prevYearMonth.getFullYear() - 1);
    const prevYearMonthStr = prevYearMonth.toISOString().slice(0, 7);
    
    const { data: prevYearSales } = await supabase
      .from('daily_sales_report')
      .select('*')
      .gte('date', `${prevYearMonthStr}-01`)
      .lt('date', `${prevYearMonthStr}-32`)
      .order('date', { ascending: true });

    // データ集計
    const currentTotal = currentMonthSales.reduce((sum, day) => ({
      floor_sales: sum.floor_sales + (day.floor_sales || 0),
      ec_total: sum.ec_total + (day.amazon_amount || 0) + (day.rakuten_amount || 0) + 
                (day.yahoo_amount || 0) + (day.mercari_amount || 0) + 
                (day.base_amount || 0) + (day.qoo10_amount || 0),
      register_count: sum.register_count + (day.register_count || 0)
    }), { floor_sales: 0, ec_total: 0, register_count: 0 });

    const prevTotal = prevMonthSales ? prevMonthSales.reduce((sum, day) => ({
      floor_sales: sum.floor_sales + (day.floor_sales || 0),
      ec_total: sum.ec_total + (day.amazon_amount || 0) + (day.rakuten_amount || 0) + 
                (day.yahoo_amount || 0) + (day.mercari_amount || 0) + 
                (day.base_amount || 0) + (day.qoo10_amount || 0)
    }), { floor_sales: 0, ec_total: 0 }) : null;

    const prevYearTotal = prevYearSales ? prevYearSales.reduce((sum, day) => ({
      floor_sales: sum.floor_sales + (day.floor_sales || 0),
      ec_total: sum.ec_total + (day.amazon_amount || 0) + (day.rakuten_amount || 0) + 
                (day.yahoo_amount || 0) + (day.mercari_amount || 0) + 
                (day.base_amount || 0) + (day.qoo10_amount || 0)
    }), { floor_sales: 0, ec_total: 0 }) : null;

    // ------- ai -------
    const openai = new OpenAI({ apiKey: okey });
    
    const analysisPrompt = `あなたは売上分析の専門家です。以下のデータを分析し、詳細なレポートを作成してください。

【当月データ（${month}）】
${JSON.stringify(currentMonthSales, null, 2)}

【当月合計】
フロア売上: ${currentTotal.floor_sales.toLocaleString()}円
EC売上: ${currentTotal.ec_total.toLocaleString()}円
レジ通過人数: ${currentTotal.register_count.toLocaleString()}人

${prevTotal ? `【前月比較】
前月フロア売上: ${prevTotal.floor_sales.toLocaleString()}円
前月EC売上: ${prevTotal.ec_total.toLocaleString()}円
フロア売上前月比: ${((currentTotal.floor_sales / prevTotal.floor_sales - 1) * 100).toFixed(1)}%
EC売上前月比: ${((currentTotal.ec_total / prevTotal.ec_total - 1) * 100).toFixed(1)}%` : ''}

${prevYearTotal ? `【前年同月比較】
前年フロア売上: ${prevYearTotal.floor_sales.toLocaleString()}円
前年EC売上: ${prevYearTotal.ec_total.toLocaleString()}円
フロア売上前年比: ${((currentTotal.floor_sales / prevYearTotal.floor_sales - 1) * 100).toFixed(1)}%
EC売上前年比: ${((currentTotal.ec_total / prevYearTotal.ec_total - 1) * 100).toFixed(1)}%` : ''}

以下の観点で分析してください：
1. 📊 売上概況（全体的な傾向）
2. 📈 前月比分析（増減要因）
3. 📅 前年同月比分析（成長トレンド）
4. ⭐ 特異日ベスト3（売上が特に高い/低い日の特徴）
5. 🔍 EC各チャネル分析（Amazon、楽天、Yahoo等の貢献度）
6. 💡 改善提案（具体的なアクション）

各項目は見出しをつけて、簡潔で分かりやすく日本語で記述してください。`;

    const { choices } = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: 'あなたは小売業の売上分析に特化したAIアナリストです。データから有益なインサイトを抽出し、実用的な提案を行います。'
        },
        {
          role: 'user',
          content: analysisPrompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    const analysis = choices[0]?.message.content ?? '';
    if (!analysis.trim()) {
      throw new Error('AI分析結果を取得できませんでした');
    }

    // ------- save -------
    const { error: saveError } = await supabase
      .from('ai_reports')
      .upsert(
        { 
          month, 
          content: analysis,
          created_at: new Date().toISOString()
        }, 
        { onConflict: 'month' }
      );

    if (saveError) {
      console.error('レポート保存エラー:', saveError);
    }

    return NextResponse.json({ 
      ok: true, 
      result: analysis,
      meta: {
        month,
        dataPoints: currentMonthSales.length,
        totalSales: currentTotal.floor_sales + currentTotal.ec_total,
        hasComparison: {
          prevMonth: !!prevTotal,
          prevYear: !!prevYearTotal
        }
      }
    });

  } catch (e: any) {
    console.error('AI分析エラー:', e);
    return NextResponse.json({ 
      ok: false, 
      error: e.message || '分析処理中にエラーが発生しました',
      details: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
}
