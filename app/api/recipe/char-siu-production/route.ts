export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
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
  taxIncludedIngredientPrice,
} from "@/lib/char-siu-production";
import {
  isCompleteDeliveryNoteScan,
  normalizeDeliveryNoteItems,
} from "@/lib/char-siu-delivery-note";
import {
  fetchManufacturingAverageHourlyRate,
  type ManufacturingLaborRate,
} from "@/lib/tsg-manufacturing-labor";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const deliveryNoteMaterialKeys = new Set(["pork_belly", "green_onion", "ginger"]);

type MaterialSource = {
  priceSource: "delivery_note_ai" | "recipe_master" | "legacy";
  sourceReference?: string | null;
  sourceConfidence?: number | null;
  sourceNote?: string | null;
};

type LaborSnapshot = {
  hourlyRate: number;
  staffCount: number;
  excludedCount: number;
  syncedAt: string | null;
  source: string;
};

export async function GET(request: Request) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const [{ data: settings, error: settingsError }, { data: runs, error: runsError }] = await Promise.all([
      supabase.from("char_siu_production_settings").select("block_unit_weight_g,lard_unit_weight_g,minced_chashu_unit_weight_g").eq("id", 1).single(),
      supabase
        .from("char_siu_production_runs")
        .select("id,production_date,worker_count,work_hours,notes,labor_rate_source,labor_rate_staff_count,created_at,updated_at")
        .order("production_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    if (settingsError) throw settingsError;
    if (runsError) throw runsError;

    const runIds = (runs || []).map((run) => run.id);
    const [materialsResult, outputsResult] = runIds.length
      ? await Promise.all([
          supabase
            .from("char_siu_production_materials")
            .select("run_id,material_key,material_name,usage_amount,usage_unit,price_source,sort_order")
            .in("run_id", runIds)
            .order("sort_order", { ascending: true }),
          supabase
            .from("char_siu_production_outputs")
            .select("run_id,output_key,output_name,quantity,unit_weight_g,sort_order")
            .in("run_id", runIds)
            .order("sort_order", { ascending: true }),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (materialsResult.error) throw materialsResult.error;
    if (outputsResult.error) throw outputsResult.error;

    return NextResponse.json({
      success: true,
      config: {
        materials: CHAR_SIU_MATERIALS.map(({ key, name, unit, sortOrder }) => ({
          key,
          name,
          unit,
          sortOrder,
          priceSource: deliveryNoteMaterialKeys.has(key) ? "delivery_note_ai" : "recipe_master",
        })),
        outputs: outputDefinitions(settings).map(({ key, name, defaultUnitWeightG, sortOrder }) => ({
          key,
          name,
          unitWeightG: defaultUnitWeightG,
          sortOrder,
        })),
      },
      runs: (runs || []).map((run) => ({
        ...run,
        materials: (materialsResult.data || []).filter((row) => row.run_id === run.id),
        outputs: (outputsResult.data || []).filter((row) => row.run_id === run.id),
      })),
    });
  } catch (error: any) {
    console.error("char siu production GET error:", error);
    return NextResponse.json({ success: false, error: error.message || "製造実績の取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let createdRunId: string | null = null;
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const body = await request.json().catch(() => ({}));
    const productionDate = normalizeDate(body.productionDate);
    const workerCount = positiveInteger(body.workerCount, 1);
    const workHours = positive(body.workHours, 0);
    const notes = String(body.notes || "").trim().slice(0, 2000);
    const usageByKey = normalizeValueMap(body.materials, "key", "usageAmount");
    const quantityByKey = normalizeValueMap(body.outputs, "key", "quantity");

    if (!productionDate) {
      return NextResponse.json({ success: false, error: "製造日を入力してください" }, { status: 400 });
    }
    if (workHours <= 0) {
      return NextResponse.json({ success: false, error: "作業時間を入力してください" }, { status: 400 });
    }
    if (!CHAR_SIU_MATERIALS.some((material) => nonNegative(usageByKey[material.key]) > 0)) {
      return NextResponse.json({ success: false, error: "材料の使用量を入力してください" }, { status: 400 });
    }
    if (!CHAR_SIU_OUTPUTS.some((output) => nonNegativeInteger(quantityByKey[output.key]) > 0)) {
      return NextResponse.json({ success: false, error: "出来高を入力してください" }, { status: 400 });
    }

    const token = await getToken({ req: request as any });
    const existingId = String(body.id || "").trim();
    const settings = await fetchSettings();
    const definitions = outputDefinitions(settings);

    if (existingId) {
      const existing = await fetchCostSnapshot(existingId);
      if (!existing.run) {
        return NextResponse.json({ success: false, error: "製造実績が見つかりません" }, { status: 404 });
      }

      const existingMaterialKeys = new Set(existing.materials.map((row: any) => row.material_key));
      const existingOutputKeys = new Set(existing.outputs.map((row: any) => row.output_key));
      const calculation = calculateCharSiuProduction({
        workerCount,
        workHours,
        hourlyWage: existing.run.hourly_wage,
        materials: CHAR_SIU_MATERIALS.filter((definition) => existingMaterialKeys.has(definition.key)).map((definition) => {
          const snapshot = existing.materials.find((row: any) => row.material_key === definition.key);
          return {
            materialKey: definition.key,
            usageAmount: usageByKey[definition.key],
            purchaseUnitQuantity: snapshot.purchase_unit_quantity,
            purchasePriceTaxIncluded: snapshot.purchase_price_tax_included,
          };
        }),
        outputs: definitions.filter((definition) => existingOutputKeys.has(definition.key)).map((definition) => {
          const snapshot = existing.outputs.find((row: any) => row.output_key === definition.key);
          return {
            outputKey: definition.key,
            quantity: quantityByKey[definition.key],
            unitWeightG: snapshot?.unit_weight_g || definition.defaultUnitWeightG,
          };
        }),
      });

      await persistCalculation(existingId, productionDate, notes, calculation, existing.materials, existing.outputs);
      return NextResponse.json({ success: true, id: existingId });
    }

    const deliveryNoteScanId = String(body.deliveryNoteScanId || "").trim();
    if (!deliveryNoteScanId) {
      return NextResponse.json({ success: false, error: "納品書をAIスキャンしてください" }, { status: 400 });
    }
    const { data: scan, error: scanError } = await supabase
      .from("char_siu_delivery_note_scans")
      .select("id,status,target_production_date,extracted_items,used_run_id")
      .eq("id", deliveryNoteScanId)
      .maybeSingle();
    if (scanError) throw scanError;
    const deliveryItems = normalizeDeliveryNoteItems(scan?.extracted_items);
    if (!scan || scan.status !== "ready" || scan.used_run_id || !isCompleteDeliveryNoteScan(deliveryItems)) {
      return NextResponse.json({ success: false, error: "3材料を読取済みの未使用納品書が必要です" }, { status: 400 });
    }
    if (scan.target_production_date !== productionDate) {
      return NextResponse.json({ success: false, error: "納品書に指定した製造日と入力中の製造日が一致しません" }, { status: 400 });
    }

    const labor = await resolveLaborSnapshot(productionDate, settings, String(token?.email || ""));
    const recipeDefinitions = CHAR_SIU_MATERIALS.filter((material) => !deliveryNoteMaterialKeys.has(material.key));
    const { data: ingredientRows, error: ingredientError } = await supabase
      .from("ingredients")
      .select("id,name,price,unit_quantity,tax_included")
      .in("id", recipeDefinitions.map((material) => material.ingredientId));
    if (ingredientError) throw ingredientError;

    const materialSources: Record<string, MaterialSource> = {};
    const materials = CHAR_SIU_MATERIALS.map((definition) => {
      const deliveryItem = deliveryItems.find((item) => item.materialKey === definition.key);
      if (deliveryItem) {
        materialSources[definition.key] = {
          priceSource: "delivery_note_ai",
          sourceReference: deliveryNoteScanId,
          sourceConfidence: deliveryItem.confidence,
          sourceNote: deliveryItem.evidence || deliveryItem.sourceItemName,
        };
        return {
          materialKey: definition.key,
          usageAmount: usageByKey[definition.key],
          purchaseUnitQuantity: deliveryItem.purchaseUnitQuantityG,
          purchasePriceTaxIncluded: deliveryItem.purchasePriceTaxIncluded,
        };
      }

      const master = (ingredientRows || []).find((row) => row.id === definition.ingredientId);
      if (!master) throw new Error(`${definition.name}が材料DBに見つかりません`);
      materialSources[definition.key] = {
        priceSource: "recipe_master",
        sourceReference: definition.ingredientId,
        sourceNote: `材料DB: ${master.name}`,
      };
      return {
        materialKey: definition.key,
        usageAmount: usageByKey[definition.key],
        purchaseUnitQuantity: positive(master.unit_quantity, 1),
        purchasePriceTaxIncluded: taxIncludedIngredientPrice(master.price, master.tax_included),
      };
    });
    const outputs = definitions.map((definition) => ({
      outputKey: definition.key,
      quantity: quantityByKey[definition.key],
      unitWeightG: definition.defaultUnitWeightG,
    }));
    const calculation = calculateCharSiuProduction({
      workerCount,
      workHours,
      hourlyWage: labor.hourlyRate,
      materials,
      outputs,
    });

    const { data: run, error: runError } = await supabase
      .from("char_siu_production_runs")
      .insert(runRecord(productionDate, notes, calculation, String(token?.email || ""), labor))
      .select("id")
      .single();
    if (runError) throw runError;
    createdRunId = run.id;

    await persistChildren(run.id, calculation, [], [], materialSources);
    const { error: scanUseError } = await supabase
      .from("char_siu_delivery_note_scans")
      .update({ status: "used", used_run_id: run.id })
      .eq("id", deliveryNoteScanId)
      .eq("status", "ready")
      .is("used_run_id", null)
      .select("id")
      .single();
    if (scanUseError) throw scanUseError;
    return NextResponse.json({ success: true, id: run.id });
  } catch (error: any) {
    if (createdRunId) {
      await supabase.from("char_siu_production_runs").delete().eq("id", createdRunId);
    }
    console.error("char siu production POST error:", error);
    return NextResponse.json({ success: false, error: error.message || "製造実績の保存に失敗しました" }, { status: 500 });
  }
}

async function resolveLaborSnapshot(productionDate: string, settings: any, updatedBy: string): Promise<LaborSnapshot> {
  try {
    const current = await fetchManufacturingAverageHourlyRate(productionDate);
    await updateLaborSettings(current, updatedBy);
    return current;
  } catch (error) {
    const cachedRate = nonNegative(settings.hourly_wage);
    if (cachedRate > 0 && String(settings.labor_rate_source || "").startsWith("tsg")) {
      console.warn("TSG labor rate sync failed; cached rate is used:", error);
      return {
        hourlyRate: cachedRate,
        staffCount: nonNegativeInteger(settings.labor_rate_staff_count),
        excludedCount: nonNegativeInteger(settings.labor_rate_excluded_count),
        syncedAt: settings.labor_rate_synced_at || null,
        source: "tsg_cached",
      };
    }
    throw error;
  }
}

async function updateLaborSettings(rate: ManufacturingLaborRate, updatedBy: string) {
  const { error } = await supabase
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
    .eq("id", 1);
  if (error) throw error;
}

async function persistCalculation(
  runId: string,
  productionDate: string,
  notes: string,
  calculation: ReturnType<typeof calculateCharSiuProduction>,
  existingMaterials: any[],
  existingOutputs: any[],
) {
  const { error } = await supabase
    .from("char_siu_production_runs")
    .update(runRecord(productionDate, notes, calculation))
    .eq("id", runId);
  if (error) throw error;
  await persistChildren(runId, calculation, existingMaterials, existingOutputs);
}

async function persistChildren(
  runId: string,
  calculation: ReturnType<typeof calculateCharSiuProduction>,
  existingMaterials: any[],
  existingOutputs: any[],
  materialSources: Record<string, MaterialSource> = {},
) {
  const materialRows = calculation.materials.map((material) => {
    const definition = CHAR_SIU_MATERIALS.find((item) => item.key === material.materialKey)!;
    const existing = existingMaterials.find((item) => item.material_key === material.materialKey);
    const source = materialSources[material.materialKey];
    return {
      ...(existing?.id ? { id: existing.id } : {}),
      run_id: runId,
      material_key: material.materialKey,
      ingredient_id: definition.ingredientId,
      material_name: definition.name,
      usage_amount: material.usageAmount,
      usage_unit: definition.unit,
      purchase_unit_quantity: material.purchaseUnitQuantity,
      purchase_price_tax_included: material.purchasePriceTaxIncluded,
      unit_cost: material.unitCost,
      material_cost: material.materialCost,
      sort_order: definition.sortOrder,
      price_source: source?.priceSource || existing?.price_source || "legacy",
      source_reference: source?.sourceReference ?? existing?.source_reference ?? null,
      source_confidence: source?.sourceConfidence ?? existing?.source_confidence ?? null,
      source_note: source?.sourceNote ?? existing?.source_note ?? null,
    };
  });
  const outputRows = calculation.outputs.map((output) => {
    const definition = CHAR_SIU_OUTPUTS.find((item) => item.key === output.outputKey)!;
    const existing = existingOutputs.find((item) => item.output_key === output.outputKey);
    return {
      ...(existing?.id ? { id: existing.id } : {}),
      run_id: runId,
      output_key: output.outputKey,
      recipe_id: definition.recipeId,
      output_name: definition.name,
      quantity: output.quantity,
      unit_weight_g: output.unitWeightG,
      output_weight_g: output.outputWeightG,
      allocation_ratio: output.allocationRatio,
      allocated_cost: output.allocatedCost,
      unit_cost: output.unitCost,
      sort_order: definition.sortOrder,
    };
  });

  const [materialResult, outputResult] = await Promise.all([
    supabase.from("char_siu_production_materials").upsert(materialRows, { onConflict: "run_id,material_key" }),
    supabase.from("char_siu_production_outputs").upsert(outputRows, { onConflict: "run_id,output_key" }),
  ]);
  if (materialResult.error) throw materialResult.error;
  if (outputResult.error) throw outputResult.error;
}

function runRecord(
  productionDate: string,
  notes: string,
  calculation: ReturnType<typeof calculateCharSiuProduction>,
  createdBy?: string,
  labor?: LaborSnapshot,
) {
  return {
    production_date: productionDate,
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
    notes,
    ...(createdBy !== undefined ? { created_by: createdBy } : {}),
    ...(labor ? {
      labor_rate_staff_count: labor.staffCount,
      labor_rate_excluded_count: labor.excludedCount,
      labor_rate_source: labor.source,
      labor_rate_synced_at: labor.syncedAt,
    } : {}),
  };
}

async function fetchSettings() {
  const { data, error } = await supabase
    .from("char_siu_production_settings")
    .select("hourly_wage,block_unit_weight_g,lard_unit_weight_g,minced_chashu_unit_weight_g,labor_rate_staff_count,labor_rate_excluded_count,labor_rate_synced_at,labor_rate_source")
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data;
}

async function fetchCostSnapshot(runId: string) {
  const [runResult, materialResult, outputResult] = await Promise.all([
    supabase.from("char_siu_production_runs").select("*").eq("id", runId).maybeSingle(),
    supabase.from("char_siu_production_materials").select("*").eq("run_id", runId),
    supabase.from("char_siu_production_outputs").select("*").eq("run_id", runId),
  ]);
  if (runResult.error) throw runResult.error;
  if (materialResult.error) throw materialResult.error;
  if (outputResult.error) throw outputResult.error;
  return { run: runResult.data, materials: materialResult.data || [], outputs: outputResult.data || [] };
}

function outputDefinitions(settings: any) {
  return CHAR_SIU_OUTPUTS.map((output) => ({
    ...output,
    defaultUnitWeightG: output.key === "block"
      ? positive(settings?.block_unit_weight_g, output.defaultUnitWeightG)
      : output.key === "lard"
        ? positive(settings?.lard_unit_weight_g, output.defaultUnitWeightG)
        : output.key === "minced_chashu"
          ? positive(settings?.minced_chashu_unit_weight_g, output.defaultUnitWeightG)
        : output.defaultUnitWeightG,
  }));
}

function normalizeValueMap(value: unknown, keyName: string, valueName: string): Record<string, number> {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.map((row: any) => [String(row?.[keyName] || ""), nonNegative(row?.[valueName])]));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, nonNegative(entry)]));
  }
  return {};
}

function normalizeDate(value: unknown) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

async function requireAuthorized(request: Request) {
  const token = await getToken({ req: request as any });
  if (!token || token.email !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
