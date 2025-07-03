import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    // ------- input -------
    const { month, period = '1month', analysisType = 'comprehensive' } = await req.json();
    const targetMonth = month || '2025-03'; // デフォルトを現在月に修正
    
    console.log('AI分析開始:', { targetMonth, period, analysisType }); // デバッグログ

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
    console.log('分析対象月:', analysisMonths); // デバッグログ
    
    const allSalesData = [];
    
    for (const monthStr of analysisMonths) {
      console.log(`${monthStr}のデータ取得中...`); // デバッグログ
      const { data, error } = await supabase.rpc('web_sales_full_month', {
        target_month: monthStr
      });
      if (!error && data) {
        console.log(`${monthStr}: ${data.length}商品取得`); // デバッグログ
        allSalesData.push({ month: monthStr, data });
      } else {
        console.log(`${monthStr}: データ取得エラーまたはデータなし`, error); // デバッグログ
      }
    }

    if (allSalesData.length === 0) {
      return NextResponse.json({ 
        ok: false, 
        error: `${targetMonth}周辺のWEB販売データが取得できません`
      });
    }

    console.log(`総取得データ: ${allSalesData.length}ヶ月分`); // デバッグログ

    // 高度な分析データを作成
    const analysisData = createAdvancedAnalysis(allSalesData, targetMonth, period);
    
    // AI分析プロンプトを生成
    const prompt = generateAnalysisPrompt(analysisData, period, analysisType);
    console.log('AI分析プロンプト生成完了'); // デバッグログ

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

    console.log('AI分析完了'); // デバッグログ

    return NextResponse.json({ 
      ok: true, 
      result: summary, 
      month: targetMonth,
      period,
      analysisType,
      debugInfo: {
        analysisMonths,
        dataCount: allSalesData.length
      }
    });
  } catch (e: any) {
    console.error('web_sales_analyze_error', e);
    return NextResponse.json({ ok: false, error: e.message });
  }
}

// 分析期間の月リストを生成（修正版）
function getAnalysisMonths(targetMonth: string, period: string): string[] {
  console.log('getAnalysisMonths:', { targetMonth, period }); // デバッグログ
  
  const [year, month] = targetMonth.split('-').map(Number);
  const months = [];
  
  let monthCount = 1;
  switch (period) {
    case '3months': monthCount = 3; break;
    case '6months': monthCount = 6; break;
    case '1year': monthCount = 12; break;
    default: monthCount = 1;
  }

  console.log(`${monthCount}ヶ月分のデータを取得します`); // デバッグログ

  // 対象月から遡って指定月数分の月を生成
  for (let i = monthCount - 1; i >= 0; i--) {
    const targetDate = new Date(year, month - 1 - i, 1);
    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
  }
  
  console.log('生成された月リスト:', months); // デバッグログ
  return months;
}

