export type LabelCheckMode = "simple" | "normal";
export type LabelJudgment = "OK" | "NG" | "UNKNOWN" | "MANUAL";

export type LabelOcrResult = {
  product_name: string | null;
  raw_materials: string | null;
  additives: string | null;
  allergens: string | null;
  net_content: string | null;
  expiry_date: string | null;
  expiry_date_normalized: string | null;
  manufacturing_date: string | null;
  manufacturing_date_normalized: string | null;
  storage_method: string | null;
  manufacturer: string | null;
  confidence: number;
  warnings: string[];
};

export type RecipeCandidate = {
  recipe_id: string;
  recipe_name: string;
  category: string | null;
  shelf_life: string | null;
  confidence: number;
  reason: string;
};

export type LabelJudgmentResult = {
  judgment: "OK" | "NG";
  shelf_life_days: number;
  expected_expiry: string;
  deviation_percent: number;
  deviation_days: number;
};
