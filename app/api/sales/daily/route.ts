// ver.4 (2025-08-19 JST) - disable prerender; runtime=node; no revalidate
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();

const createSupabaseAdmin = () => createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

async function hasAuthenticatedSession() {
  const session = await getServerSession(authOptions);
  return Boolean(session?.user?.email);
}

function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function nullableInteger(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < -2147483648 || parsed > 2147483647) {
    throw new Error(`${label}は整数で入力してください`);
  }
  return parsed;
}

export async function GET(request: Request) {
  try {
    if (!(await hasAuthenticatedSession())) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    // URLパラメータから日付を取得
    const { searchParams } = new URL(request.url);
    const dateString = searchParams.get("date");

    if (!dateString) {
      return NextResponse.json({ error: "日付が指定されていません" }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();

    // 日別データを取得
    const { data, error } = await supabase
      .from('daily_sales_report')
      .select('*')
      .eq('date', dateString);

    if (error) {
      console.error("日次データ取得エラー:", error);
      return NextResponse.json({ 
        error: `日次データ取得エラー: ${error.message}` 
      }, { status: 500 });
    }

    // データが存在する場合は最初の要素、存在しない場合は空オブジェクト
    return NextResponse.json({ 
      success: true, 
      data: data && data.length > 0 ? data[0] : {} 
    });

  } catch (error) {
    console.error("サーバーエラー:", error);
    return NextResponse.json({ 
      error: "サーバーエラーが発生しました" 
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await hasAuthenticatedSession())) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !isValidDateString(body.date)) {
      return NextResponse.json({ error: "有効な日付を指定してください" }, { status: 400 });
    }

    let dataToSave;
    try {
      dataToSave = {
        date: body.date,
        floor_sales: nullableInteger(body.floor_sales, "フロア日計"),
        cash_income: nullableInteger(body.cash_income, "入金"),
        register_count: nullableInteger(body.register_count, "レジ通過人数"),
      };
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "入力値が不正です" },
        { status: 400 },
      );
    }

    const { data, error } = await createSupabaseAdmin()
      .from("daily_sales_report")
      .upsert(dataToSave, { onConflict: "date" })
      .select("*")
      .single();

    if (error) {
      console.error("日次データ保存エラー:", error);
      return NextResponse.json({ error: `保存に失敗しました: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("日次データ保存サーバーエラー:", error);
    return NextResponse.json({ error: "保存中にサーバーエラーが発生しました" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!(await hasAuthenticatedSession())) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateString = searchParams.get("date");
    if (!isValidDateString(dateString)) {
      return NextResponse.json({ error: "有効な日付を指定してください" }, { status: 400 });
    }

    const { data, error } = await createSupabaseAdmin()
      .from("daily_sales_report")
      .delete()
      .eq("date", dateString)
      .select("id, date");

    if (error) {
      console.error("日次データ削除エラー:", error);
      return NextResponse.json({ error: `削除に失敗しました: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: data?.length ?? 0 });
  } catch (error) {
    console.error("日次データ削除サーバーエラー:", error);
    return NextResponse.json({ error: "削除中にサーバーエラーが発生しました" }, { status: 500 });
  }
}
