import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { previousRecipePriceFromRevision } from "@/lib/recipe-price-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "aizubrandhall@gmail.com";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (session?.user?.email?.toLowerCase() !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const { id: recipeId } = await params;
  const supabase = getWebSalesAutomationServiceClient();
  const { data, error } = await supabase
    .from("recipe_ec_price_revisions")
    .select("previous_price_ex_tax,previous_price_incl_tax,created_at")
    .eq("recipe_id", recipeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { previousPrice: previousRecipePriceFromRevision(data) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
