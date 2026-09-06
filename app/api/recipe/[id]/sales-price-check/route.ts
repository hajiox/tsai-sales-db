import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { hasPackConflict, priceDifference } from "@/lib/sales-price-reconciliation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getServerSession(authOptions))?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getWebSalesAutomationServiceClient();
  const { id } = await params;
  const { data: recipe, error } = await db.from("recipes").select("linked_product_id").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "価格照合を取得できません" }, { status: 500 });
  if (!recipe?.linked_product_id) return NextResponse.json({ checks: [] });
  const { data, error: checkError } = await db.rpc("recipe_sales_price_checks", { p_product_id: recipe.linked_product_id });
  if (checkError) return NextResponse.json({ error: "価格照合を取得できません" }, { status: 500 });
  const checks = (data || []).map((row: any) => ({
    ...row,
    kind: hasPackConflict(row.source_name, row.product_name) ? "mapping"
      : priceDifference(Number(row.reference_price), Number(row.average_price)) ? "average" : "match",
  }));
  return NextResponse.json({ checks });
}
