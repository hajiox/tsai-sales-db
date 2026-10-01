import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { confirmManualWebSales } from "@/lib/web-sales-automation/manual-confirm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })(),
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })(),
    );
    const result = await confirmManualWebSales(supabase, "qoo10", await request.json());
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "CSVの保存に失敗しました";
    return NextResponse.json({ success: false, error: message, details: message }, { status: 400 });
  }
}
