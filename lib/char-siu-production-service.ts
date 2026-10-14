import "server-only";
import { calculateCharSiuProduction, CHAR_SIU_MATERIALS, CHAR_SIU_OUTPUTS, nonNegative, nonNegativeInteger, positive, taxIncludedIngredientPrice, type CharSiuStageLabor } from "@/lib/char-siu-production";
import type { DeliveryNoteExtractedItem } from "@/lib/char-siu-delivery-note";
import { fetchManufacturingAverageHourlyRate, type ManufacturingLaborRate } from "@/lib/tsg-manufacturing-labor";
const deliveryNoteMaterialKeys = new Set(["pork_belly", "green_onion", "ginger"]);
export type MaterialSource = {
  priceSource: "delivery_note_ai" | "recipe_master" | "legacy";
  sourceReference?: string | null;
  sourceConfidence?: number | null;
  sourceNote?: string | null;
};

export type LaborSnapshot = {
  hourlyRate: number;
  staffCount: number;
  excludedCount: number;
  syncedAt: string | null;
  source: string;
};

export async function prepareCharSiuProductionSources(db: any, input: {
  productionDate: string; workerCount: number; workHours: number; stages?: CharSiuStageLabor | null;
  usageByKey: Record<string, number>; quantityByKey: Record<string, number>;
  deliveryItems: DeliveryNoteExtractedItem[]; deliveryNoteScanId: string;
}, settings: any, actor: string, refreshLaborCache = false) {
  const { productionDate, workerCount, workHours, stages, usageByKey, quantityByKey, deliveryItems, deliveryNoteScanId } = input;
  const definitions = charSiuOutputDefinitions(settings);
  const labor = await resolveLaborSnapshot(db, productionDate, settings, actor, refreshLaborCache);
  const recipeDefinitions = CHAR_SIU_MATERIALS.filter((material) => !deliveryNoteMaterialKeys.has(material.key));
  const { data: ingredientRows, error: ingredientError } = await db
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

    const master = (ingredientRows || []).find((row: { id: string; name: string; price: unknown; unit_quantity: unknown; tax_included: unknown }) => row.id === definition.ingredientId);
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
    ...(stages || {}),
    hourlyWage: labor.hourlyRate,
    materials,
    outputs,
  });

  return { calculation, materialSources, labor };
}

async function resolveLaborSnapshot(db: any, productionDate: string, settings: any, updatedBy: string, refreshCache: boolean): Promise<LaborSnapshot> {
  try {
    const current = await fetchManufacturingAverageHourlyRate(productionDate);
    if (refreshCache) await updateLaborSettings(db, current, updatedBy);
    return current;
  } catch (error) {
    const cachedRate = nonNegative(settings.hourly_wage);
    if (cachedRate > 0 && String(settings.labor_rate_source || "").startsWith("tsg")) {
      console.warn("TSG labor rate sync failed; verified cached rate is used");
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

async function updateLaborSettings(db: any, rate: ManufacturingLaborRate, updatedBy: string) {
  const { error } = await db
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

export function charSiuProductionRows(
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

  return { materialRows, outputRows };
}

export function charSiuProductionRunRecord(
  dates: { productionDate: string; packagingDate: string | null },
  notes: string,
  calculation: ReturnType<typeof calculateCharSiuProduction>,
  createdBy?: string,
  labor?: LaborSnapshot,
) {
  return {
    production_date: dates.productionDate,
    packaging_date: dates.packagingDate,
    worker_count: calculation.workerCount,
    work_hours: calculation.workHours,
    cooking_worker_count: calculation.cookingWorkerCount,
    cooking_work_hours: calculation.cookingWorkHours,
    packaging_worker_count: calculation.packagingWorkerCount,
    packaging_work_hours: calculation.packagingWorkHours,
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

export function charSiuOutputDefinitions(settings: any) {
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

