export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getToken } from "next-auth/jwt";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL
    ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY
    ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })(),
);

export async function PATCH(request: Request) {
  try {
    const token = await getToken({ req: request as any });
    if (!token || token.email !== "aizubrandhall@gmail.com") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    if (!id) {
      return NextResponse.json({ success: false, error: "商品IDが必要です" }, { status: 400 });
    }

    const note = String(body.note || "").slice(0, 1000);
    const { data, error } = await supabase
      .from("wholesale_partner_inventory_items")
      .update({ note })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, item: data });
  } catch (error: any) {
    console.error("wholesale partner inventory item PATCH error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "備考の保存に失敗しました" },
      { status: 500 },
    );
  }
}
