import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    // ------- input -------
    const { month, period = '1month', analysisType = 'comprehensive' } = await req.json();
    const targetMonth = month || '2025-06';

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

    // 期間に応じたデータ取得
    const analysisMonths = getAnalysisMonths(targetMonth, period);
    const allSalesData = [];
    
    for (const monthStr of analysisMonths) {
      const { data, error } = await supabase.rpc('web_sales_full_month', {
        target_month: monthStr
      });
      if (!error && data) {
        allSalesData.push({ month: monthStr, data });
      }
    }

    if (allSalesData.length === 0) {
      return NextResponse.json({ 
        ok: false, 
        error: `${targetMonth}周辺のWEB販売データが取得できません`
      });
    }

    // 高度な分析データを作成
    const analysisData = createAdvancedAnalysis(allSalesData, targetMonth);
    
    // AI分析プロンプトを生成
    const prompt = generateAnalysisPrompt(analysisData, period, analysisType);

    // ------- ai -------
    const openai = new OpenAI({ apiKey: okey });
    const { choices } = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = choices[0]?.message.content ?? '';
    const summary = raw.trim() === '' ? '解析結果なし' : raw;

    // ------- save -------
    await supabase
      .from('web_sales_ai_reports')
      .upsert({ 
        month: targetMonth, 
        content: summary,
        analysis_period: period,
        analysis_type: analysisType
      }, { onConflict: 'month' });

    return NextResponse.json({ 
      ok: true, 
      result: summary, 
      month: targetMonth,
      period,
      analysisType
    });
  } catch (e: any) {
    console.error('web_sales_analyze_error', e);
    return NextResponse.json({ ok: false, error: e.message });
  }
}

// 分析期間の月リストを生成
function getAnalysisMonths(targetMonth: string, period: string): string[] {
  const [year, month] = targetMonth.split('-').map(Number);
  const months = [];
  
  let monthCount = 1;
  switch (period) {
    case '3months': monthCount = 3; break;
    case '6months': monthCount = 6; break;
    case '1year': monthCount = 12; break;
    default: monthCount = 1;
  }

  for (let i = monthCount - 1; i >= 0; i--) {
    const targetDate = new Date(year, month - 1 - i, 1);
    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
  }
  
  return months;
}

// 高度な分析データを作成
function createAdvancedAnalysis(allSalesData: any[], targetMonth: string) {
  const currentData = allSalesData.find(d => d.month === targetMonth)?.data || [];
  
  // 1. 基本集計
  const siteData = {
    amazon: currentData.reduce((sum: number, item: any) => sum + (item.amazon_count || 0), 0),
    rakuten: currentData.reduce((sum: number, item: any) => sum + (item.rakuten_count || 0), 0),
    yahoo: currentData.reduce((sum: number, item: any) => sum + (item.yahoo_count || 0), 0),
    mercari: currentData.reduce((sum: number, item: any) => sum + (item.mercari_count || 0), 0),
    base: currentData.reduce((sum: number, item: any) => sum + (item.base_count || 0), 0),
    qoo10: currentData.reduce((sum: number, item: any) => sum + (item.qoo10_count || 0), 0)
  };

  // 2. 売上トップ10 & ワースト5
  const productAnalysis = currentData
    .map((item: any) => ({
      name: item.product_name,
      price: item.price || 0,
      amazon: item.amazon_count || 0,
      rakuten: item.rakuten_count || 0,
      yahoo: item.yahoo_count || 0,
      total_count: (item.amazon_count || 0) + (item.rakuten_count || 0) + (item.yahoo_count || 0) + 
                  (item.mercari_count || 0) + (item.base_count || 0) + (item.qoo10_count || 0),
      total_amount: ((item.amazon_count || 0) + (item.rakuten_count || 0) + (item.yahoo_count || 0) + 
                    (item.mercari_count || 0) + (item.base_count || 0) + (item.qoo10_count || 0)) * (item.price || 0)
    }))
    .filter((item: any) => item.total_count > 0)
    .sort((a: any, b: any) => b.total_count - a.total_count);

  const topProducts = productAnalysis.slice(0, 10);
  const worstProducts = productAnalysis.slice(-5).reverse();

  // 3. チャネル格差分析（同一商品での売上格差）
  const channelGapAnalysis = currentData
    .filter((item: any) => (item.amazon_count || 0) > 0 || (item.rakuten_count || 0) > 0 || (item.yahoo_count || 0) > 0)
    .map((item: any) => {
      const counts = [item.amazon_count || 0, item.rakuten_count || 0, item.yahoo_count || 0];
      const max = Math.max(...counts);
      const min = Math.min(...counts);
      return {
        name: item.product_name,
        amazon: item.amazon_count || 0,
        rakuten: item.rakuten_count || 0,
        yahoo: item.yahoo_count || 0,
        gap_ratio: max > 0 ? (max - min) / max : 0
      };
    })
    .filter((item: any) => item.gap_ratio > 0.5) // 50%以上の格差
    .sort((a: any, b: any) => b.gap_ratio - a.gap_ratio)
    .slice(0, 5);

  // 4. 成長・衰退分析（複数月データがある場合）
  let growthAnalysis = null;
  if (allSalesData.length > 1) {
    const previousData = allSalesData[allSalesData.length - 2]?.data || [];
    
    growthAnalysis = currentData
      .map((current: any) => {
        const previous = previousData.find((p: any) => p.product_name === current.product_name);
        if (!previous) return null;
        
        const currentTotal = (current.amazon_count || 0) + (current.rakuten_count || 0) + (current.yahoo_count || 0);
        const previousTotal = (previous.amazon_count || 0) + (previous.rakuten_count || 0) + (previous.yahoo_count || 0);
        
        if (previousTotal === 0) return null;
        
        return {
          name: current.product_name,
          current_sales: currentTotal,
          previous_sales: previousTotal,
          growth_rate: ((currentTotal - previousTotal) / previousTotal * 100)
        };
      })
      .filter((item: any) => item !== null)
      .sort((a: any, b: any) => b.growth_rate - a.growth_rate);
  }

  // 5. 異常値検知
  const abnormalProducts = currentData
    .filter((item: any) => {
      const total = (item.amazon_count || 0) + (item.rakuten_count || 0) + (item.yahoo_count || 0);
      // 売上0または単価が異常に高い/低い商品
      return total === 0 || (item.price || 0) > 10000 || (item.price || 0) < 100;
    })
    .map((item: any) => ({
      name: item.product_name,
      price: item.price || 0,
      total_sales: (item.amazon_count || 0) + (item.rakuten_count || 0) + (item.yahoo_count || 0),
      issue: (item.amazon_count || 0) + (item.rakuten_count || 0) + (item.yahoo_count || 0) === 0 ? '売上ゼロ' : 
             (item.price || 0) > 10000 ? '高単価' : '低単価'
    }));

  return {
    targetMonth,
    period: allSalesData.length > 1 ? `${allSalesData.length}ヶ月間` : '単月',
    siteData,
    topProducts,
    worstProducts,
    channelGapAnalysis,
    growthAnalysis,
    abnormalProducts,
    totalProductCount: currentData.length,
    totalSalesCount: Object.values(siteData).reduce((a: number, b: number) => a + b, 0)
  };
}

