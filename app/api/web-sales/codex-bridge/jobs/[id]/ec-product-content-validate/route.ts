import { NextResponse } from "next/server";
import { buildEcProductContentRecipeSnapshot, ecProductContentSnapshotsMatch } from "@/lib/ec-product-content-job-server";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { isCodexBridgeAuthorized, normalizeWorkerId } from "@/lib/web-sales-codex/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isCodexBridgeAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = asObject(await request.json());
    const workerId = normalizeWorkerId(body.workerId);
    const supabase = getWebSalesAutomationServiceClient();
    const { data: job, error: jobError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,task_key,status,worker_id,parameters")
      .eq("id", id)
      .single();
    if (jobError || !job) return NextResponse.json({ error: "タスクが見つかりません" }, { status: 404 });
    if (job.task_key !== "ec_product_content_update" || job.status !== "running" || job.worker_id !== workerId) {
      return NextResponse.json({ error: "このPCが実行中の商品文章反映タスクではありません" }, { status: 409 });
    }
    const parameters = asObject(job.parameters);
    const recipeId = String(parameters.recipeId || "").trim();
    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .select("id,name,product_points,web_description,ec_product_name,linked_product_id,jan_code,series_code,product_code,filling_quantity,filling_quantity_unit,storage_method")
      .eq("id", recipeId)
      .single();
    if (recipeError || !recipe) throw recipeError || new Error("レシピが見つかりません");
    const snapshot = buildEcProductContentRecipeSnapshot(recipe as Record<string, unknown>);
    if (!ecProductContentSnapshotsMatch(parameters.recipeSnapshot, snapshot)) {
      return NextResponse.json({ error: "キュー登録後に商品ポイント・商品説明または識別情報が変更されました" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, recipeSnapshot: snapshot });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "商品文章反映前の再検証に失敗しました" }, { status: 400 });
  }
}
