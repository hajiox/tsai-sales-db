import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { base_month, period_months } = await req.json();
    
    console.log('期間API呼び出し:', { base_month, period_months });
    
    if (!base_month || !period_months) {
      return NextResponse.json({ error: 'base_month and period_months required' }, { status: 400 });
    }

    // テストデータを返す（デバッグ用）
    const testTotals = {
      amazon_count: { count: 500, amount: 1000000 },
      rakuten_count: { count: 400, amount: 800000 },
      yahoo_count: { count: 300, amount: 600000 },
      mercari_count: { count: 200, amount: 400000 },
      base_count: { count: 100, amount: 200000 },
      qoo10_count: { count: 50, amount: 100000 }
    };

    const testSeriesSummary = [
      { seriesName: '本格チャージュー', count: 800, sales: 2000000 },
      { seriesName: 'レトルトチャージュー', count: 600, sales: 1500000 },
      { seriesName: '麺のみ', count: 150, sales: 600000 }
    ];

    console.log('テストデータ返却');
    
    return NextResponse.json({
      totals: testTotals,
      seriesSummary: testSeriesSummary,
      period: `${period_months}ヶ月間`,
      base_month,
      debug: true
    });

  } catch (error: any) {
    console.error('期間APIエラー:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
