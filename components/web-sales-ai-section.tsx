// /api/web-sales-analyze/route.ts ver.6項目分析専用（詳細版）
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
 try {
   // ------- input -------
   const { month } = await req.json();
   const targetMonth = month || '2025-03';
   
   console.log('6項目AI分析開始:', { targetMonth });

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

   // 過去6ヶ月の期間を計算
   const [year, monthNum] = targetMonth.split('-').map(Number);
   const endDate = new Date(year, monthNum - 1, 1);
   const startDate = new Date(year, monthNum - 6, 1);
   const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;

   console.log('分析期間:', { startMonth, endMonth: targetMonth });

   // 1. 現在月データ取得
   const { data: currentData, error: currentError } = await supabase.rpc('get_monthly_financial_summary', {
     target_month: targetMonth
   });

   if (currentError || !currentData || currentData.length === 0) {
     console.error('現在月データ取得エラー:', currentError);
     return NextResponse.json({ 
       ok: false, 
       error: `現在月データの取得に失敗しました: ${currentError?.message}`
     });
   }

   // 2. 前年同月データ取得
   const { data: previousYearData, error: prevYearError } = await supabase.rpc('get_previous_year_data', {
     target_month: targetMonth
   });

   if (prevYearError) {
     console.warn('前年同月データ取得エラー:', prevYearError);
   }

   // 3. 過去6ヶ月チャートデータ取得
   const { data: chartData, error: chartError } = await supabase.rpc('get_monthly_chart_data', {
     start_month: startMonth,
     end_month: targetMonth
   });

   if (chartError) {
     console.warn('チャートデータ取得エラー:', chartError);
   }

   // 4. 商品別トレンド分析取得
   const { data: trendData, error: trendError } = await supabase.rpc('get_product_trend_analysis', {
     target_month: targetMonth
   });

   if (trendError) {
     console.warn('トレンドデータ取得エラー:', trendError);
   }

   console.log('データ取得完了:', {
     currentData: currentData.length,
     previousYearData: previousYearData?.length || 0,
     chartData: chartData?.length || 0,
     trendData: trendData?.length || 0
   });

   // 分析データを整理
   const analysisData = organize6ItemsAnalysis(
     currentData[0], 
     previousYearData?.[0] || null, 
     chartData || [], 
     trendData || [], 
     targetMonth
   );
   
   // 6項目専用AIプロンプトを生成
   const prompt = generate6ItemsPrompt(analysisData);
   console.log('6項目AIプロンプト生成完了');

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
       analysis_period: '6months',
       analysis_type: '6items'
     }, { onConflict: 'month' });

   console.log('6項目AI分析完了');

   return NextResponse.json({ 
     ok: true, 
     result: summary, 
     month: targetMonth,
     analysisType: '6items',
     debugInfo: {
       currentDataExists: !!currentData[0],
       previousYearDataExists: !!previousYearData?.[0],
       chartDataCount: chartData?.length || 0,
       trendDataCount: trendData?.length || 0
     }
   });
 } catch (e: any) {
   console.error('6項目AI分析エラー', e);
   return NextResponse.json({ ok: false, error: e.message });
 }
}

