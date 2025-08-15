/**
 * TSA 財務分析システム
 * 月次サマリ取得 API
 * ver.43 (2025-08-15 JST)
 * - 既定取得件数を 120 に拡大（過去分が確実に出る）
 * - ?limit= で任意指定可（1〜120）
 * - no-store で常に最新を返す
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
  const limitRaw = Number(url.searchParams.get("limit") ?? 120);
  const limit = Math.min(Math.max(limitRaw, 1), 120);

  const { data, error } = await supabase
    .from("gl_monthly_stats") // ←実テーブル/ビュー名に合わせて
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
