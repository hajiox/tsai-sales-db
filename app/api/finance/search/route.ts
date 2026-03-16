// app/api/finance/search/route.ts
// 仕訳データ検索API（Supabase版）
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 100), 500);
  const offset = Math.max(Number(req.nextUrl.searchParams.get("offset") || 0), 0);

  if (!q || q.length < 1) {
    return NextResponse.json({ results: [], total: 0 });
  }

  try {
    const searchPattern = `%${q}%`;

    const { data, error } = await supabase
      .from("general_ledger")
      .select("report_month, transaction_date, account_code, counter_account, department, description, debit_amount, credit_amount, balance")
      .or(`description.ilike.${searchPattern},account_code.ilike.${searchPattern},counter_account.ilike.${searchPattern},department.ilike.${searchPattern}`)
      .order("transaction_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // 総件数を別途取得
    const { count, error: countError } = await supabase
      .from("general_ledger")
      .select("id", { count: "exact", head: true })
      .or(`description.ilike.${searchPattern},account_code.ilike.${searchPattern},counter_account.ilike.${searchPattern},department.ilike.${searchPattern}`);

    return NextResponse.json({
      results: data || [],
      total: count ?? (data?.length || 0),
      query: q,
    });
  } catch (error: any) {
    console.error("Search API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