// 6項目分析用データ整理
function organize6ItemsAnalysis(
 currentData: any,
 previousYearData: any,
 chartData: any[],
 trendData: any[],
 targetMonth: string
) {
 console.log('6項目分析データ整理開始');

 // 1. 今月の総括データ
 const currentSummary = {
   month: targetMonth,
   total_count: currentData.total_count || 0,
   total_amount: currentData.total_amount || 0,
   amazon: { count: currentData.amazon_count || 0, amount: currentData.amazon_amount || 0 },
   rakuten: { count: currentData.rakuten_count || 0, amount: currentData.rakuten_amount || 0 },
   yahoo: { count: currentData.yahoo_count || 0, amount: currentData.yahoo_amount || 0 },
   mercari: { count: currentData.mercari_count || 0, amount: currentData.mercari_amount || 0 },
   base: { count: currentData.base_count || 0, amount: currentData.base_amount || 0 },
   qoo10: { count: currentData.qoo10_count || 0, amount: currentData.qoo10_amount || 0 }
 };

 // 2. 前年同月対比データ
 const yearOverYearComparison = previousYearData ? {
   previous_year_month: `${parseInt(targetMonth.split('-')[0]) - 1}-${targetMonth.split('-')[1]}`,
   current: currentSummary,
   previous: {
     total_count: previousYearData.total_count || 0,
     total_amount: previousYearData.total_amount || 0,
     amazon: { count: previousYearData.amazon_count || 0, amount: previousYearData.amazon_amount || 0 },
     rakuten: { count: previousYearData.rakuten_count || 0, amount: previousYearData.rakuten_amount || 0 },
     yahoo: { count: previousYearData.yahoo_count || 0, amount: previousYearData.yahoo_amount || 0 }
   },
   growth_rates: {
     total_count_rate: previousYearData.total_count > 0 ? 
       Math.round(((currentSummary.total_count - previousYearData.total_count) / previousYearData.total_count) * 100) : 0,
     total_amount_rate: previousYearData.total_amount > 0 ? 
       Math.round(((currentSummary.total_amount - previousYearData.total_amount) / previousYearData.total_amount) * 100) : 0,
     amazon_rate: previousYearData.amazon_count > 0 ? 
       Math.round(((currentSummary.amazon.count - previousYearData.amazon_count) / previousYearData.amazon_count) * 100) : 0,
     rakuten_rate: previousYearData.rakuten_count > 0 ? 
       Math.round(((currentSummary.rakuten.count - previousYearData.rakuten_count) / previousYearData.rakuten_count) * 100) : 0,
     yahoo_rate: previousYearData.yahoo_count > 0 ? 
       Math.round(((currentSummary.yahoo.count - previousYearData.yahoo_count) / previousYearData.yahoo_count) * 100) : 0
   }
 } : null;

 // 3. 伸びている商品（成長・大幅成長・新規成長）
 const growingProducts = trendData
   .filter(item => ['成長', '大幅成長', '新規成長'].includes(item.trend_type))
   .slice(0, 10);

 // 4. 落ち込んでいる商品（衰退・大幅衰退・急激衰退）
 const decliningProducts = trendData
   .filter(item => ['衰退', '大幅衰退', '急激衰退'].includes(item.trend_type))
   .slice(0, 10);

 // 5. 各ECの6ヶ月推移分析
 const channelTrends = chartData.length > 0 ? {
   monthly_data: chartData,
   amazon_trend: calculateChannelTrend(chartData, 'amazon_count'),
   rakuten_trend: calculateChannelTrend(chartData, 'rakuten_count'),
   yahoo_trend: calculateChannelTrend(chartData, 'yahoo_count'),
   mercari_trend: calculateChannelTrend(chartData, 'mercari_count'),
   base_trend: calculateChannelTrend(chartData, 'base_count'),
   qoo10_trend: calculateChannelTrend(chartData, 'qoo10_count')
 } : null;

 // 6. 特異点検知
 const anomalies = detectAnomalies(currentSummary, trendData, chartData);

 const result = {
   targetMonth,
   currentSummary,
   yearOverYearComparison,
   growingProducts,
   decliningProducts,
   channelTrends,
   anomalies
 };

 console.log('6項目分析データ整理完了:', {
   currentExists: !!currentSummary,
   yearComparisonExists: !!yearOverYearComparison,
   growingProductsCount: growingProducts.length,
   decliningProductsCount: decliningProducts.length,
   channelTrendsExists: !!channelTrends,
   anomaliesCount: anomalies.length
 });

 return result;
}

// チャネル別トレンド計算
function calculateChannelTrend(chartData: any[], channelKey: string) {
 if (chartData.length < 2) return { trend: '不明', rate: 0 };
 
 const firstHalf = chartData.slice(0, Math.ceil(chartData.length / 2));
 const secondHalf = chartData.slice(Math.floor(chartData.length / 2));
 
 const firstAvg = firstHalf.reduce((sum, item) => sum + (item[channelKey] || 0), 0) / firstHalf.length;
 const secondAvg = secondHalf.reduce((sum, item) => sum + (item[channelKey] || 0), 0) / secondHalf.length;
 
 const rate = firstAvg > 0 ? Math.round(((secondAvg - firstAvg) / firstAvg) * 100) : 0;
 
 let trend = '安定';
 if (rate > 20) trend = '大幅成長';
 else if (rate > 10) trend = '成長';
 else if (rate < -20) trend = '大幅衰退';
 else if (rate < -10) trend = '衰退';
 
 return { trend, rate, firstAvg: Math.round(firstAvg), secondAvg: Math.round(secondAvg) };
}

// 特異点検知
function detectAnomalies(currentSummary: any, trendData: any[], chartData: any[]) {
 const anomalies = [];
 
 // 1. ECサイト間の極端な格差
 const channels = [currentSummary.amazon.count, currentSummary.rakuten.count, currentSummary.yahoo.count];
 const maxChannel = Math.max(...channels);
 const minChannel = Math.min(...channels);
 if (maxChannel > 0 && (maxChannel / Math.max(minChannel, 1)) > 10) {
   anomalies.push({
     type: 'チャネル格差',
     description: 'ECサイト間の売上格差が極端に大きい',
     detail: `最大${maxChannel}件 vs 最小${minChannel}件`
   });
 }
 
 // 2. 急激な変化の商品
 const extremeChanges = trendData.filter(item => 
   ['新規成長', '急激衰退'].includes(item.trend_type) || Math.abs(item.trend_rate) > 200
 );
 if (extremeChanges.length > 0) {
   anomalies.push({
     type: '急激変化商品',
     description: `${extremeChanges.length}商品で急激な売上変化を検知`,
     detail: extremeChanges.slice(0, 3).map(p => `${p.product_name}: ${p.trend_rate}%`).join(', ')
   });
 }
 
 // 3. 月次売上の異常な変動
 if (chartData.length >= 2) {
   const lastMonth = chartData[chartData.length - 1];
   const secondLastMonth = chartData[chartData.length - 2];
   const changeRate = secondLastMonth.total_count > 0 ? 
     ((lastMonth.total_count - secondLastMonth.total_count) / secondLastMonth.total_count) * 100 : 0;
   
   if (Math.abs(changeRate) > 50) {
     anomalies.push({
       type: '月次急変',
       description: '前月からの売上変動が異常に大きい',
       detail: `前月比 ${Math.round(changeRate)}%`
     });
   }
 }
 
 return anomalies;
}