// 高度な分析データを作成（全期間データ活用版）
function createAdvancedAnalysis(allSalesData: any[], targetMonth: string, period: string) {
  console.log('createAdvancedAnalysis開始:', { targetMonth, period }); // デバッグログ
  
  const currentData = allSalesData.find(d => d.month === targetMonth)?.data || [];
  console.log(`現在月(${targetMonth})のデータ: ${currentData.length}商品`); // デバッグログ
  
  // 全期間データの統合
  const allPeriodData = new Map();
  let totalPeriodSales = { amazon: 0, rakuten: 0, yahoo: 0, mercari: 0, base: 0, qoo10: 0 };
  
  // 全期間のデータを商品別に集計
  allSalesData.forEach(monthData => {
    monthData.data.forEach((item: any) => {
      const productName = item.product_name;
      if (!allPeriodData.has(productName)) {
        allPeriodData.set(productName, {
          name: productName,
          price: item.price || 0,
          amazon_total: 0,
          rakuten_total: 0,
          yahoo_total: 0,
          mercari_total: 0,
          base_total: 0,
          qoo10_total: 0,
          monthly_data: []
        });
      }
      
      const product = allPeriodData.get(productName);
      product.amazon_total += (item.amazon_count || 0);
      product.rakuten_total += (item.rakuten_count || 0);
      product.yahoo_total += (item.yahoo_count || 0);
      product.mercari_total += (item.mercari_count || 0);
      product.base_total += (item.base_count || 0);
      product.qoo10_total += (item.qoo10_count || 0);
      
      product.monthly_data.push({
        month: monthData.month,
        amazon: item.amazon_count || 0,
        rakuten: item.rakuten_count || 0,
        yahoo: item.yahoo_count || 0,
        total: (item.amazon_count || 0) + (item.rakuten_count || 0) + (item.yahoo_count || 0)
      });
      
      // 全期間合計
      totalPeriodSales.amazon += (item.amazon_count || 0);
      totalPeriodSales.rakuten += (item.rakuten_count || 0);
      totalPeriodSales.yahoo += (item.yahoo_count || 0);
      totalPeriodSales.mercari += (item.mercari_count || 0);
      totalPeriodSales.base += (item.base_count || 0);
      totalPeriodSales.qoo10 += (item.qoo10_count || 0);
    });
  });

  console.log('全期間ECサイト別集計:', totalPeriodSales); // デバッグログ
  
  // 1. 現在月の基本集計（従来通り）
  const siteData = {
    amazon: currentData.reduce((sum: number, item: any) => sum + (item.amazon_count || 0), 0),
    rakuten: currentData.reduce((sum: number, item: any) => sum + (item.rakuten_count || 0), 0),
    yahoo: currentData.reduce((sum: number, item: any) => sum + (item.yahoo_count || 0), 0),
    mercari: currentData.reduce((sum: number, item: any) => sum + (item.mercari_count || 0), 0),
    base: currentData.reduce((sum: number, item: any) => sum + (item.base_count || 0), 0),
    qoo10: currentData.reduce((sum: number, item: any) => sum + (item.qoo10_count || 0), 0)
  };

  // 2. 全期間での売上トップ10
  const periodTopProducts = Array.from(allPeriodData.values())
    .map((product: any) => ({
      name: product.name,
      price: product.price,
      amazon_total: product.amazon_total,
      rakuten_total: product.rakuten_total,
      yahoo_total: product.yahoo_total,
      total_count: product.amazon_total + product.rakuten_total + product.yahoo_total,
      total_amount: (product.amazon_total + product.rakuten_total + product.yahoo_total) * product.price,
      monthly_trend: product.monthly_data
    }))
    .filter((product: any) => product.total_count > 0)
    .sort((a: any, b: any) => b.total_count - a.total_count)
    .slice(0, 10);

  // 3. 現在月のトップ10（比較用）
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
    .filter((item: any) => item.total_count > 0)
    .sort((a: any, b: any) => b.total_count - a.total_count)
    .slice(0, 10);

  // 4. 全期間でのチャネル格差分析
  const periodChannelGapAnalysis = Array.from(allPeriodData.values())
    .filter((product: any) => product.amazon_total > 0 || product.rakuten_total > 0 || product.yahoo_total > 0)
    .map((product: any) => {
      const counts = [product.amazon_total, product.rakuten_total, product.yahoo_total];
      const max = Math.max(...counts);
      const min = Math.min(...counts);
      return {
        name: product.name,
        amazon_total: product.amazon_total,
        rakuten_total: product.rakuten_total,
        yahoo_total: product.yahoo_total,
        gap_ratio: max > 0 ? (max - min) / max : 0
      };
    })
    .filter((item: any) => item.gap_ratio > 0.3) // 30%以上の格差
    .sort((a: any, b: any) => b.gap_ratio - a.gap_ratio)
    .slice(0, 10);

  // 5. 成長・衰退分析（全期間トレンド）
  let growthAnalysis = null;
  let periodTrendAnalysis = null;
  
  if (allSalesData.length > 1) {
    console.log(`${allSalesData.length}ヶ月分のトレンド分析を実行`); // デバッグログ
    
    // 各商品の成長トレンドを分析
    growthAnalysis = Array.from(allPeriodData.values())
      .map((product: any) => {
        const monthlyData = product.monthly_data.sort((a: any, b: any) => a.month.localeCompare(b.month));
        if (monthlyData.length < 2) return null;
        
        const firstHalf = monthlyData.slice(0, Math.floor(monthlyData.length / 2));
        const secondHalf = monthlyData.slice(Math.floor(monthlyData.length / 2));
        
        const firstHalfAvg = firstHalf.reduce((sum: number, m: any) => sum + m.total, 0) / firstHalf.length;
        const secondHalfAvg = secondHalf.reduce((sum: number, m: any) => sum + m.total, 0) / secondHalf.length;
        
        const trendRate = firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg * 100) : 0;
        
        return {
          name: product.name,
          total_sales: product.amazon_total + product.rakuten_total + product.yahoo_total,
          first_half_avg: Math.round(firstHalfAvg),
          second_half_avg: Math.round(secondHalfAvg),
          trend_rate: Math.round(trendRate * 100) / 100
        };
      })
      .filter((item: any) => item !== null && item.total_sales > 0)
      .sort((a: any, b: any) => b.trend_rate - a.trend_rate)
      .slice(0, 15);

    // 期間全体のトレンド分析
    periodTrendAnalysis = {
      months_analyzed: allSalesData.length,
      total_trend: calculatePeriodTrend(allSalesData),
      channel_trends: calculateChannelTrends(allSalesData),
      period_summary: {
        total_sales: Object.values(totalPeriodSales).reduce((a: number, b: number) => a + b, 0),
        amazon_share: Math.round((totalPeriodSales.amazon / Object.values(totalPeriodSales).reduce((a: number, b: number) => a + b, 0)) * 100),
        rakuten_share: Math.round((totalPeriodSales.rakuten / Object.values(totalPeriodSales).reduce((a: number, b: number) => a + b, 0)) * 100),
        yahoo_share: Math.round((totalPeriodSales.yahoo / Object.values(totalPeriodSales).reduce((a: number, b: number) => a + b, 0)) * 100)
      }
    };
  }

  // 6. 異常値検知（現在月）
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
    period: `${allSalesData.length}ヶ月間分析`,
    analysis_months: allSalesData.map(d => d.month),
    
    // 現在月データ
    siteData,
    currentTopProducts,
    
    // 全期間データ
    periodTotalSales: totalPeriodSales,
    periodTopProducts,
    periodChannelGapAnalysis,
    
    // トレンド分析
    growthAnalysis,
    periodTrendAnalysis,
    
    // その他
    abnormalProducts,
    totalProductCount: currentData.length,
    totalSalesCount: Object.values(siteData).reduce((a: number, b: number) => a + b, 0),
    periodTotalSalesCount: Object.values(totalPeriodSales).reduce((a: number, b: number) => a + b, 0)
  };

  console.log('分析データ作成完了:', {
    targetMonth: result.targetMonth,
    period: result.period,
    months: result.analysis_months,
    currentMonthSales: result.totalSalesCount,
    periodTotalSales: result.periodTotalSalesCount
  }); // デバッグログ

  return result;
}

