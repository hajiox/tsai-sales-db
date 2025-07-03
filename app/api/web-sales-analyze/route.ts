// /api/web-sales-analyze/route.ts ver.改修対応
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    // ------- input -------
    const { month, period = '1month', analysisType = 'comprehensive' } = await req.json();
    const targetMonth = month || '2025-03';
    
    console.log('AI分析開始:', { targetMonth, period, analysisType });

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

    // 期間に応じた開始・終了月を計算
    const { startMonth, endMonth, analysisMonths } = calculatePeriodRange(targetMonth, period);
    console.log('分析期間:', { startMonth, endMonth, analysisMonths });

    // 新しいDB関数を使用して期間データを効率的に取得
    const { data: periodData, error: periodError } = await supabase.rpc('get_period_sales_data', {
      start_month: startMonth,
      end_month: endMonth
    });

    if (periodError || !periodData) {
      console.error('期間データ取得エラー:', periodError);
      return NextResponse.json({ 
        ok: false, 
        error: `期間データの取得に失敗しました: ${periodError?.message}`
      });
    }

    // 現在月の詳細データを取得
    const { data: currentData, error: currentError } = await supabase.rpc('web_sales_full_month', {
      target_month: targetMonth
    });

    if (currentError || !currentData) {
      console.error('現在月データ取得エラー:', currentError);
      return NextResponse.json({ 
        ok: false, 
        error: `現在月データの取得に失敗しました: ${currentError?.message}`
      });
    }

    // 月次チャートデータを取得（トレンド分析用）
    const { data: chartData, error: chartError } = await supabase.rpc('get_monthly_chart_data', {
      start_month: startMonth,
      end_month: endMonth
    });

    if (chartError) {
      console.warn('チャートデータ取得エラー:', chartError);
    }

    console.log(`データ取得完了: 期間集計${periodData.length}商品, 現在月${currentData.length}商品, チャート${chartData?.length || 0}ヶ月`);

    // 効率的な分析データを作成
    const analysisData = createOptimizedAnalysis(
      periodData, 
      currentData, 
      chartData || [], 
      targetMonth, 
      period,
      analysisMonths
    );
    
    // AI分析プロンプトを生成
    const prompt = generateAnalysisPrompt(analysisData, period, analysisType);
    console.log('AI分析プロンプト生成完了');

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

    console.log('AI分析完了');

    return NextResponse.json({ 
      ok: true, 
      result: summary, 
      month: targetMonth,
      period,
      analysisType,
      debugInfo: {
        startMonth,
        endMonth,
        analysisMonths,
        periodDataCount: periodData.length,
        currentDataCount: currentData.length,
        chartDataCount: chartData?.length || 0
      }
    });
  } catch (e: any) {
    console.error('web_sales_analyze_error', e);
    return NextResponse.json({ ok: false, error: e.message });
  }
}

// 期間範囲計算（新しいDB関数用）
function calculatePeriodRange(targetMonth: string, period: string) {
  const [year, month] = targetMonth.split('-').map(Number);
  
  let monthCount = 1;
  switch (period) {
    case '3months': monthCount = 3; break;
    case '6months': monthCount = 6; break;
    case '1year': monthCount = 12; break;
    default: monthCount = 1;
  }

  // 開始月を計算（対象月から遡る）
  const startDate = new Date(year, month - monthCount, 1);
  const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
  
  // 終了月は対象月
  const endMonth = targetMonth;
  
  // 分析対象月リストを生成
  const analysisMonths = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const targetDate = new Date(year, month - 1 - i, 1);
    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    analysisMonths.push(`${y}-${m}`);
  }

  return { startMonth, endMonth, analysisMonths };
}

