import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { base_month, period_months } = await req.json();
    
    console.log('Period API called:', { base_month, period_months });
    
    if (!base_month || !period_months) {
      return NextResponse.json({ error: 'base_month and period_months required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // 基準月から期間分遡った開始月を計算
    const baseDate = new Date(base_month + '-01');
    const startDate = new Date(baseDate.getFullYear(), baseDate.getMonth() - (period_months - 1), 1);
    const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-01`;
    const endMonth = base_month + '-31';

    console.log('Date range:', { startMonth, endMonth });

    // 簡単なテストレスポンスを返す
    return NextResponse.json({
      totals: {
        amazon_count: { count: 100, amount: 50000 },
        rakuten_count: { count: 80, amount: 40000 },
        yahoo_count: { count: 60, amount: 30000 },
        mercari_count: { count: 40, amount: 20000 },
        base_count: { count: 20, amount: 10000 },
        qoo10_count: { count: 10, amount: 5000 }
      },
      seriesSummary: [
        { seriesName: 'テストシリーズ', count: 150, sales: 75000 },
        { seriesName: 'サンプル商品', count: 100, sales: 50000 }
      ],
      period: `${period_months}ヶ月間`,
      base_month,
      debug: { startMonth, endMonth }
    });

  } catch (error: any) {
    console.error('Period API error:', error);
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}
