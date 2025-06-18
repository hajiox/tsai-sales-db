import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // 過去6ヶ月の開始日を計算
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5); // 今月含めて6ヶ月
    const startDate = sixMonthsAgo.toISOString().split('T')[0];

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
      .gte('report_month', startDate)
      .order('report_month', { ascending: true });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
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
    data?.forEach(row => {
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

    // 配列に変換
    const chartData = Object.values(monthlyData);

    return NextResponse.json(chartData);
    
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
