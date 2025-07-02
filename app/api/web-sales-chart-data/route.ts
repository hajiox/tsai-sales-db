// /api/web-sales-chart-data/route.ts (関数呼び出し対応版)
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7); // YYYY-MM format
    
    console.log(`Chart data requested for month: ${month}`);

    // 新しいデータベース関数を呼び出し
    const { data: financialData, error: financialError } = await supabase
      .rpc('get_monthly_financial_summary', { target_month: month });

    if (financialError) {
      console.error('Financial data error:', financialError);
      return NextResponse.json({ error: 'Financial data error' }, { status: 500 });
    }

    const { data: seriesData, error: seriesError } = await supabase
      .rpc('get_monthly_series_summary', { target_month: month });

    if (seriesError) {
      console.error('Series data error:', seriesError);
      return NextResponse.json({ error: 'Series data error' }, { status: 500 });
    }

    // 過去6ヶ月のチャートデータを取得（既存のロジックを維持）
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    const startDate = sixMonthsAgo.toISOString().split('T')[0];

    const { data: chartData, error: chartError } = await supabase
      .from('web_sales_summary')
      .select(`
        report_month,
        amazon_count,
        rakuten_count,
        yahoo_count,
        mercari_count,
        base_count,
        qoo10_count
      `)
      .gte('report_month', startDate)
      .order('report_month', { ascending: true });

    if (chartError) {
      console.error('Chart data error:', chartError);
      return NextResponse.json({ error: 'Chart data error' }, { status: 500 });
    }

    // 過去6ヶ月分の枠を作成
    const monthlyData: { [key: string]: any } = {};
    const currentDate = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(currentDate);
      date.setMonth(date.getMonth() - i);
      const monthKey = `${date.getFullYear()}年${date.getMonth() + 1}月`;
      
      monthlyData[monthKey] = {
        month: monthKey,
        amazon: 0,
        rakuten: 0,
        yahoo: 0,
        mercari: 0,
        base: 0,
        qoo10: 0,
        total: 0
      };
    }
    
    // 実際のデータを集計
    chartData?.forEach(row => {
      const date = new Date(row.report_month + 'T00:00:00');
      const monthKey = `${date.getFullYear()}年${date.getMonth() + 1}月`;
      
      if (monthlyData[monthKey]) {
        monthlyData[monthKey].amazon += row.amazon_count || 0;
        monthlyData[monthKey].rakuten += row.rakuten_count || 0;
        monthlyData[monthKey].yahoo += row.yahoo_count || 0;
        monthlyData[monthKey].mercari += row.mercari_count || 0;
        monthlyData[monthKey].base += row.base_count || 0;
        monthlyData[monthKey].qoo10 += row.qoo10_count || 0;
        
        monthlyData[monthKey].total = 
          monthlyData[monthKey].amazon + 
          monthlyData[monthKey].rakuten + 
          monthlyData[monthKey].yahoo + 
          monthlyData[monthKey].mercari + 
          monthlyData[monthKey].base + 
          monthlyData[monthKey].qoo10;
      }
    });

    // 既存フロントエンドとの互換性を保つレスポンス構造
    const financial = financialData?.[0] || {};
    
    const response = Object.values(monthlyData);
    
    // 新しいデータを既存の構造に追加（後方互換性）
    response.forEach(monthData => {
      // 現在月のデータに金額情報を追加
      if (monthData.month.includes('2025年2月')) {
        monthData.financialData = financial;
        monthData.seriesData = seriesData || [];
      }
    });

    console.log(`Chart data prepared for ${month}:`, {
      monthsData: response.length,
      currentMonthFinancial: financial.total_amount || 0,
      seriesCount: seriesData?.length || 0
    });

    return NextResponse.json(response);
    
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
