export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { getToken } from "next-auth/jwt";
import {
  calculateCharSiuProduction,
  CHAR_SIU_MATERIALS,
  CHAR_SIU_OUTPUTS,
  nonNegative,
  nonNegativeInteger,
  positive,
  positiveInteger,
} from "@/lib/char-siu-production";
import { fetchManufacturingAverageHourlyRate } from "@/lib/tsg-manufacturing-labor";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(request: Request) {
  try {
    const unauthorized = await requireFinanceAuthorized(request);
    if (unauthorized) return unauthorized;

    const url = new URL(request.url);
    const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") || "")
      ? String(url.searchParams.get("month"))
      : "";
    const selectedId = String(url.searchParams.get("id") || "").trim();

    let query = supabase
      .from("char_siu_production_runs")
      .select("*")
      .order("production_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(180);
    if (month) query = query.gte("production_date", `${month}-01`).lt("production_date", nextMonth(month));
    if (selectedId) query = query.eq("id", selectedId);

    const [{ data: settings, error: settingsError }, { data: runs, error: runsError }] = await Promise.all([
      supabase.from("char_siu_production_settings").select("*").eq("id", 1).single(),
      query,
    ]);
    if (settingsError) throw settingsError;
    if (runsError) throw runsError;

    const runIds = (runs || []).map((run) => run.id);
    const [materialsResult, outputsResult] = runIds.length
      ? await Promise.all([
          supabase.from("char_siu_production_materials").select("*").in("run_id", runIds).order("sort_order", { ascending: true }),
          supabase.from("char_siu_production_outputs").select("*").in("run_id", runIds).order("sort_order", { ascending: true }),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (materialsResult.error) throw materialsResult.error;
    if (outputsResult.error) throw outputsResult.error;

    return NextResponse.json({
      success: true,
      settings,
      runs: (runs || []).map((run) => ({
        ...run,
        materials: (materialsResult.data || []).filter((row) => row.run_id === run.id),
        outputs: (outputsResult.data || []).filter((row) => row.run_id === run.id),
      })),
    });
  } catch (error: any) {
    console.error("finance char siu production GET error:", error);
    return NextResponse.json({ success: false, error: error.message || "製造原価の取得に失敗しました" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const unauthorized = await requireFinanceAuthorized(request);
    if (unauthorized) return unauthorized;
    const body = await request.json().catch(() => ({}));
    const token = await getToken({ req: request as any });
    const updatedBy = String(token?.email || "");

    if (body.action === "settings") {
      const { data, error } = await supabase
        .from("char_siu_production_settings")
        .update({
          block_unit_weight_g: positive(body.blockUnitWeightG, 1000),
          lard_unit_weight_g: positive(body.lardUnitWeightG, 50),
          minced_chashu_unit_weight_g: positive(body.mincedChashuUnitWeightG, 1000),
          updated_by: updatedBy,
        })
        .eq("id", 1)
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, settings: data });
    }

    if (body.action === "sync_labor") {
      const effectiveDate = normalizeDate(body.effectiveDate) || todayInJapan();
      const rate = await fetchManufacturingAverageHourlyRate(effectiveDate);
      const { data, error } = await supabase
        .from("char_siu_production_settings")
        .update({
          hourly_wage: rate.hourlyRate,
          labor_rate_staff_count: rate.staffCount,
          labor_rate_excluded_count: rate.excludedCount,
          labor_rate_effective_date: rate.effectiveDate,
          labor_rate_synced_at: rate.syncedAt,
          labor_rate_source: rate.source,
          updated_by: updatedBy,
        })
        .eq("id", 1)
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, settings: data });
    }

    if (body.action === "sync_run_labor") {
      const runId = String(body.id || "").trim();
      const snapshot = await requiredSnapshot(runId);
      const rate = await fetchManufacturingAverageHourlyRate(snapshot.run.production_date);
      await persistRunCalculation({
        snapshot,
        calculation: calculationFromSnapshot(snapshot, { hourlyWage: rate.hourlyRate }),
        productionDate: snapshot.run.production_date,
        notes: snapshot.run.notes,
        laborMeta: {
          labor_rate_staff_count: rate.staffCount,
          labor_rate_excluded_count: rate.excludedCount,
          labor_rate_source: rate.source,
          labor_rate_synced_at: rate.syncedAt,
        },
      });
      return NextResponse.json({ success: true, id: runId });
    }

    if (body.action !== "run") {
      return NextResponse.json({ success: false, error: "操作が不正です" }, { status: 400 });
    }
    const runId = String(body.id || "").trim();
    const snapshot = await requiredSnapshot(runId);
    const materialOverrides = new Map(
      (Array.isArray(body.materials) ? body.materials : []).map((row: any) => [String(row.key || ""), row]),
    );
    const outputOverrides = new Map(
      (Array.isArray(body.outputs) ? body.outputs : []).map((row: any) => [String(row.key || ""), row]),
    );
    const calculation = calculateCharSiuProduction({
      workerCount: positiveInteger(body.workerCount ?? snapshot.run.worker_count, snapshot.run.worker_count),
      workHours: nonNegative(body.workHours ?? snapshot.run.work_hours),
      hourlyWage: nonNegative(snapshot.run.hourly_wage),
      materials: CHAR_SIU_MATERIALS.filter((definition) => snapshot.materials.some((row: any) => row.material_key === definition.key)).map((definition) => {
        const existing = snapshot.materials.find((row: any) => row.material_key === definition.key);
        const override: any = materialOverrides.get(definition.key) || {};
        return {
          materialKey: definition.key,
          usageAmount: nonNegative(override.usageAmount ?? existing.usage_amount),
          purchaseUnitQuantity: positive(override.purchaseUnitQuantity ?? existing.purchase_unit_quantity, existing.purchase_unit_quantity),
          purchasePriceTaxIncluded: nonNegative(override.purchasePriceTaxIncluded ?? existing.purchase_price_tax_included),
        };
      }),
      outputs: CHAR_SIU_OUTPUTS.filter((definition) => snapshot.outputs.some((row: any) => row.output_key === definition.key)).map((definition) => {
        const existing = snapshot.outputs.find((row: any) => row.output_key === definition.key);
        const override: any = outputOverrides.get(definition.key) || {};
        return {
          outputKey: definition.key,
          quantity: nonNegativeInteger(override.quantity ?? existing.quantity),
          unitWeightG: positive(override.unitWeightG ?? existing.unit_weight_g, existing.unit_weight_g),
        };
      }),
    });
    const productionDate = normalizeDate(body.productionDate) || snapshot.run.production_date;
    const notes = body.notes === undefined ? snapshot.run.notes : String(body.notes || "").trim().slice(0, 2000);
    await persistRunCalculation({ snapshot, calculation, productionDate, notes, markMaterialOverrides: true });
    return NextResponse.json({ success: true, id: runId });
  } catch (error: any) {
    console.error("finance char siu production PATCH error:", error);
    return NextResponse.json({ success: false, error: error.message || "製造原価の更新に失敗しました" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const unauthorized = await requireFinanceAuthorized(request);
    if (unauthorized) return unauthorized;
    const url = new URL(request.url);
    const id = String(url.searchParams.get("id") || "").trim();
    if (!id) return NextResponse.json({ success: false, error: "製造実績IDが必要です" }, { status: 400 });
    const { error } = await supabase.from("char_siu_production_runs").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("finance char siu production DELETE error:", error);
    return NextResponse.json({ success: false, error: error.message || "製造実績の削除に失敗しました" }, { status: 500 });
  }
}

function calculationFromSnapshot(snapshot: any, options: { hourlyWage: number }) {
  return calculateCharSiuProduction({
    workerCount: snapshot.run.worker_count,
    workHours: snapshot.run.work_hours,
    hourlyWage: options.hourlyWage,
    materials: CHAR_SIU_MATERIALS.filter((definition) => snapshot.materials.some((item: any) => item.material_key === definition.key)).map((definition) => {
      const row = snapshot.materials.find((item: any) => item.material_key === definition.key);
      return {
        materialKey: definition.key,
        usageAmount: row.usage_amount,
        purchaseUnitQuantity: row.purchase_unit_quantity,
        purchasePriceTaxIncluded: row.purchase_price_tax_included,
      };
    }),
    outputs: CHAR_SIU_OUTPUTS.filter((definition) => snapshot.outputs.some((item: any) => item.output_key === definition.key)).map((definition) => {
      const row = snapshot.outputs.find((item: any) => item.output_key === definition.key);
      return { outputKey: definition.key, quantity: row.quantity, unitWeightG: row.unit_weight_g };
    }),
  });
}

async function persistRunCalculation(options: {
  snapshot: any;
  calculation: ReturnType<typeof calculateCharSiuProduction>;
  productionDate: string;
  notes: string;
  laborMeta?: Record<string, unknown>;
  markMaterialOverrides?: boolean;
}) {
  const { snapshot, calculation } = options;
  const { error: runError } = await supabase
    .from("char_siu_production_runs")
    .update({
      production_date: options.productionDate,
      worker_count: calculation.workerCount,
      work_hours: calculation.workHours,
      hourly_wage: calculation.hourlyWage,
      total_person_hours: calculation.totalPersonHours,
      material_cost: calculation.materialCost,
      labor_cost: calculation.laborCost,
      total_cost: calculation.totalCost,
      total_output_quantity: calculation.totalOutputQuantity,
      total_output_weight_g: calculation.totalOutputWeightG,
      average_cost_per_item: calculation.averageCostPerItem,
      average_cost_per_kg: calculation.averageCostPerKg,
      notes: options.notes,
      ...(options.laborMeta || {}),
    })
    .eq("id", snapshot.run.id);
  if (runError) throw runError;

  const materialRows = calculation.materials.map((material) => {
    const existing = snapshot.materials.find((row: any) => row.material_key === material.materialKey);
    const priceChanged = Number(existing.purchase_unit_quantity) !== Number(material.purchaseUnitQuantity)
      || Number(existing.purchase_price_tax_included) !== Number(material.purchasePriceTaxIncluded);
    return {
      id: existing.id,
      run_id: snapshot.run.id,
      material_key: material.materialKey,
      ingredient_id: existing.ingredient_id,
      material_name: existing.material_name,
      usage_amount: material.usageAmount,
      usage_unit: existing.usage_unit,
      purchase_unit_quantity: material.purchaseUnitQuantity,
      purchase_price_tax_included: material.purchasePriceTaxIncluded,
      unit_cost: material.unitCost,
      material_cost: material.materialCost,
      sort_order: existing.sort_order,
      price_source: options.markMaterialOverrides && priceChanged ? "admin_override" : existing.price_source,
      source_reference: existing.source_reference,
      source_confidence: existing.source_confidence,
      source_note: options.markMaterialOverrides && priceChanged
        ? `財務管理者が修正（元: ${existing.price_source || "不明"}）`
        : existing.source_note,
    };
  });
  const outputRows = calculation.outputs.map((output) => {
    const existing = snapshot.outputs.find((row: any) => row.output_key === output.outputKey);
    return {
      id: existing.id,
      run_id: snapshot.run.id,
      output_key: output.outputKey,
      recipe_id: existing.recipe_id,
      output_name: existing.output_name,
      quantity: output.quantity,
      unit_weight_g: output.unitWeightG,
      output_weight_g: output.outputWeightG,
      allocation_ratio: output.allocationRatio,
      allocated_cost: output.allocatedCost,
      unit_cost: output.unitCost,
      sort_order: existing.sort_order,
    };
  });
  const [materialResult, outputResult] = await Promise.all([
    supabase.from("char_siu_production_materials").upsert(materialRows, { onConflict: "run_id,material_key" }),
    supabase.from("char_siu_production_outputs").upsert(outputRows, { onConflict: "run_id,output_key" }),
  ]);
  if (materialResult.error) throw materialResult.error;
  if (outputResult.error) throw outputResult.error;
}

async function requiredSnapshot(runId: string) {
  if (!runId) throw new Error("製造実績IDが必要です");
  const snapshot = await fetchSnapshot(runId);
  if (!snapshot.run) throw new Error("製造実績が見つかりません");
  return snapshot;
}

async function fetchSnapshot(runId: string) {
  const [runResult, materialsResult, outputsResult] = await Promise.all([
    supabase.from("char_siu_production_runs").select("*").eq("id", runId).maybeSingle(),
    supabase.from("char_siu_production_materials").select("*").eq("run_id", runId),
    supabase.from("char_siu_production_outputs").select("*").eq("run_id", runId),
  ]);
  if (runResult.error) throw runResult.error;
  if (materialsResult.error) throw materialsResult.error;
  if (outputsResult.error) throw outputsResult.error;
  return { run: runResult.data, materials: materialsResult.data || [], outputs: outputsResult.data || [] };
}

async function requireFinanceAuthorized(request: Request) {
  const [token, cookieStore] = await Promise.all([getToken({ req: request as any }), cookies()]);
  if (!token || token.email !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (cookieStore.get("finance-auth")?.value !== "authenticated") {
    return NextResponse.json({ success: false, error: "Finance authentication required" }, { status: 403 });
  }
  return null;
}

function normalizeDate(value: unknown) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function todayInJapan() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function nextMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
