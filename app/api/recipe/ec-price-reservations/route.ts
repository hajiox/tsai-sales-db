import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getWebSalesAutomationServiceClient } from "@/lib/web-sales-automation/sync";
import { normalizeEcPriceTargets } from "@/lib/ec-price-codex";
import { buildEcPriceRecipeSnapshot, ecPriceSnapshotsMatch } from "@/lib/ec-price-job-server";
import {
  ecPriceProductMappingsMatch,
  loadEcPriceProductMappings,
} from "@/lib/ec-price-product-mappings";
import {
  ecPriceLpSourcesMatch,
  ecPriceVerifiedIdentifiersMatch,
  getEcPriceLpSource,
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
  return {
    id: String(row.id),
    recipeId: String(parameters.recipeId || ""),
    recipeName: String(snapshot.recipeName || parameters.recipeName || "名称未登録"),
    ecProductName: snapshot.ecProductName ? String(snapshot.ecProductName) : null,
    targets: normalizeEcPriceTargets(parameters.targets),
    newPriceInclTax: Number(parameters.newPriceInclTax) || 0,
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
    .eq("task_key", "ec_price_update")
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "価格変更予約を取得できません" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    if (body?.action !== "execute_all") {
      return NextResponse.json({ error: "actionが正しくありません" }, { status: 400 });
    }

    const supabase = getWebSalesAutomationServiceClient();
    const reservations = await loadReservations();
    if (reservations.length === 0) {
      return NextResponse.json({ ok: true, released: 0, stale: 0, reservations: [] });
    }

    const recipeIds = [...new Set(reservations.map((row) =>
      String(asObject(row.parameters).recipeId || "")).filter(Boolean))];
    const { data: recipes, error: recipesError } = await supabase
      .from("recipes")
      .select("id,name,is_intermediate,selling_price,ec_product_name,linked_product_id,jan_code,series_code,product_code,filling_quantity,filling_quantity_unit,storage_method,product_lp_url")
      .in("id", recipeIds);
    if (recipesError) throw recipesError;
    const recipeMap = new Map((recipes || []).map((recipe) => [String(recipe.id), recipe]));
    const releasedAt = new Date().toISOString();
    let released = 0;
    let stale = 0;
    const details: Array<{ id: string; recipeId: string; status: "released" | "stale" | "skipped" }> = [];

    for (const reservation of reservations) {
      const parameters = asObject(reservation.parameters);
      const recipeId = String(parameters.recipeId || "");
      const recipe = recipeMap.get(recipeId);
      const currentSnapshot = recipe
        ? buildEcPriceRecipeSnapshot(recipe as Record<string, unknown>)
        : null;
      const currentMappings = currentSnapshot
        ? await loadEcPriceProductMappings(
          supabase,
          currentSnapshot.linkedProductId,
          normalizeEcPriceTargets(parameters.targets),
        )
        : null;
      const currentTargets = normalizeEcPriceTargets(parameters.targets);
      const currentVerifiedIdentifiers = currentSnapshot
        ? getEcPriceVerifiedIdentifiers(currentSnapshot.janCode, currentTargets)
        : null;
      const currentLpSource = currentSnapshot
        ? getEcPriceLpSource(currentSnapshot.productLpUrl)
        : null;
      if (
        !currentSnapshot
        || !ecPriceSnapshotsMatch(parameters.recipeSnapshot, currentSnapshot)
        || !currentMappings
        || !ecPriceProductMappingsMatch(parameters.productMappings, currentMappings)
        || !currentVerifiedIdentifiers
        || !ecPriceVerifiedIdentifiersMatch(
          parameters.verifiedProductIdentifiers,
          currentVerifiedIdentifiers,
        )
        || !ecPriceLpSourcesMatch(parameters.lpSource, currentLpSource)
      ) {
        const message = "予約後に価格または商品情報が変更されました。内容を確認して予約し直してください";
        const { data: updated } = await supabase
          .from("web_sales_codex_jobs")
          .update({
            status: "needs_review",
            progress: 0,
            current_step: "予約内容の再確認が必要です",
            error_message: message,
            result: { summary: message, sites: [] },
            completed_at: releasedAt,
            updated_at: releasedAt,
          })
          .eq("id", reservation.id)
          .eq("status", "queued")
          .contains("parameters", { dispatchMode: "reserved" })
          .select("id")
          .maybeSingle();
        if (updated) {
          stale += 1;
          details.push({ id: reservation.id, recipeId, status: "stale" });
          await supabase.from("web_sales_codex_job_events").insert({
            job_id: reservation.id,
            event_type: "needs_review",
            message,
            progress: 0,
            payload: { recipeId },
          });
        } else {
          details.push({ id: reservation.id, recipeId, status: "skipped" });
        }
        continue;
      }

      const nextParameters = {
        ...parameters,
        dispatchMode: "batch",
        releasedAt,
        operatorAuthorization: {
          executionAuthorized: true,
          source: "tsa_batch_execution_confirmation",
          authorizedAt: releasedAt,
          authorizedBy: session.user?.email || ADMIN_EMAIL,
          recipeId,
          targets: normalizeEcPriceTargets(parameters.targets),
          newPriceInclTax: Number(parameters.newPriceInclTax) || 0,
        },
      };
      const { data: updated } = await supabase
        .from("web_sales_codex_jobs")
        .update({
          parameters: nextParameters,
          scheduled_at: releasedAt,
          current_step: "一括実行待ち",
          updated_at: releasedAt,
        })
        .eq("id", reservation.id)
        .eq("status", "queued")
        .contains("parameters", { dispatchMode: "reserved" })
        .select("id")
        .maybeSingle();
      if (updated) {
        released += 1;
        details.push({ id: reservation.id, recipeId, status: "released" });
        await supabase.from("web_sales_codex_job_events").insert({
          job_id: reservation.id,
          event_type: "queued",
          message: "予約した価格変更を一括実行へ移しました",
          progress: 0,
          payload: { recipeId, releasedAt },
        });
      } else {
        details.push({ id: reservation.id, recipeId, status: "skipped" });
      }
    }

    return NextResponse.json({ ok: true, released, stale, details });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "価格変更予約を一括実行できません" },
      { status: 500 },
    );
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
      .update({
        status: "cancelled",
        current_step: "予約を取り消しました",
        completed_at: now,
        updated_at: now,
      })
      .eq("id", jobId)
      .eq("task_key", "ec_price_update")
      .eq("status", "queued")
      .contains("parameters", { dispatchMode: "reserved" })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "取消可能な予約が見つかりません" }, { status: 404 });
    await supabase.from("web_sales_codex_job_events").insert({
      job_id: jobId,
      event_type: "cancelled",
      message: "価格変更予約を取り消しました",
      progress: 0,
    });
    return NextResponse.json({ ok: true, cancelled: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "価格変更予約を取り消せません" },
      { status: 500 },
    );
  }
}
