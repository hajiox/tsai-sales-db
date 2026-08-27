export const INGREDIENT_LABEL_AI_MODEL = "gpt-5.6-sol";
export const INGREDIENT_LABEL_AI_REASONING_EFFORT = "ultra";
export const INGREDIENT_LABEL_RULES_VERSION = "2026-08-27.2";

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

export const ALLERGEN_DISPLAY_ORDER_2026 = [
  ...MANDATORY_ALLERGENS_2026,
  ...RECOMMENDED_ALLERGENS_2026,
] as const;

const ALLERGEN_DISPLAY_RANK = new Map<string, number>(
  ALLERGEN_DISPLAY_ORDER_2026.map((name, index) => [name, index]),
);

export type IngredientLabelOriginTarget = {
  itemId: string;
  name: string;
  declaredOrigin: string | null;
};

export type IngredientLabelValidationPolicy = {
  expectedOriginTarget: IngredientLabelOriginTarget | null;
  forbiddenOriginTexts: string[];
  requiredAllergens: string[];
};

export type IngredientLabelOriginApplication = {
  target_item_id: string | null;
  target_name: string;
  display_text: string;
};

export type IngredientLabelAiResult = {
  label: string;
  ingredient_statement: string;
  origin_label: IngredientLabelOriginApplication | null;
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

function normalizeOriginDisplayText(value: unknown) {
  return normalizedText(value, 300)
    .replace(/^[（(]\s*/, "")
    .replace(/\s*[）)]$/, "")
    .trim();
}

function normalizeOriginApplication(value: unknown): IngredientLabelOriginApplication | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const origin = asObject(value);
  const targetItemId = normalizedText(origin.target_item_id, 200) || null;
  return {
    target_item_id: targetItemId,
    target_name: normalizedText(origin.target_name, 300),
    display_text: normalizeOriginDisplayText(origin.display_text),
  };
}

function countOccurrences(value: string, search: string) {
  if (!search) return 0;
  let count = 0;
  let cursor = 0;
  while ((cursor = value.indexOf(search, cursor)) !== -1) {
    count += 1;
    cursor += search.length;
  }
  return count;
}

function detectedOriginMarkers(value: string) {
  return value.match(/（[^（）]*(?:国産|国内製造|外国製造|輸入|[ぁ-んァ-ヶ一-龥A-Za-z]+産|[ぁ-んァ-ヶ一-龥A-Za-z]+製造)[^（）]*）/g) || [];
}

function sortedCanonicalAllergens(value: unknown) {
  const allergens = normalizedList(value, 40);
  const unsupported = allergens.filter((item) => !ALLOWED_ALLERGENS.has(item));
  if (unsupported.length > 0) {
    throw new Error(`現行リストにないアレルゲン名があります: ${unsupported.join("、")}`);
  }
  return allergens.sort((left, right) => (
    (ALLERGEN_DISPLAY_RANK.get(left) ?? Number.MAX_SAFE_INTEGER)
    - (ALLERGEN_DISPLAY_RANK.get(right) ?? Number.MAX_SAFE_INTEGER)
  ));
}

export function validateIngredientLabelAiResult(
  value: unknown,
  policy?: IngredientLabelValidationPolicy,
): IngredientLabelAiResult {
  const result = asObject(value);
  const ingredientStatement = normalizedText(result.ingredient_statement, 4_000);
  const originLabel = normalizeOriginApplication(result.origin_label);
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
  const allergens = sortedCanonicalAllergens(result.allergens);
  const missingInformation = normalizedList(result.missing_information);
  const adoptionBlocked = Boolean(result.adoption_blocked) || missingInformation.length > 0;
  if (policy) {
    const requiredAllergens = sortedCanonicalAllergens(policy.requiredAllergens);
    const omittedAllergens = requiredAllergens.filter((item) => !allergens.includes(item));
    if (omittedAllergens.length > 0) {
      throw new Error(`食材DBで確認済みのアレルゲンが一括表示から漏れています: ${omittedAllergens.join("、")}`);
    }
    const expectedAllergenStatement = allergens.length > 0
      ? `（一部に${allergens.join("・")}を含む）`
      : "";
    if (allergenStatement !== expectedAllergenStatement) {
      throw new Error("一括アレルゲン表示と全アレルゲン一覧が一致しません");
    }

    const target = policy.expectedOriginTarget;
    if (!originLabel) throw new Error("重量順位1位の原料原産地適用情報がありません");
    if (!target) {
      if (originLabel.target_item_id || originLabel.target_name || originLabel.display_text) {
        throw new Error("重量順位1位を確定できない状態で原産地を表示できません");
      }
      if (!adoptionBlocked) throw new Error("重量順位1位を確定できない表示案は採用停止が必要です");
    } else {
      if (originLabel.target_item_id !== target.itemId || originLabel.target_name !== target.name) {
        throw new Error("原産地表示の対象が重量順位1位の原材料と一致しません");
      }
      const declaredOrigin = normalizeOriginDisplayText(target.declaredOrigin);
      if (!declaredOrigin) {
        if (originLabel.display_text || !adoptionBlocked) {
          throw new Error("重量順位1位の原産地根拠がない表示案は採用停止が必要です");
        }
      } else {
        if (originLabel.display_text !== declaredOrigin) {
          throw new Error("原産地表示が重量順位1位の保存済み根拠と一致しません");
        }
        const marker = `（${declaredOrigin}）`;
        if (countOccurrences(ingredientStatement, marker) !== 1) {
          throw new Error("重量順位1位の原産地表示は原材料表示内に1回だけ必要です");
        }
      }
    }
    const allowedOrigin = normalizeOriginDisplayText(target?.declaredOrigin);
    const forbiddenOrigins = [...new Set(policy.forbiddenOriginTexts.map(normalizeOriginDisplayText).filter(Boolean))]
      .filter((origin) => origin !== allowedOrigin);
    const leakedOrigin = forbiddenOrigins.find((origin) => ingredientStatement.includes(`（${origin}）`));
    if (leakedOrigin) {
      throw new Error(`重量順位2位以下の原産地表示は付けられません: ${leakedOrigin}`);
    }
    const originMarkers = detectedOriginMarkers(ingredientStatement);
    const expectedMarkerCount = target && allowedOrigin ? 1 : 0;
    if (originMarkers.length !== expectedMarkerCount) {
      throw new Error("原料原産地表示は重量順位1位の原材料だけに付けてください");
    }
  }
  if (result.human_review_required !== true) {
    throw new Error("原材料表示案は人による最終確認必須として返してください");
  }
  return {
    label,
    ingredient_statement: ingredientStatement,
    origin_label: originLabel,
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
