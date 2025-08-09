// /api/rcm/products/[id]/preview/route.ts
import { NextRequest, NextResponse } from "next/server";
// import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string }}) {
  const { id } = params;
  const asof = new URL(_req.url).searchParams.get("asof"); // YYYY-MM-DD or null(=today)
  // 1) products + product_items を取得
  // 2) ref_type に応じて ingredients/materials/parts を解決
  // 3) parts は再帰展開（循環チェック）
  // 4) 単価→行原価→行栄養→合計→製造容量で100g/1個へ割戻し
  //    ※ 丸めはここではせず raw 値で返す。UIで丸めて表示。
  return NextResponse.json({
    ok: true,
    product_id: id,
    asof: asof ?? null,
    result: {
      // cost_total: 0,
      // nutrition_100g: { kcal: 0, protein: 0, fat: 0, carb: 0, salt: 0 },
      // nutrition_per_piece: { ... },
      // lines: [...]
    }
  });
}