// 6項目専用AIプロンプト生成（詳細版）
function generate6ItemsPrompt(data: any): string {
 return `あなたはECデータアナリストです。以下のWEB販売データを6つの項目に分けて詳細に分析してください。

【分析対象月】${data.targetMonth}

【データ概要】
現在月売上: ${data.currentSummary.total_count}件、¥${data.currentSummary.total_amount?.toLocaleString()}
${data.yearOverYearComparison ? `前年同月: ${data.yearOverYearComparison.previous.total_count}件、¥${data.yearOverYearComparison.previous.total_amount?.toLocaleString()}` : '前年同月データなし'}

【成長商品】${data.growingProducts.length}商品
${JSON.stringify(data.growingProducts.slice(0, 5), null, 2)}

【衰退商品】${data.decliningProducts.length}商品  
${JSON.stringify(data.decliningProducts.slice(0, 5), null, 2)}

【ECサイト別トレンド】
${data.channelTrends ? JSON.stringify(data.channelTrends, null, 2) : 'トレンドデータなし'}

【特異点】
${JSON.stringify(data.anomalies, null, 2)}

以下の6項目で詳細な分析結果を出力してください。各項目は5-7行程度で具体的に記述してください：

## ① 今月の総括
今月の売上状況を詳細に分析し、主要な特徴と傾向を説明してください。総売上件数、金額、主力ECサイトの状況、前月との比較を含めて分析してください。特に注目すべき変化や全体的なパフォーマンスについて具体的な数値を交えて説明してください。

## ② 前年同月対比  
${data.yearOverYearComparison ? 
`前年同月（${data.yearOverYearComparison.previous_year_month}）との詳細比較を行ってください。成長率${data.yearOverYearComparison.growth_rates.total_count_rate}%、金額ベース${data.yearOverYearComparison.growth_rates.total_amount_rate}%の背景要因を分析し、Amazon（${data.yearOverYearComparison.growth_rates.amazon_rate}%）、楽天（${data.yearOverYearComparison.growth_rates.rakuten_rate}%）、Yahoo（${data.yearOverYearComparison.growth_rates.yahoo_rate}%）の各チャネル別成長率の意味を詳しく解説してください。年間トレンドとしての位置づけも含めてください。` : 
'前年同月データがないため、現在月の売上構造を詳細に分析し、季節性や市場環境を考慮した評価を行ってください。各ECサイトの売上構成比と特徴、商品カテゴリ別の動向について詳しく説明してください。'}

## ③ 伸びている商品
過去6ヶ月で成長トレンドを示している${data.growingProducts.length}商品について詳細に分析してください。特に成長率上位商品の成功要因、価格帯別の傾向、商品カテゴリごとの特徴を具体的に説明してください。成長パターン（新規成長、大幅成長、安定成長）別の戦略的意味合いと、今後の売上拡大に向けた具体的な施策提案も含めてください。

## ④ 落ち込んでいる商品  
過去6ヶ月で衰退トレンドを示している${data.decliningProducts.length}商品について詳細に分析してください。衰退の主要因（季節性、競合、価格、商品ライフサイクル等）を特定し、衰退パターン（急激衰退、大幅衰退、緩やかな衰退）ごとの対策方針を提示してください。テコ入れ可能な商品と終売検討商品の判別基準も含めて具体的に説明してください。

## ⑤ 各ECの伸び落ち検証
Amazon、楽天、Yahoo、メルカリ、BASE、Qoo10の6ヶ月推移を詳細に検証してください。各チャネルの成長率、売上構成比の変化、強み・弱みの分析を具体的に行ってください。特に主力3チャネル（Amazon、楽天、Yahoo）の競合状況と最適化戦略、新興チャネル（メルカリ、BASE、Qoo10）の成長可能性について数値を交えて詳しく説明してください。

## ⑥ 特異点
${data.anomalies.length}件の特異点について詳細な原因分析と対応策を提示してください。チャネル格差、急激変化商品、月次急変等の各異常値について、ビジネスへの影響度評価と緊急度判定を行ってください。特に売上機会損失の可能性がある項目については、具体的な改善アクションプランと期待効果を数値目標付きで提案してください。

各項目では必ず具体的な商品名、数値、パーセンテージを含めて分析し、実用的で行動につながる提案を行ってください。`;
}
