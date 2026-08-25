import { NextResponse } from "next/server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { isCodexBridgeAuthorized, normalizeWorkerId } from "@/lib/web-sales-codex/server";
import {
  buildEcCatchcopyRecipeSnapshot,
  ecCatchcopySnapshotsMatch,
} from "@/lib/ec-catchcopy-job-server";
import {
  ecPriceProductMappingsMatch,
  loadEcPriceProductMappings,
} from "@/lib/ec-price-product-mappings";
import {
  ecPriceVerifiedIdentifiersMatch,
  getEcPriceVerifiedIdentifiers,
} from "@/lib/ec-price-verified-registry";
import { normalizeEcCatchcopyTargets } from "@/lib/ec-catchcopy-codex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCodexBridgeAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json();
    const workerId = normalizeWorkerId(body.workerId);
    const supabase = getWebSalesAutomationServiceClient();
    const { data: job, error: jobError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,task_key,worker_id,parameters,status")
      .eq("id", id)
      .eq("task_key", "ec_catchcopy_update")
      .eq("worker_id", workerId)
      .single();
    if (jobError || !job) throw jobError || new Error("キャッチコピー変更タスクが見つかりません");
    if (job.status !== "running") return NextResponse.json({ error: "キャッチコピー変更タスクは実行状態ではありません" }, { status: 409 });
    const parameters = job.parameters && typeof job.parameters === "object" && !Array.isArray(job.parameters)
      ? job.parameters as Record<string, unknown>
      : {};
    const recipeId = String(parameters.recipeId || "");
    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .select("id,name,is_intermediate,catchcopy,ec_catchcopies_by_site,linked_product_id,jan_code,series_code,product_code,filling_quantity,filling_quantity_unit,storage_method")
      .eq("id", recipeId)
      .single();
    if (recipeError || !recipe) throw recipeError || new Error("レシピが見つかりません");
    if (recipe.is_intermediate) return NextResponse.json({ error: "中間加工品へ変更されているため停止しました" }, { status: 409 });
    const snapshot = buildEcCatchcopyRecipeSnapshot(recipe as Record<string, unknown>);
    if (!ecCatchcopySnapshotsMatch(parameters.recipeSnapshot, snapshot)) {
      return NextResponse.json({ error: "キュー登録後にEC用キャッチコピーまたは商品情報が変更されたため停止しました" }, { status: 409 });
    }
    const targets = normalizeEcCatchcopyTargets(parameters.targets);
    const mappings = await loadEcPriceProductMappings(supabase, snapshot.linkedProductId, targets);
    if (!ecPriceProductMappingsMatch(parameters.productMappings, mappings)) {
      return NextResponse.json({ error: "キュー登録後にEC商品の紐付けが変更されたため停止しました" }, { status: 409 });
    }
    const identifiers = getEcPriceVerifiedIdentifiers(snapshot.janCode, targets);
    if (!ecPriceVerifiedIdentifiersMatch(parameters.verifiedProductIdentifiers, identifiers)) {
      return NextResponse.json({ error: "キュー登録後にEC商品の確定識別子が変更されたため停止しました" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "キャッチコピー変更前の再検証に失敗しました" }, { status: 400 });
  }
}
