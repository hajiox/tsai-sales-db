export type CharSiuMaterialKey =
  | "pork_belly"
  | "green_onion"
  | "ginger"
  | "soy_sauce"
  | "sake"
  | "haimi"
  | "granulated_sugar";

export type CharSiuOutputKey =
  | "chashu_wakeari_800"
  | "chashu_slice_700"
  | "retort_thick_600"
  | "retort_medium_380"
  | "retort_cut_600"
  | "block"
  | "lard"
  | "minced_chashu";

export const CHAR_SIU_MATERIALS: Array<{
  key: CharSiuMaterialKey;
  name: string;
  ingredientId: string;
  unit: "g" | "ml";
  sortOrder: number;
}> = [
  { key: "pork_belly", name: "豚バラ肉", ingredientId: "94186101-6750-4415-959c-ba556596514c", unit: "g", sortOrder: 1 },
  { key: "green_onion", name: "ネギ", ingredientId: "efa28c2b-3c69-4313-933e-8442a906518d", unit: "g", sortOrder: 2 },
  { key: "ginger", name: "生姜", ingredientId: "8dfff3e1-8a59-4368-a7b4-6a3fc0eb23ec", unit: "g", sortOrder: 3 },
  { key: "soy_sauce", name: "福島県産小麦醤油（星醸造）", ingredientId: "caa43d54-48b7-45ee-b938-aa1044407274", unit: "ml", sortOrder: 4 },
  { key: "sake", name: "本料理清酒", ingredientId: "4452027e-4660-46a7-a5f9-952de41ec5f4", unit: "ml", sortOrder: 5 },
  { key: "haimi", name: "ハイミー", ingredientId: "6cd15b51-ac4b-4ec0-99c6-e8cf8d6e11df", unit: "g", sortOrder: 6 },
  { key: "granulated_sugar", name: "グラニュー糖", ingredientId: "0b2a643e-ce68-4e07-9cd9-0d18fd429d94", unit: "g", sortOrder: 7 },
];

export const CHAR_SIU_OUTPUTS: Array<{
  key: CharSiuOutputKey;
  name: string;
  recipeId: string | null;
  defaultUnitWeightG: number;
  sortOrder: number;
}> = [
  { key: "chashu_wakeari_800", name: "チャーシュー訳あり800g", recipeId: "b0756b7d-5fd3-46b3-a4e5-58d6888696c1", defaultUnitWeightG: 800, sortOrder: 1 },
  { key: "chashu_slice_700", name: "チャーシュースライス700g", recipeId: "0fed5109-cf4a-465c-a0d4-83e4d73e4bbf", defaultUnitWeightG: 700, sortOrder: 2 },
  { key: "retort_thick_600", name: "極厚レトルトチャーシュー600g", recipeId: "367ddfed-a797-4ede-8b64-b6a1f09a7255", defaultUnitWeightG: 600, sortOrder: 3 },
  { key: "retort_medium_380", name: "中厚レトルトチャーシュー380g", recipeId: "6ab00c37-f4d6-468e-b650-bea8d0863b62", defaultUnitWeightG: 380, sortOrder: 4 },
  { key: "retort_cut_600", name: "切り落としレトルトチャーシュー600g", recipeId: "6cc746e8-e55d-4b3e-8d8d-f057b2b4c2de", defaultUnitWeightG: 600, sortOrder: 5 },
  { key: "block", name: "チャーシューブロック", recipeId: null, defaultUnitWeightG: 1000, sortOrder: 6 },
  { key: "lard", name: "ラード", recipeId: "7d02b007-2223-4dcb-bb7a-8cc23751f4bc", defaultUnitWeightG: 50, sortOrder: 7 },
  { key: "minced_chashu", name: "挽チャーシュー", recipeId: null, defaultUnitWeightG: 1000, sortOrder: 8 },
];

export type ProductionMaterialCalculation = {
  materialKey: CharSiuMaterialKey;
  usageAmount: number;
  purchaseUnitQuantity: number;
  purchasePriceTaxIncluded: number;
};

export type ProductionOutputCalculation = {
  outputKey: CharSiuOutputKey;
  quantity: number;
  unitWeightG: number;
};

export function calculateCharSiuProduction(params: {
  workerCount: number;
  workHours: number;
  hourlyWage: number;
  materials: ProductionMaterialCalculation[];
  outputs: ProductionOutputCalculation[];
}) {
  const workerCount = positiveInteger(params.workerCount, 1);
  const workHours = nonNegative(params.workHours);
  const hourlyWage = nonNegative(params.hourlyWage);
  const totalPersonHours = round(workerCount * workHours, 2);

  const materials = params.materials.map((material) => {
    const usageAmount = nonNegative(material.usageAmount);
    const purchaseUnitQuantity = positive(material.purchaseUnitQuantity, 1);
    const purchasePriceTaxIncluded = nonNegative(material.purchasePriceTaxIncluded);
    const unitCost = round(purchasePriceTaxIncluded / purchaseUnitQuantity, 8);
    return {
      ...material,
      usageAmount,
      purchaseUnitQuantity,
      purchasePriceTaxIncluded,
      unitCost,
      materialCost: round(usageAmount * unitCost, 4),
    };
  });

  const materialCost = round(materials.reduce((sum, material) => sum + material.materialCost, 0), 4);
  const laborCost = round(totalPersonHours * hourlyWage, 4);
  const totalCost = round(materialCost + laborCost, 4);

  const baseOutputs = params.outputs.map((output) => {
    const quantity = nonNegativeInteger(output.quantity);
    const unitWeightG = positive(output.unitWeightG, 1);
    return {
      ...output,
      quantity,
      unitWeightG,
      outputWeightG: round(quantity * unitWeightG, 2),
    };
  });
  const totalOutputQuantity = baseOutputs.reduce((sum, output) => sum + output.quantity, 0);
  const totalOutputWeightG = round(baseOutputs.reduce((sum, output) => sum + output.outputWeightG, 0), 2);

  const outputs = baseOutputs.map((output) => {
    const allocationRatio = totalOutputWeightG > 0 ? output.outputWeightG / totalOutputWeightG : 0;
    const allocatedCost = round(totalCost * allocationRatio, 4);
    return {
      ...output,
      allocationRatio: round(allocationRatio, 8),
      allocatedCost,
      unitCost: output.quantity > 0 ? round(allocatedCost / output.quantity, 4) : null,
    };
  });

  return {
    workerCount,
    workHours,
    hourlyWage,
    totalPersonHours,
    materialCost,
    laborCost,
    totalCost,
    totalOutputQuantity,
    totalOutputWeightG,
    averageCostPerItem: totalOutputQuantity > 0 ? round(totalCost / totalOutputQuantity, 4) : null,
    averageCostPerKg: totalOutputWeightG > 0 ? round((totalCost / totalOutputWeightG) * 1000, 4) : null,
    materials,
    outputs,
  };
}

export function taxIncludedIngredientPrice(price: unknown, taxIncluded: unknown) {
  const value = nonNegative(price);
  return round(taxIncluded === false ? value * 1.08 : value, 4);
}

export function nonNegative(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function positive(value: unknown, fallback = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function nonNegativeInteger(value: unknown) {
  return Math.max(0, Math.round(nonNegative(value)));
}

export function positiveInteger(value: unknown, fallback = 1) {
  return Math.max(1, Math.round(positive(value, fallback)));
}

export function round(value: number, decimals = 4) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