// 最適化された分析データ作成（新しいDB関数対応）
function createOptimizedAnalysis(
  periodData: any[], 
  currentData: any[], 
  chartData: any[], 
  targetMonth: string, 
  period: string,
  analysisMonths: string[]
) {
  console.log('最適化された分析データ作成開始');

  // 1. 現在月の基本集計
  const siteData = {
    amazon: currentData.reduce((sum: number, item: any) => sum + (item.amazon_count || 0), 0),
    rakuten: currentData.reduce((sum: number, item: any) => sum + (item.rakuten_count || 0), 0),
    yahoo: currentData.reduce((sum: number, item: any) => sum + (item.yahoo_count || 0), 0),
    mercari: currentData.reduce((sum: number, item: any) => sum + (item.mercari_count || 0), 0),
    base: currentData.reduce((sum: number, item: any) => sum + (item.base_count || 0), 0),
    qoo10: currentData.reduce((sum: number, item: any) => sum + (item.qoo10_count || 0), 0)
  };

  // 2. 期間データの集計（DB関数から取得したデータを活用）
  const periodTotalSales = {
    amazon: periodData.reduce((sum: number, item: any) => sum + (item.amazon_count || 0), 0),
    rakuten: periodData.reduce((sum: number, item: any) => sum + (item.rakuten_count || 0), 0),
    yahoo: periodData.reduce((sum: number, item: any) => sum + (item.yahoo_count || 0), 0),
    mercari: periodData.reduce((sum: number, item: any) => sum + (item.mercari_count || 0), 0),
    base: periodData.reduce((sum: number, item: any) => sum + (item.base_count || 0), 0),
    qoo10: periodData.reduce((sum: number, item: any) => sum + (item.qoo10_count || 0), 0)
  };

  // 3. 商品情報とマージして詳細分析データを作成
  const enrichedPeriodData = periodData.map(item => {
    const productInfo = currentData.find(p => p.product_id === item.product_id);
    return {
      ...item,
      product_name: productInfo?.product_name || 'Unknown',
      price: productInfo?.price || 0,
      total_count: (item.amazon_count || 0) + (item.rakuten_count || 0) + (item.yahoo_count || 0) +
                   (item.mercari_count || 0) + (item.base_count || 0) + (item.qoo10_count || 0),
      total_amount: ((item.amazon_count || 0) + (item.rakuten_count || 0) + (item.yahoo_count || 0) +
                     (item.mercari_count || 0) + (item.base_count || 0) + (item.qoo10_count || 0)) * 
                    (productInfo?.price || 0)
    };
  });

  // 4. 期間売上トップ10
  const periodTopProducts = enrichedPeriodData
    .filter(item => item.total_count > 0)
    .sort((a, b) => b.total_count - a.total_count)
    .slice(0, 10);

  // 5. 現在月トップ10
  const currentTopProducts = currentData
    .map((item: any) => ({
      name: item.product_name,
      price: item.price || 0,
      amazon: item.amazon_count || 0,
      rakuten: item.rakuten_count || 0,
      yahoo: item.yahoo_count || 0,
      total_count: (item.amazon_count || 0) + (item.rakuten_count || 0) + (item.yahoo_count || 0),
      total_amount: ((item.amazon_count || 0) + (item.rakuten_count || 0) + (item.yahoo_count || 0)) * (item.price || 0)
    }))
    .filter(item => item.total_count > 0)
    .sort((a, b) => b.total_count - a.total_count)
    .slice(0, 10);

  // 6. チャネル格差分析
  const periodChannelGapAnalysis = enrichedPeriodData
    .filter(item => item.amazon_count > 0 || item.rakuten_count > 0 || item.yahoo_count > 0)
    .map(item => {
      const counts = [item.amazon_count, item.rakuten_count, item.yahoo_count];
      const max = Math.max(...counts);
      const min = Math.min(...counts);
      return {
        name: item.product_name,
        amazon_count: item.amazon_count,
        rakuten_count: item.rakuten_count,
        yahoo_count: item.yahoo_count,
        gap_ratio: max > 0 ? (max - min) / max : 0
      };
    })
    .filter(item => item.gap_ratio > 0.3)
    .sort((a, b) => b.gap_ratio - a.gap_ratio)
    .slice(0, 10);

  // 7. 月次トレンド分析（チャートデータ活用）
  const monthlyTrendAnalysis = chartData.map(item => ({
    month: item.month_label,
    amazon: item.amazon_count,
    rakuten: item.rakuten_count,
    yahoo: item.yahoo_count,
    total: item.total_count
  }));

  // 8. 異常値検知
  const abnormalProducts = currentData
    .filter((item: any) => {
      const total = (item.amazon_count || 0) + (item.rakuten_count || 0) + (item.yahoo_count || 0);
      return total === 0 || (item.price || 0) > 10000 || (item.price || 0) < 100;
    })
    .map((item: any) => ({
      name: item.product_name,
      price: item.price || 0,
      total_sales: (item.amazon_count || 0) + (item.rakuten_count || 0) + (item.yahoo_count || 0),
      issue: (item.amazon_count || 0) + (item.rakuten_count || 0) + (item.yahoo_count || 0) === 0 ? '売上ゼロ' : 
             (item.price || 0) > 10000 ? '高単価' : '低単価'
    }));

  const result = {
    targetMonth,
    period: `${analysisMonths.length}ヶ月間分析`,
    analysis_months: analysisMonths,
    
    // 現在月データ
    siteData,
    currentTopProducts,
    
    // 期間データ
    periodTotalSales,
    periodTopProducts,
    periodChannelGapAnalysis,
    
    // トレンド分析
    monthlyTrendAnalysis,
    
    // その他
    abnormalProducts,
    totalProductCount: currentData.length,
    totalSalesCount: Object.values(siteData).reduce((a: number, b: number) => a + b, 0),
    periodTotalSalesCount: Object.values(periodTotalSales).reduce((a: number, b: number) => a + b, 0)
  };

  console.log('最適化された分析データ作成完了:', {
    periodDataCount: periodData.length,
    currentDataCount: currentData.length,
    chartDataCount: chartData.length,
    topProductsCount: result.periodTopProducts.length
  });

  return result;
}

