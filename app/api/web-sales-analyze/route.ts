// /api/web-sales-analyze/route.ts ver.Gemini2.0Flash (3項目特化版)
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";

// モデル指定
const GEMINI_MODEL = "gemini-2.0-flash";

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    // ------- input -------
    const { month } = await req.json();
    const targetMonth = month || new Date().toISOString().slice(0, 7);

    console.log('Gemini 2.0 Flash 分析開始:', { targetMonth });

    // ------- env -------
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
    const geminiKey = process.env.GEMINI_API_KEY ?? (() => { throw new Error("GEMINI_API_KEY is not set"); })();

    // ------- db -------
    const supabase = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // 日付計算
    const [year, monthNum] = targetMonth.split('-').map(Number);
    // 直近3ヶ月の開始月（例: target=2025-03 -> start=2025-01）
    const dateObj = new Date(year, monthNum - 1, 1);
    const threeMonthsAgo = new Date(dateObj);
    threeMonthsAgo.setMonth(dateObj.getMonth() - 2);
    const startMonth3 = `${threeMonthsAgo.getFullYear()}-${String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')}`;

    console.log('分析期間(3ヶ月):', { startMonth3, endMonth: targetMonth });

    // 1. 直近3ヶ月の販売データ取得 (get_period_sales_data)
    // DB関数が内部で '-01' を追加するため、"YYYY-MM" 形式で渡す
    const { data: periodSalesData, error: periodError } = await supabase.rpc('get_period_sales_data', {
      start_month: startMonth3,
      end_month: targetMonth
    });

    if (periodError) {
      console.error('期間データ取得エラー:', periodError);
      throw new Error(`期間データの取得に失敗: ${periodError.message}`);
    }

    // 2. 商品マスタ取得（シリーズ情報付与用）
    const { data: productsData, error: productsError } = await supabase
      .from('products')
      .select('id, name, series, price');

    if (productsError) throw new Error(`商品マスタ取得失敗: ${productsError.message}`);

    const productsMap = new Map(productsData.map(p => [p.id, p]));

    // 3. 今月のシリーズ別サマリー取得
    const { data: currentSeriesData, error: currentSeriesError } = await supabase.rpc('get_monthly_series_summary', {
      target_month: targetMonth
    });

    // 4. 前年同月のシリーズ別サマリー取得
    const prevYearMonth = `${year - 1}-${String(monthNum).padStart(2, '0')}`;
    const { data: prevYearSeriesData, error: prevYearSeriesError } = await supabase.rpc('get_monthly_series_summary', {
      target_month: prevYearMonth
    });

    // 5. 商品トレンド分析（急上昇・急落特定用）
    const { data: trendData, error: trendError } = await supabase.rpc('get_product_trend_analysis', {
      target_month: targetMonth
    });

    // データ整理
    const analysisData = organize3ItemsAnalysis(
      periodSalesData,
      currentSeriesData,
      prevYearSeriesData,
      trendData,
      productsMap,
      targetMonth,
      prevYearMonth,
      startMonth3
    );

    // プロンプト生成
    const prompt = generate3ItemsPrompt(analysisData);
    console.log('Geminiプロンプト生成完了');

    // ------- AI生成 (Gemini) -------
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const summary = response.text();

    console.log('Gemini生成完了:', summary.slice(0, 50) + '...');

    // ------- save -------
    await supabase
      .from('web_sales_ai_reports')
      .upsert({
        month: targetMonth,
        content: summary,
        analysis_period: '3months', // 変更
        analysis_type: '3items_gemini' // タイプ変更
      }, { onConflict: 'month' });

    return NextResponse.json({
      ok: true,
      result: summary,
      month: targetMonth,
      analysisType: '3items_gemini'
    });

  } catch (e: any) {
    console.error('AI分析エラー', e);
    return NextResponse.json({ ok: false, error: e.message });
  }
}

