import { NextResponse } from "next/server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { isCodexBridgeAuthorized, normalizeWorkerId } from "@/lib/web-sales-codex/server";
import { buildEcPriceRecipeSnapshot, ecPriceSnapshotsMatch } from "@/lib/ec-price-job-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isCodexBridgeAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    const workerId = normalizeWorkerId(body.workerId);
    const supabase = getWebSalesAutomationServiceClient();
    const { data: job, error: jobError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,task_key,worker_id,parameters,status")
      .eq("id", id)
      .eq("task_key", "ec_price_update")
      .eq("worker_id", workerId)
      .single();
    if (jobError || !job) throw jobError || new Error("価格変更タスクが見つかりません");
    if (job.status !== "running") {
      return NextResponse.json({ error: "価格変更タスクは実行状態ではありません" }, { status: 409 });
    }
    const jobParams = job.parameters && typeof job.parameters === "object" && !Array.isArray(job.parameters)
      ? job.parameters as Record<string, unknown>
      : {};
    const snapshot = jobParams.recipeSnapshot;
    const recipeId = String(jobParams.recipeId || "");
    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .select("id,name,is_intermediate,selling_price,ec_product_name,linked_product_id,jan_code,series_code,product_code,filling_quantity,filling_quantity_unit,storage_method")
      .eq("id", recipeId)
      .single();
    if (recipeError || !recipe) throw recipeError || new Error("レシピが見つかりません");
    if (recipe.is_intermediate) {
      return NextResponse.json({ error: "中間加工品へ変更されているため停止しました" }, { status: 409 });
    }
    const currentSnapshot = buildEcPriceRecipeSnapshot(recipe as Record<string, unknown>);
    if (!ecPriceSnapshotsMatch(snapshot, currentSnapshot)) {
      return NextResponse.json(
        { error: "キュー登録後に価格または商品情報が変更されたため停止しました" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, snapshot: currentSnapshot });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "価格変更前の再検証に失敗しました" },
      { status: 400 },
    );
  }
}