// 期間トレンド計算
function calculatePeriodTrend(allSalesData: any[]) {
  const monthlyTotals = allSalesData.map(monthData => {
    const total = monthData.data.reduce((sum: number, item: any) => {
      return sum + (item.amazon_count || 0) + (item.rakuten_count || 0) + (item.yahoo_count || 0);
    }, 0);
    return { month: monthData.month, total };
  });
  
  return monthlyTotals;
}

// チャネル別トレンド計算
function calculateChannelTrends(allSalesData: any[]) {
  return allSalesData.map(monthData => {
    const siteData = {
      month: monthData.month,
      amazon: monthData.data.reduce((sum: number, item: any) => sum + (item.amazon_count || 0), 0),
      rakuten: monthData.data.reduce((sum: number, item: any) => sum + (item.rakuten_count || 0), 0),
      yahoo: monthData.data.reduce((sum: number, item: any) => sum + (item.yahoo_count || 0), 0)
    };
    return siteData;
  });
}

// AI分析プロンプトを生成（過去期間データ活用版）
function generateAnalysisPrompt(data: any, period: string, analysisType: string): string {
  const periodText = {
    '1month': '単月',
    '3months': '3ヶ月',
    '6months': '6ヶ月',
    '1year': '12ヶ月'
  }[period] || '単月';

  const basePrompt = `あなたはデータアナリスト兼ECコンサルタントです。
以下のWEB販売データを分析し、売上全体拡大に向けた戦略的レポートを作成してください。

【分析対象】${data.targetMonth} を基準とした過去${periodText}間の分析
【分析期間】${data.analysis_months.join(', ')}
【主力チャネル】Amazon、楽天、Yahoo (この3チャネルの売上拡大を最優先)

【過去${periodText}間データ概要】
・分析期間: ${data.period}
・過去${periodText}間総売上件数: ${data.periodTotalSalesCount}件
・過去${periodText}間ECサイト別売上件数:
${JSON.stringify(data.periodTotalSales, null, 2)}

【現在月(${data.targetMonth})データ】
・総商品数: ${data.totalProductCount}商品
・月間売上件数: ${data.totalSalesCount}件
・ECサイト別売上件数:
${JSON.stringify(data.siteData, null, 2)}

【過去${periodText}間売上トップ10商品】
${JSON.stringify(data.periodTopProducts.slice(0, 5), null, 2)}

【過去${periodText}間チャネル格差が大きい商品】
${JSON.stringify(data.periodChannelGapAnalysis.slice(0, 3), null, 2)}`;

  let specificPrompt = '';
  
  switch (analysisType) {
    case 'immediate':
      specificPrompt = `
【現在月の緊急対応が必要な課題】
${JSON.stringify(data.abnormalProducts, null, 2)}

以下の観点で即効性のある改善策を提案してください：
1. 現在月の売上異常値の原因分析と対策
2. 過去${periodText}間データから見るチャネル格差の解消策
3. 今月実行可能なアクションプラン
4. 主力3チャネルでの緊急テコ入れ商品`;
      break;
      
    case 'growth':
      specificPrompt = `
【成長・衰退トレンド（過去${periodText}間分析）】
${data.growthAnalysis ? JSON.stringify(data.growthAnalysis.slice(0, 10), null, 2) : '成長分析データなし'}

${data.periodTrendAnalysis ? `【期間トレンド詳細】
${JSON.stringify(data.periodTrendAnalysis, null, 2)}` : ''}

以下の観点で中期的な売上拡大策を提案してください：
1. 過去${periodText}間で伸び盛りの商品とその成功要因分析
2. 衰退商品のテコ入れ vs 終売判断
3. 主力3チャネルでの商品別最適戦略
4. 過去${periodText}間のトレンドを踏まえた3-6ヶ月での売上目標と施策ロードマップ`;
      break;
      
    default: // comprehensive
      specificPrompt = `
【総合分析】以下すべての観点から包括的な戦略を提案してください：
1. 【即効性】現在月の異常値・過去${periodText}間のチャネル格差解消策
2. 【成長戦略】過去${periodText}間データから見る伸び盛り商品の拡大策
3. 【最適化】主力3チャネル別の商品戦略（過去${periodText}間パフォーマンス基準）
4. 【具体的アクション】過去${periodText}間のトレンドを踏まえた今月〜3ヶ月の実行プラン

${data.periodTrendAnalysis ? `【期間トレンド参考情報】
${JSON.stringify(data.periodTrendAnalysis, null, 2)}` : ''}

${data.growthAnalysis ? `【成長商品トップ5】
${JSON.stringify(data.growthAnalysis.slice(0, 5), null, 2)}` : ''}`;
  }

  return basePrompt + specificPrompt + `

【重要】必ず過去${periodText}間のデータ（${data.periodTotalSalesCount}件の売上実績）を基準に分析し、
現在月（${data.totalSalesCount}件）のデータは補完情報として活用してください。

【出力形式】
■ 概況サマリー (過去${periodText}間・${data.targetMonth}基準)
■ 主力3チャネル分析（過去${periodText}間パフォーマンス基準）
■ 重点商品戦略（過去${periodText}間データ基準）
■ 具体的アクションプラン
■ 売上拡大の数値目標

実用的で具体的な提案をお願いします。`;
}
