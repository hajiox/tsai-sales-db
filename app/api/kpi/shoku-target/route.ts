// /api/kpi/shoku-target/route.ts — 食のブランド館月間目標取得API
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month'); // "YYYY-MM" 形式

    if (!month) {
      return NextResponse.json({ error: 'month parameter is required' }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // monthは "YYYY-MM" で来るので "YYYY-MM-01" に変換
    const monthKey = month.length === 7 ? `${month}-01` : month;

    const { data, error } = await supabase
      .from('kpi_manual_entries_v1')
      .select('amount')
      .eq('metric', 'target')
      .eq('channel_code', 'SHOKU')
      .eq('month', monthKey)
      .maybeSingle();

    if (error) {
      console.error('Shoku target fetch error:', error);
      return NextResponse.json({ target: 0 });
    }

    return NextResponse.json({ target: data?.amount ?? 0 });
  } catch (err) {
    console.error('Shoku target API error:', err);
    return NextResponse.json({ target: 0 });
  }
}