// AI分析プロンプトを生成
function generateAnalysisPrompt(data: any, period: string, analysisType: string): string {
  const basePrompt = `あなたはデータアナリスト兼ECコンサルタントです。
以下のWEB販売データを分析し、売上全体拡大に向けた戦略的レポートを作成してください。

【分析対象】${data.targetMonth} (${data.period})
【主力チャネル】Amazon、楽天、Yahoo (この3チャネルの売上拡大を最優先)

【データ概要】
・総商品数: ${data.totalProductCount}商品
・総売上件数: ${data.totalSalesCount}件
・ECサイト別売上件数:
${JSON.stringify(data.siteData, null, 2)}

【売上トップ10商品】
${JSON.stringify(data.topProducts, null, 2)}

【チャネル格差が大きい商品】
${JSON.stringify(data.channelGapAnalysis, null, 2)}`;

  let specificPrompt = '';
  
  switch (analysisType) {
    case 'immediate':
      specificPrompt = `
【緊急対応が必要な課題】
${JSON.stringify(data.abnormalProducts, null, 2)}

以下の観点で即効性のある改善策を提案してください：
1. 売上異常値の原因分析と対策
2. チャネル格差の解消策（価格調整、販促施策）
3. 今月実行可能なアクションプラン
4. 主力3チャネルでの緊急テコ入れ商品`;
      break;
      
    case 'growth':
      specificPrompt = `
【成長・衰退トレンド】
${data.growthAnalysis ? JSON.stringify(data.growthAnalysis.slice(0, 10), null, 2) : '前月データなし'}

以下の観点で中期的な売上拡大策を提案してください：
1. 伸び盛り商品の成功要因分析
2. 衰退商品のテコ入れ vs 終売判断
3. 主力3チャネルでの商品別最適戦略
4. 3-6ヶ月での売上目標と施策ロードマップ`;
      break;
      
    default: // comprehensive
      specificPrompt = `
【総合分析】以下すべての観点から包括的な戦略を提案してください：
1. 【即効性】異常値商品・チャネル格差の解消策
2. 【成長戦略】伸び盛り商品の拡大策
3. 【最適化】主力3チャネル別の商品戦略
4. 【具体的アクション】今月〜3ヶ月の実行プラン`;
  }

  return basePrompt + specificPrompt + `

【出力形式】
■ 概況サマリー
■ 主力3チャネル分析
■ 重点商品戦略
■ 具体的アクションプラン
■ 売上拡大の数値目標

実用的で具体的な提案をお願いします。`;
}
