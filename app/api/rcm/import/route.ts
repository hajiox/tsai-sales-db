// /api/rcm/import/route.ts
import { NextRequest, NextResponse } from "next/server";
// import xlsx from "xlsx"; // 実装時に追加
// import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic"; // Nodeランタイム

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mode = "dry-run", files } = body as { mode?: "dry-run"|"apply", files: Array<{name: string, path: string}> };

    // 1) files の存在チェック（/imports/rcm/yyyy-mm-dd/ 配下のみ許可）
    // 2) xlsx を読み取り、食材/資材/レシピ/部品/商品を抽出（まだDBは更新しない）
    // 3) 名前解決（rcm_aliases）。未解決は errors[] に溜める
    // 4) mode==="dry-run" の場合は差分レポートを返す
    // 5) mode==="apply" で初めて upsert

    return NextResponse.json({ ok: true, mode, summary: { inserted: 0, updated: 0, unresolvedAliases: [] }});
  } catch (e:any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
