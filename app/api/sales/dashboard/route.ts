export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.supabaseAccessToken) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateString = searchParams.get('date');
    if (!dateString) {
      return NextResponse.json({ error: '日付が指定されていません' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const [dailyRes, monthlyRes, sixMonthRes] = await Promise.all([
      supabase.from('daily_sales_report').select('*').eq('date', dateString),
      supabase.rpc('get_sales_report_data', { report_date: dateString }),
      supabase.rpc('get_6month_sales_summary', { end_date: dateString }),
    ]);

    if (dailyRes.error) throw dailyRes.error;
    if (monthlyRes.error) throw monthlyRes.error;
    if (sixMonthRes.error) throw sixMonthRes.error;

    return NextResponse.json({
      success: true,
      daily: dailyRes.data && dailyRes.data.length > 0 ? dailyRes.data[0] : {},
      monthly: monthlyRes.data && monthlyRes.data.length > 0 ? monthlyRes.data[0] : {},
      sixMonth: sixMonthRes.data || [],
    });
  } catch (error) {
    console.error('dashboard route error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.supabaseAccessToken) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const body = await request.json();
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { error } = await supabase.from('daily_sales_report').upsert(body, {
      onConflict: 'date',
    });
    if (error) {
      return NextResponse.json(
        { error: `保存に失敗しました: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('dashboard route POST error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
