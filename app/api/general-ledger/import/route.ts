/**
 * TSA 財務分析システム
 * 月次サマリ取得 API
 * ver.42 (2025-08-15 JST)
 * - ?limit= を許可（既定 60 / 最大 120）
 * - no-store で常に最新を返す
 * - 既存フロント互換のため配列をそのまま返却（ラッパー無し）
 *
 * ファイル: app/api/general-ledger/months/route.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? 60);
  const limit = Math.min(Math.max(limitRaw, 1), 120);

  // 月次サマリのビュー/テーブル名に合わせて必要なら変更
  // 例: gl_monthly_stats (columns: yyyymm, account_count, tx_count, debit_total, credit_total, ...)
  const { data, error } = await supabase
    .from("gl_monthly_stats")
    .select("*")
    .order("yyyymm", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(JSON.stringify(data ?? []), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
