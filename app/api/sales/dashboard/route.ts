// ver.4 (2025-08-21 JST) - dashboard API with default date handling
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.supabaseAccessToken) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    // 受け取り: 未指定 or 'YYYY.MM.DD' も許容して 'YYYY-MM-DD' に正規化
    const raw = searchParams.get('date');
    const toJstISO = () => {
      const now = new Date();
      const y = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric' }).format(now);
      const m = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: '2-digit' }).format(now);
      const d = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', day: '2-digit' }).format(now);
      return `${y}-${m}-${d}`;
    };
    const dateISO = (raw && raw.trim() !== '')
      ? raw.slice(0, 10).replace(/\./g, '-')
      : toJstISO();

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const [dailyRes, monthlyRes, sixMonthRes] = await Promise.all([
      supabase.from('daily_sales_report').select('*').eq('date', dateISO),
      supabase.rpc('get_sales_report_data', { report_date: dateISO }),
      supabase.rpc('get_6month_sales_summary', { end_date: dateISO }),
    ]);

    if (dailyRes.error || monthlyRes.error || sixMonthRes.error) {
      console.error('dashboard data fetch error:', {
        daily: dailyRes.error,
        monthly: monthlyRes.error,
        sixMonth: sixMonthRes.error,
      });
      return NextResponse.json(
        { error: 'データ取得に失敗しました' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      daily: dailyRes.data?.[0] || {},
      monthly: monthlyRes.data?.[0] || {},
      sixMonth: sixMonthRes.data || [],
    });
  } catch (error) {
    console.error('dashboard route error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
