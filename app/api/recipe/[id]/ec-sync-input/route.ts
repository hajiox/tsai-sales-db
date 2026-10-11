import { NextResponse } from "next/server";
import { requireRecipeAdminRequest } from "@/lib/recipe-request-auth";
import { createDataAccessAdminClient } from "@/lib/data-access/server";
import { isUuid } from "@/lib/data-access/contracts";
import { buildEcPriceRecipeSnapshot } from "@/lib/ec-price-job-server";
import { buildEcProductNameRecipeSnapshot } from "@/lib/ec-product-name-job-server";
import { buildEcCatchcopyRecipeSnapshot } from "@/lib/ec-catchcopy-job-server";
import { buildEcProductContentRecipeSnapshot, buildEcProductContentTargetMap } from "@/lib/ec-product-content-job-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireRecipeAdminRequest(request);
  if (authError) return authError;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "レシピIDを確認してください" }, { status: 400 });
  const { data, error } = await createDataAccessAdminClient().from("recipes")
    .select("id,name,is_intermediate,selling_price,ec_product_name,catchcopy,product_points,web_description,linked_product_id,jan_code,series_code,product_code,filling_quantity,filling_quantity_unit,storage_method,product_lp_url")
    .eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "EC反映用の保存情報を取得できません" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "レシピが見つかりません" }, { status: 404 });
  const { is_intermediate, catchcopy, product_points, web_description, ...priceRecord } = data;
  const price = buildEcPriceRecipeSnapshot(data);
  const name = buildEcProductNameRecipeSnapshot(data);
  const copy = buildEcCatchcopyRecipeSnapshot(data);
  const content = buildEcProductContentRecipeSnapshot(data);
  return NextResponse.json({
    recipeId: id, isIntermediate: is_intermediate,
    price: { expectedPriceInclTax: price.newPriceInclTax, expectedRecipeSnapshot: priceRecord },
    name: { expectedProductName: name.ecProductName, expectedProductNames: name.ecProductNamesBySite, expectedRecipeSnapshot: name },
    catchcopy: { expectedCatchcopy: copy.fallbackCatchcopy, expectedCatchcopies: copy.ecCatchcopiesBySite, expectedRecipeSnapshot: copy },
    content: { expectedRecipeSnapshot: content, expectedTargetContents: buildEcProductContentTargetMap(["amazon", "rakuten", "yahoo", "base"], content) },
  }, { headers: { "Cache-Control": "no-store" } });
}
