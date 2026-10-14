export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getBusinessAdminSession, isBusinessAdminSession } from "@/lib/data-access/business-operation-context";
import {
  calculateCharSiuProduction,
  CHAR_SIU_MATERIALS,
  CHAR_SIU_OUTPUTS,
  nonNegative,
  nonNegativeInteger,
  normalizeCharSiuDate,
  positive,
  positiveInteger,
  resolveCharSiuProductionDates,
  resolveCharSiuStageLabor,
} from "@/lib/char-siu-production";
import {
  isCompleteDeliveryNoteScan,
  normalizeDeliveryNoteItems,
} from "@/lib/char-siu-delivery-note";
import { prepareCharSiuProductionSources, charSiuProductionRows, charSiuProductionRunRecord as runRecord, charSiuOutputDefinitions as outputDefinitions, type MaterialSource } from "@/lib/char-siu-production-service";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const deliveryNoteMaterialKeys = new Set(["pork_belly", "green_onion", "ginger"]);

export async function GET(request: Request) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const [{ data: settings, error: settingsError }, { data: runs, error: runsError }] = await Promise.all([
      supabase.from("char_siu_production_settings").select("block_unit_weight_g,lard_unit_weight_g,minced_chashu_unit_weight_g").eq("id", 1).single(),
      supabase
        .from("char_siu_production_runs")
        .select("id,production_date,packaging_date,worker_count,work_hours,cooking_worker_count,cooking_work_hours,packaging_worker_count,packaging_work_hours,total_person_hours,notes,labor_rate_source,labor_rate_staff_count,created_at,updated_at")
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
    const productionDate = normalizeCharSiuDate(body.productionDate);
    const notes = String(body.notes || "").trim().slice(0, 2000);
    const usageByKey = normalizeValueMap(body.materials, "key", "usageAmount");
    const quantityByKey = normalizeValueMap(body.outputs, "key", "quantity");

    if (!productionDate) {
      return NextResponse.json({ success: false, error: "正しい煮込み日を入力してください" }, { status: 400 });
    }
    if (!CHAR_SIU_MATERIALS.some((material) => nonNegative(usageByKey[material.key]) > 0)) {
      return NextResponse.json({ success: false, error: "材料の使用量を入力してください" }, { status: 400 });
    }
    if (!CHAR_SIU_OUTPUTS.some((output) => nonNegativeInteger(quantityByKey[output.key]) > 0)) {
      return NextResponse.json({ success: false, error: "出来高を入力してください" }, { status: 400 });
    }

    const token = await getAuthorizedIdentity(request);
    const existingId = String(body.id || "").trim();
    const settings = await fetchSettings();
    const definitions = outputDefinitions(settings);

    if (existingId) {
      const existing = await fetchCostSnapshot(existingId);
      if (!existing.run) {
        return NextResponse.json({ success: false, error: "製造実績が見つかりません" }, { status: 404 });
      }
      const dates = resolveCharSiuProductionDates(productionDate, body.packagingDate, existing.run.packaging_date ?? null);
      if (!dates) return invalidProductionDates();
      const laborInput = resolveCharSiuStageLabor(body, existing.run);
      if (laborInput.error) return NextResponse.json({ success: false, error: laborInput.error }, { status: 400 });
      const workerCount = laborInput.stages?.cookingWorkerCount ?? positiveInteger(body.workerCount ?? existing.run.worker_count, 1);
      const workHours = laborInput.stages?.cookingWorkHours ?? positive(body.workHours ?? existing.run.work_hours, 0);
      if (workHours <= 0) return NextResponse.json({ success: false, error: "作業時間を入力してください" }, { status: 400 });

      const existingMaterialKeys = new Set(existing.materials.map((row: any) => row.material_key));
      const existingOutputKeys = new Set(existing.outputs.map((row: any) => row.output_key));
      const calculation = calculateCharSiuProduction({
        workerCount,
        workHours,
        ...(laborInput.stages || {}),
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

      await persistCalculation(existingId, dates, notes, calculation, existing.materials, existing.outputs);
      return NextResponse.json({ success: true, id: existingId });
    }

    const dates = resolveCharSiuProductionDates(productionDate, body.packagingDate);
    if (!dates) return invalidProductionDates();
    const laborInput = resolveCharSiuStageLabor(body);
    if (laborInput.error) return NextResponse.json({ success: false, error: laborInput.error }, { status: 400 });
    const workerCount = laborInput.stages?.cookingWorkerCount ?? positiveInteger(body.workerCount, 1);
    const workHours = laborInput.stages?.cookingWorkHours ?? positive(body.workHours, 0);
    if (workHours <= 0) return NextResponse.json({ success: false, error: "作業時間を入力してください" }, { status: 400 });
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

    const { calculation, materialSources, labor } = await prepareCharSiuProductionSources(supabase, {
      productionDate, workerCount, workHours, stages: laborInput.stages,
      usageByKey, quantityByKey, deliveryItems, deliveryNoteScanId,
    }, settings, String(token?.email || ""), true);

    const { data: run, error: runError } = await supabase
      .from("char_siu_production_runs")
      .insert(runRecord(dates, notes, calculation, String(token?.email || ""), labor))
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

async function persistCalculation(
  runId: string,
  dates: { productionDate: string; packagingDate: string | null },
  notes: string,
  calculation: ReturnType<typeof calculateCharSiuProduction>,
  existingMaterials: any[],
  existingOutputs: any[],
) {
  const { error } = await supabase
    .from("char_siu_production_runs")
    .update(runRecord(dates, notes, calculation))
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
  const { materialRows, outputRows } = charSiuProductionRows(runId, calculation, existingMaterials, existingOutputs, materialSources);
  const [materialResult, outputResult] = await Promise.all([
    supabase.from("char_siu_production_materials").upsert(materialRows, { onConflict: "run_id,material_key" }),
    supabase.from("char_siu_production_outputs").upsert(outputRows, { onConflict: "run_id,output_key" }),
  ]);
  if (materialResult.error) throw materialResult.error;
  if (outputResult.error) throw outputResult.error;
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

function normalizeValueMap(value: unknown, keyName: string, valueName: string): Record<string, number> {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.map((row: any) => [String(row?.[keyName] || ""), nonNegative(row?.[valueName])]));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, nonNegative(entry)]));
  }
  return {};
}

function invalidProductionDates() {
  return NextResponse.json({ success: false, error: "包装日は煮込み日以降の正しい日付を入力してください" }, { status: 400 });
}

async function requireAuthorized(request: Request) {
  const token = await getAuthorizedIdentity(request);
  if (!token) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

async function getAuthorizedIdentity(request: Request) {
  const session = await getBusinessAdminSession(request);
  return isBusinessAdminSession(session) ? session!.user : null;
}
