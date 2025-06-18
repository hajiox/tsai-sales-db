import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // 過去6ヶ月のデータを取得
    const { data, error } = await supabase
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
      .order('report_month', { ascending: true });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // 月別に集計
    const monthlyData: { [key: string]: any } = {};
    
    data?.forEach(row => {
      const monthKey = new Date(row.report_month).toLocaleDateString('ja-JP', { 
        year: 'numeric', 
        month: 'short' 
      });
      
      if (!monthlyData[monthKey]) {
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
    });

    // 配列に変換して過去6ヶ月分のみ返す
    const chartData = Object.values(monthlyData).slice(-6);

    return NextResponse.json(chartData);
    
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