// 3項目分析用データ整理
function organize3ItemsAnalysis(
  periodSalesData: any[],
  currentSeriesData: any[],
  prevYearSeriesData: any[],
  trendData: any[],
  productsMap: Map<string, any>,
  targetMonth: string,
  prevYearMonth: string,
  startMonth3: string
) {
  // ① シリーズ別3ヶ月推移の集計
  // periodSalesData は期間合計なので、月ごとの推移を見るには各月のデータが必要だが、
  // ここでは簡易的に期間合計と直近月の比較、あるいはトレンドデータを利用する。
  // 正確に3ヶ月推移を見るには月ごとに集計する必要があるが、ここでは「期間合計」と「直近月」を使って
  // 「直近に偏っているか」などを簡易分析できるようにする。

  // シリーズごとの集計
  const seriesPeriodStats: Record<string, { count: number, sales: number, products: Set<string> }> = {};

  periodSalesData?.forEach(sale => {
    const product = productsMap.get(sale.product_id);
    if (!product) return;

    const seriesName = product.series || 'その他';
    if (!seriesPeriodStats[seriesName]) {
      seriesPeriodStats[seriesName] = { count: 0, sales: 0, products: new Set() };
    }

    const count = sale.total_count || 0;
    const price = product.price || 0;

    seriesPeriodStats[seriesName].count += count;
    seriesPeriodStats[seriesName].sales += count * price;
    seriesPeriodStats[seriesName].products.add(product.name);
  });

  const series3MonthsAnalysis = Object.entries(seriesPeriodStats).map(([name, stats]) => ({
    seriesName: name,
    threeMonthTotalCount: stats.count,
    threeMonthTotalSales: stats.sales,
    productCount: stats.products.size
  }));

  // ② シリーズ別前年比
  const seriesYearOverYear = currentSeriesData?.map((curr: any) => {
    const prev = prevYearSeriesData?.find((p: any) => p.series_name === curr.series_name);
    return {
      seriesName: curr.series_name,
      current: { count: curr.series_count, amount: curr.series_amount },
      prev: prev ? { count: prev.series_count, amount: prev.series_amount } : null,
      growthRate: prev && prev.series_amount > 0 ?
        Math.round(((curr.series_amount - prev.series_amount) / prev.series_amount) * 100) : null
    };
  }) || [];

  // ③ 急上昇・急落商品
  const soaringProducts = trendData
    ?.filter((item: any) => ['新規成長', '大幅成長', '成長'].includes(item.trend_type))
    .sort((a: any, b: any) => b.trend_rate - a.trend_rate)
    .slice(0, 5)
    .map((p: any) => ({
      name: p.product_name,
      trend: p.trend_type,
      rate: p.trend_rate,
      sales: p.current_sales
    }));

  const plungingProducts = trendData
    ?.filter((item: any) => ['急激衰退', '大幅衰退', '衰退'].includes(item.trend_type))
    .sort((a: any, b: any) => a.trend_rate - b.trend_rate) // 昇順（マイナスが大きい順）
    .slice(0, 5)
    .map((p: any) => ({
      name: p.product_name,
      trend: p.trend_type,
      rate: p.trend_rate,
      sales: p.current_sales
    }));

  return {
    targetMonth,
    prevYearMonth,
    startMonth3,
    series3MonthsAnalysis,
    seriesYearOverYear,
    soaringProducts,
    plungingProducts
  };
}

function generate3ItemsPrompt(data: any): string {
  return `あなたはEC売上分析のプロフェッショナルです。以下のデータを基に、経営者向けの鋭い分析レポートを作成してください。
対象月: ${data.targetMonth}

【データソース】
1. 直近3ヶ月(${data.startMonth3}〜${data.targetMonth})のシリーズ別実績:
${JSON.stringify(data.series3MonthsAnalysis, null, 2)}

2. シリーズ別 前年同月比較(${data.prevYearMonth} vs ${data.targetMonth}):
${JSON.stringify(data.seriesYearOverYear, null, 2)}

3. 先月比で著しく動いた商品:
急上昇: ${JSON.stringify(data.soaringProducts, null, 2)}
急落: ${JSON.stringify(data.plungingProducts, null, 2)}

【出力要件】
以下の3つのセクションのみを出力してください。各セクションの見出しは「## 」で始めてください。
マークダウン形式で記述し、具体的な数字（金額やパーセンテージ）を必ず引用して説得力を持たせてください。
語り口は「〜です。〜と考えられます。」といった、丁寧かつ分析的なトーンでお願いします。

## ① 直近3ヶ月のシリーズ別特異点
${data.startMonth3}から${data.targetMonth}の直近3ヶ月において、各商品シリーズにどのような特徴的な動き（特異点）があったか詳細に解説してください。
特に売上が集中しているシリーズや、逆に動きが止まっているシリーズについて言及し、その背景にある要因（季節性、在庫、広告など）を推測してください。

## ② シリーズ別 前年比の評価
前年同月と比較した際の良い点（成長しているシリーズとその要因）と悪い点（衰退しているシリーズとその要因）を明確に分けて解説してください。
単に「増えた/減った」だけでなく、その増減が経営に与えるインパクトについても触れてください。

## ③ 急上昇・急落商品の解説
先月と比較して売上が著しく伸びた商品、または落ち込んだ商品について、具体的な商品名を挙げながら解説してください。
なぜその商品が動いたのか（または止まったのか）、その要因を分析し、今後の対策（在庫補充、販促強化、撤退など）を一言添えてください。
`;
}
