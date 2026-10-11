import { getBusinessAdminSession, isBusinessAdminSession } from "@/lib/data-access/business-operation-context";
import { NextResponse } from "next/server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { recipePriceHistoryFromRows } from "@/lib/recipe-price-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getBusinessAdminSession();
  if (!isBusinessAdminSession(session)) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { id: recipeId } = await params;
  const supabase = getWebSalesAutomationServiceClient();
  const { data, error } = await supabase
    .from("recipe_ec_price_revisions")
    .select("id,previous_price_ex_tax,new_price_ex_tax,previous_price_incl_tax,new_price_incl_tax,created_at")
    .eq("recipe_id", recipeId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const history = recipePriceHistoryFromRows(data);
  const latest = history[0] || null;
  const previousPrice = latest
    ? {
      previousPriceExTax: latest.previousPriceExTax,
      previousPriceInclTax: latest.previousPriceInclTax,
      changedAt: latest.changedAt,
    }
    : null;

  return NextResponse.json({ previousPrice, history }, {
    headers: { "Cache-Control": "no-store" },
  });
}
