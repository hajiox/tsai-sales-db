import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomUUID } from "node:crypto";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { normalizeEcCatchcopiesBySite, normalizeEcCatchcopyTargets } from "@/lib/ec-catchcopy-codex";
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
import { isReservedEcPriceJob } from "@/lib/ec-price-reservations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_EMAIL = "aizubrandhall@gmail.com";

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
function toReservationView(row: Record<string, unknown>) {
  const parameters = asObject(row.parameters);
  const snapshot = asObject(parameters.recipeSnapshot);
  const catchcopies = normalizeEcCatchcopiesBySite(parameters.catchcopies, snapshot.fallbackCatchcopy);
  return {
    id: String(row.id),
    recipeId: String(parameters.recipeId || ""),
    recipeName: String(snapshot.recipeName || parameters.recipeName || "名称未登録"),
    newCatchcopy: catchcopies.rakuten || catchcopies.yahoo || "",
    targets: normalizeEcCatchcopyTargets(parameters.targets),
    createdAt: String(row.created_at || ""),
  };
}

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() === ADMIN_EMAIL ? session : null;
}

async function loadReservations() {
  const supabase = getWebSalesAutomationServiceClient();
  const { data, error } = await supabase
    .from("web_sales_codex_jobs")
    .select("id,status,parameters,scheduled_at,created_at")
    .eq("task_key", "ec_catchcopy_update")
    .eq("status", "queued")
    .contains("parameters", { dispatchMode: "reserved" })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).filter((row) => isReservedEcPriceJob(row.status, row.parameters));
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  try {
    const reservations = (await loadReservations()).map((row) =>
      toReservationView(row as Record<string, unknown>));
    return NextResponse.json({ ok: true, count: reservations.length, reservations });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "キャッチコピー変更予約を取得できません" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.action !== "execute_all") return NextResponse.json({ error: "actionが正しくありません" }, { status: 400 });
    const supabase = getWebSalesAutomationServiceClient();
    const reservations = await loadReservations();
    if (reservations.length === 0) return NextResponse.json({ ok: true, released: 0, stale: 0, reservations: [] });

    const recipeIds = [...new Set(reservations.map((row) => String(asObject(row.parameters).recipeId || "")).filter(Boolean))];
    const { data: recipes, error: recipesError } = await supabase
      .from("recipes")
      .select("id,name,is_intermediate,catchcopy,ec_catchcopies_by_site,linked_product_id,jan_code,series_code,product_code,filling_quantity,filling_quantity_unit,storage_method")
      .in("id", recipeIds);
    if (recipesError) throw recipesError;
    const recipeMap = new Map((recipes || []).map((recipe) => [String(recipe.id), recipe]));
    const releasedAt = new Date().toISOString();
    const batchId = randomUUID();
    let stale = 0;
    const details: Array<{ id: string; recipeId: string; status: "released" | "stale" | "skipped" }> = [];
    const releasable: Array<{ reservation: Record<string, unknown>; recipeId: string }> = [];

    for (const reservation of reservations) {
      const parameters = asObject(reservation.parameters);
      const recipeId = String(parameters.recipeId || "");
      const recipe = recipeMap.get(recipeId);
      const snapshot = recipe ? buildEcCatchcopyRecipeSnapshot(recipe as Record<string, unknown>) : null;
      const targets = normalizeEcCatchcopyTargets(parameters.targets);
      const mappings = snapshot ? await loadEcPriceProductMappings(supabase, snapshot.linkedProductId, targets) : null;
      const identifiers = snapshot ? getEcPriceVerifiedIdentifiers(snapshot.janCode, targets) : null;
      if (!snapshot
        || !ecCatchcopySnapshotsMatch(parameters.recipeSnapshot, snapshot)
        || !mappings
        || !ecPriceProductMappingsMatch(parameters.productMappings, mappings)
        || !identifiers
        || !ecPriceVerifiedIdentifiersMatch(parameters.verifiedProductIdentifiers, identifiers)) {
        const message = "予約後にEC用キャッチコピーまたは商品情報が変更されました。内容を確認して予約し直してください";
        const { data: updated } = await supabase
          .from("web_sales_codex_jobs")
          .update({ status: "needs_review", current_step: "予約内容の再確認が必要です", error_message: message, result: { summary: message, sites: [] }, completed_at: releasedAt, updated_at: releasedAt })
          .eq("id", reservation.id)
          .eq("status", "queued")
          .contains("parameters", { dispatchMode: "reserved" })
          .select("id")
          .maybeSingle();
        if (updated) {
          stale += 1;
          details.push({ id: reservation.id, recipeId, status: "stale" });
        } else details.push({ id: reservation.id, recipeId, status: "skipped" });
        continue;
      }
      releasable.push({ reservation: reservation as Record<string, unknown>, recipeId });
    }

    let released = 0;
    if (releasable.length > 0) {
      const { data, error } = await supabase.rpc("release_recipe_ec_catchcopy_batch_jobs", {
        p_job_ids: releasable.map(({ reservation }) => String(reservation.id)),
        p_batch_id: batchId,
        p_released_at: releasedAt,
        p_authorized_by: session.user?.email || ADMIN_EMAIL,
      });
      if (error) throw error;
      const releasedIds = new Set((data || []).map((row: unknown) =>
        typeof row === "string" ? row : String(asObject(row).job_id || "")).filter(Boolean));
      for (const entry of releasable) {
        const id = String(entry.reservation.id);
        if (!releasedIds.has(id)) {
          details.push({ id, recipeId: entry.recipeId, status: "skipped" });
          continue;
        }
        released += 1;
        details.push({ id, recipeId: entry.recipeId, status: "released" });
        await supabase.from("web_sales_codex_job_events").insert({
          job_id: id,
          event_type: "queued",
          message: "予約したECキャッチコピー変更を一括実行へ移しました",
          progress: 0,
          payload: { recipeId: entry.recipeId, releasedAt, batchId, batchSize: releasedIds.size },
        });
      }
    }
    return NextResponse.json({ ok: true, released, stale, batchId: released > 0 ? batchId : null, details });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "キャッチコピー変更予約を一括実行できません" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const jobId = typeof body?.jobId === "string" ? body.jobId.trim() : "";
    if (!jobId) return NextResponse.json({ error: "jobIdが必要です" }, { status: 400 });
    const supabase = getWebSalesAutomationServiceClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("web_sales_codex_jobs")
      .update({ status: "cancelled", current_step: "予約を取り消しました", completed_at: now, updated_at: now })
      .eq("id", jobId)
      .eq("task_key", "ec_catchcopy_update")
      .eq("status", "queued")
      .contains("parameters", { dispatchMode: "reserved" })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "取消可能な予約が見つかりません" }, { status: 404 });
    return NextResponse.json({ ok: true, cancelled: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "キャッチコピー変更予約を取り消せません" }, { status: 500 });
  }
}

