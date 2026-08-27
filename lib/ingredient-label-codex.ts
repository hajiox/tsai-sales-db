export const INGREDIENT_LABEL_AI_MODEL = "gpt-5.6-sol";
export const INGREDIENT_LABEL_AI_REASONING_EFFORT = "ultra";
export const INGREDIENT_LABEL_RULES_VERSION = "2026-08-27.1";

export const MANDATORY_ALLERGENS_2026 = [
  "えび",
  "カシューナッツ",
  "かに",
  "くるみ",
  "小麦",
  "そば",
  "卵",
  "乳成分",
  "落花生",
] as const;

export const RECOMMENDED_ALLERGENS_2026 = [
  "アーモンド",
  "あわび",
  "いか",
  "いくら",
  "オレンジ",
  "キウイフルーツ",
  "牛肉",
  "ごま",
  "さけ",
  "さば",
  "大豆",
  "鶏肉",
  "バナナ",
  "ピスタチオ",
  "豚肉",
  "マカダミアナッツ",
  "もも",
  "やまいも",
  "りんご",
  "ゼラチン",
] as const;

const ALLOWED_ALLERGENS = new Set<string>([
  ...MANDATORY_ALLERGENS_2026,
  ...RECOMMENDED_ALLERGENS_2026,
]);

export type IngredientLabelAiResult = {
  label: string;
  ingredient_statement: string;
  allergen_statement: string;
  allergens: string[];
  warnings: string[];
  missing_information: string[];
  review_notes: string[];
  adoption_blocked: boolean;
  human_review_required: true;
};

export type IngredientLabelJobView = {
  id: string;
  status: "queued" | "running" | "waiting_for_user" | "needs_review" | "completed" | "failed" | "cancelled";
  progress: number;
  currentStep: string;
  errorMessage: string | null;
  result: IngredientLabelAiResult | null;
  model: string;
  reasoningEffort: string;
  rulesVersion: string;
  createdAt: string;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizedText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

function normalizedList(value: unknown, maxItems = 40) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => normalizedText(item, 500)).filter(Boolean))].slice(0, maxItems);
}

export function validateIngredientLabelAiResult(value: unknown): IngredientLabelAiResult {
  const result = asObject(value);
  const ingredientStatement = normalizedText(result.ingredient_statement, 4_000);
  const allergenStatement = normalizedText(result.allergen_statement, 1_000);
  const label = normalizedText(result.label, 5_000);
  if (!ingredientStatement) throw new Error("原材料表示案が空欄です");
  if (/【\s*要確認|<[^>]*(?:unknown|missing)[^>]*>/i.test(label)) {
    throw new Error("原材料表示案に確認用プレースホルダーを混在できません");
  }
  const expectedLabel = [ingredientStatement, allergenStatement].filter(Boolean).join("\n");
  if (label !== expectedLabel) throw new Error("原材料表示案の本文と内訳が一致しません");
  if (allergenStatement && !/^（一部に.+を含む）$/.test(allergenStatement)) {
    throw new Error("一括アレルゲン表示の形式が正しくありません");
  }
  const allergens = normalizedList(result.allergens, 40);
  const unsupported = allergens.filter((item) => !ALLOWED_ALLERGENS.has(item));
  if (unsupported.length > 0) {
    throw new Error(`現行リストにないアレルゲン名があります: ${unsupported.join("、")}`);
  }
  const missingInformation = normalizedList(result.missing_information);
  const adoptionBlocked = Boolean(result.adoption_blocked) || missingInformation.length > 0;
  if (result.human_review_required !== true) {
    throw new Error("原材料表示案は人による最終確認必須として返してください");
  }
  return {
    label,
    ingredient_statement: ingredientStatement,
    allergen_statement: allergenStatement,
    allergens,
    warnings: normalizedList(result.warnings),
    missing_information: missingInformation,
    review_notes: normalizedList(result.review_notes),
    adoption_blocked: adoptionBlocked,
    human_review_required: true,
  };
}

export function ingredientLabelJobViewFromRow(value: unknown): IngredientLabelJobView | null {
  const row = asObject(value);
  const parameters = asObject(row.parameters);
  const rawResult = asObject(row.result);
  const id = String(row.id || "").trim();
  if (!id) return null;
  let result: IngredientLabelAiResult | null = null;
  if (String(row.status || "") === "completed") {
    const candidate = rawResult.data && typeof rawResult.data === "object" ? rawResult.data : rawResult;
    result = validateIngredientLabelAiResult(candidate);
  }
  return {
    id,
    status: String(row.status || "queued") as IngredientLabelJobView["status"],
    progress: Math.max(0, Math.min(100, Number(row.progress) || 0)),
    currentStep: String(row.current_step || "実行待ち"),
    errorMessage: row.error_message ? String(row.error_message).slice(0, 2_000) : null,
    result,
    model: String(parameters.model || INGREDIENT_LABEL_AI_MODEL),
    reasoningEffort: String(parameters.reasoningEffort || INGREDIENT_LABEL_AI_REASONING_EFFORT),
    rulesVersion: String(parameters.rulesVersion || INGREDIENT_LABEL_RULES_VERSION),
    createdAt: String(row.created_at || ""),
    startedAt: row.started_at ? String(row.started_at) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}