// AI分析プロンプト生成（簡素化版）
function generateAnalysisPrompt(data: any, period: string, analysisType: string): string {
  const periodText = {
    '1month': '単月',
    '3months': '3ヶ月',
    '6months': '6ヶ月',
    '1year': '12ヶ月'
  }[period] || '単月';

  const basePrompt = `あなたはデータアナリスト兼ECコンサルタントです。
以下のWEB販売データを分析し、売上拡大に向けた戦略的レポートを作成してください。

【分析対象】${data.targetMonth} を基準とした過去${periodText}間の分析
【分析期間】${data.analysis_months.join(', ')}
【主力チャネル】Amazon、楽天、Yahoo (この3チャネルの売上拡大を最優先)

【過去${periodText}間データ概要】
・総売上件数: ${data.periodTotalSalesCount}件
・ECサイト別売上: ${JSON.stringify(data.periodTotalSales, null, 2)}

【現在月(${data.targetMonth})データ】
・総商品数: ${data.totalProductCount}商品
・月間売上件数: ${data.totalSalesCount}件
・ECサイト別売上: ${JSON.stringify(data.siteData, null, 2)}

【期間売上トップ5商品】
${JSON.stringify(data.periodTopProducts.slice(0, 5), null, 2)}

【チャネル格差上位3商品】
${JSON.stringify(data.periodChannelGapAnalysis.slice(0, 3), null, 2)}`;

  let specificPrompt = '';
  
  switch (analysisType) {
    case 'immediate':
      specificPrompt = `
【緊急対応課題】
${JSON.stringify(data.abnormalProducts, null, 2)}

即効性のある改善策を提案してください：
1. 現在月の売上異常値の対策
2. チャネル格差の解消策
3. 今月実行可能なアクション`;
      break;
      
    case 'growth':
      specificPrompt = `
【月次トレンド】
${JSON.stringify(data.monthlyTrendAnalysis, null, 2)}

中期的な売上拡大策を提案してください：
1. 伸び盛り商品の拡大戦略
2. 主力3チャネルでの最適化
3. 3-6ヶ月での売上目標と施策`;
      break;
      
    default:
      specificPrompt = `
包括的な戦略を提案してください：
1. 即効性のある改善策
2. 中期的な成長戦略
3. 主力3チャネル別の最適化
4. 具体的アクションプラン`;
  }

  return basePrompt + specificPrompt + `

【出力形式】
■ 概況サマリー
■ 主力3チャネル分析
■ 重点商品戦略
■ 具体的アクションプラン
■ 売上拡大の数値目標`;
}
