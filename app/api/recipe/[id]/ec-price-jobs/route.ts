import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { normalizeEcPriceTargets, type EcPriceJobView } from "@/lib/ec-price-codex";
import { taxIncludedFromExcluded, yenFloor } from "@/lib/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "aizubrandhall@gmail.com";
const ACTIVE_STATUSES = ["queued", "running"];

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function toJobView(job: Record<string, unknown>): EcPriceJobView {
  const parameters = asObject(job.parameters);
  const result = asObject(job.result);
  const sites = Array.isArray(result.sites) ? result.sites : [];
  return {
    id: String(job.id),
    status: String(job.status) as EcPriceJobView["status"],
    progress: Number(job.progress) || 0,
    currentStep: String(job.current_step || "実行待ち"),
    errorMessage: job.error_message ? String(job.error_message) : null,
    targets: normalizeEcPriceTargets(parameters.targets),
    newPriceInclTax: Number(parameters.newPriceInclTax) || 0,
    summary: result.summary ? String(result.summary) : null,
    sites: sites as EcPriceJobView["sites"],
    createdAt: String(job.created_at || ""),
    completedAt: job.completed_at ? String(job.completed_at) : null,
  };
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() === ADMIN_EMAIL ? session : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const { id: recipeId } = await params;
  const jobId = new URL(request.url).searchParams.get("jobId")?.trim();
  if (!jobId) return NextResponse.json({ error: "jobIdが必要です" }, { status: 400 });

  const supabase = getWebSalesAutomationServiceClient();
  const { data, error } = await supabase
    .from("web_sales_codex_jobs")
    .select("id,task_key,status,progress,current_step,error_message,parameters,result,created_at,completed_at")
    .eq("id", jobId)
    .eq("task_key", "ec_price_update")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || String(asObject(data.parameters).recipeId || "") !== recipeId) {
    return NextResponse.json({ error: "価格変更タスクが見つかりません" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, job: toJobView(data) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  try {
    const { id: recipeId } = await params;
    const body = await request.json();
    const requestedTargets = Array.isArray(body.targets) ? body.targets : [];
    const targets = normalizeEcPriceTargets(body.targets);
    if (targets.length === 0 || targets.length !== requestedTargets.length) {
      return NextResponse.json({ error: "反映先ECを選択してください" }, { status: 400 });
    }

    const supabase = getWebSalesAutomationServiceClient();
    const { data: recipe, error: recipeError } = await supabase
      .from("recipes")
      .select("id,name,is_intermediate,selling_price,ec_product_name,linked_product_id,jan_code,series_code,product_code,filling_quantity,filling_quantity_unit,storage_method")
      .eq("id", recipeId)
      .single();
    if (recipeError || !recipe) {
      return NextResponse.json({ error: "レシピが見つかりません" }, { status: 404 });
    }
    if (recipe.is_intermediate) {
      return NextResponse.json({ error: "中間加工品はEC価格反映の対象外です" }, { status: 400 });
    }

    const newPriceExTax = yenFloor(Number(recipe.selling_price));
    const newPriceInclTax = taxIncludedFromExcluded(newPriceExTax);
    if (!Number.isFinite(newPriceExTax) || newPriceExTax <= 0 || newPriceInclTax <= 0) {
      return NextResponse.json({ error: "保存済み販売価格が正しくありません" }, { status: 400 });
    }

    const { data: activeRows, error: activeError } = await supabase
      .from("web_sales_codex_jobs")
      .select("id,status,progress,current_step,error_message,parameters,result,created_at,completed_at")
      .eq("task_key", "ec_price_update")
      .contains("parameters", { recipeId })
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1);
    if (activeError) throw activeError;
    const active = activeRows?.[0];
    if (active) {
      return NextResponse.json({ ok: true, reused: true, job: toJobView(active) });
    }

    const { data: completedRows, error: completedError } = await supabase
      .from("web_sales_codex_jobs")
      .select("parameters,created_at")
      .eq("task_key", "ec_price_update")
      .contains("parameters", { recipeId })
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1);
    if (completedError) throw completedError;
    const previousCompleted = completedRows?.[0];
    const previousParameters = asObject(previousCompleted?.parameters);
    const previousSyncedPriceInclTax = Number(previousParameters.newPriceInclTax) > 0
      ? Number(previousParameters.newPriceInclTax)
      : null;

    const parameters = {
      taskKey: "ec_price_update",
      targets,
      recipeId,
      recipeName: String(recipe.name || "").slice(0, 200),
      ecProductName: recipe.ec_product_name ? String(recipe.ec_product_name).slice(0, 200) : null,
      linkedProductId: recipe.linked_product_id || null,
      janCode: recipe.jan_code ? String(recipe.jan_code).slice(0, 32) : null,
      seriesCode: recipe.series_code ?? null,
      productCode: recipe.product_code ?? null,
      fillingQuantity: recipe.filling_quantity ?? null,
      fillingQuantityUnit: recipe.filling_quantity_unit || null,
      storageMethod: recipe.storage_method ? String(recipe.storage_method).slice(0, 100) : null,
      previousSyncedPriceInclTax,
      newPriceExTax,
      newPriceInclTax,
      lpUpdate: false,
      executionPolicy: "signed_in_browser_isolated_codex",
    };

    const { data: job, error: insertError } = await supabase
      .from("web_sales_codex_jobs")
      .insert({
        task_key: "ec_price_update",
        channel: null,
        trigger_type: "manual",
        period_start: null,
        period_end: null,
        report_month: null,
        status: "queued",
        progress: 0,
        current_step: "事務所PCの価格改定開始待ち",
        parameters,
        requested_by: session.user?.email || ADMIN_EMAIL,
        priority: 50,
        max_attempts: 1,
        scheduled_at: new Date().toISOString(),
      })
      .select("id,status,progress,current_step,error_message,parameters,result,created_at,completed_at")
      .single();
    if (insertError?.code === "23505") {
      const { data: existingRows } = await supabase
        .from("web_sales_codex_jobs")
        .select("id,status,progress,current_step,error_message,parameters,result,created_at,completed_at")
        .eq("task_key", "ec_price_update")
        .contains("parameters", { recipeId })
        .in("status", ACTIVE_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1);
      if (existingRows?.[0]) {
        return NextResponse.json({ ok: true, reused: true, job: toJobView(existingRows[0]) });
      }
    }
    if (insertError || !job) throw insertError || new Error("価格変更タスクを登録できません");

    await supabase.from("web_sales_codex_job_events").insert({
      job_id: job.id,
      event_type: "queued",
      message: `${targets.join("・")}の価格変更を実行待ちに登録しました`,
      progress: 0,
      payload: { recipeId, targets, newPriceInclTax },
    });

    return NextResponse.json({ ok: true, reused: false, job: toJobView(job) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "価格変更タスクを登録できません" },
      { status: 500 },
    );
  }
}
