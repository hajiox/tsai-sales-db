import assert from "node:assert/strict";
import { validateIngredientLabelAiResult } from "../lib/ingredient-label-codex.ts";

const policy = {
  expectedOriginTarget: {
    itemId: "item-rank-1",
    name: "豚肉",
    declaredOrigin: "国産",
  },
  forbiddenOriginTexts: ["国内製造"],
  requiredAllergens: ["小麦", "大豆"],
};

function result(overrides = {}) {
  const ingredientStatement = overrides.ingredient_statement
    || "豚肉（国産）、しょうゆ／調味料（アミノ酸等）";
  const allergenStatement = Object.hasOwn(overrides, "allergen_statement")
    ? overrides.allergen_statement
    : "（一部に小麦・大豆を含む）";
  return {
    ingredient_statement: ingredientStatement,
    origin_label: {
      target_item_id: "item-rank-1",
      target_name: "豚肉",
      display_text: "国産",
    },
    allergen_statement: allergenStatement,
    allergens: ["大豆", "小麦"],
    warnings: ["個別表示が原則のため最終確認が必要です"],
    missing_information: [],
    review_notes: [],
    adoption_blocked: false,
    human_review_required: true,
    ...overrides,
    label: [ingredientStatement, allergenStatement].filter(Boolean).join("\n"),
  };
}

const valid = validateIngredientLabelAiResult(result(), policy);
assert.deepEqual(valid.allergens, ["小麦", "大豆"]);
assert.equal(valid.origin_label?.target_item_id, "item-rank-1");

assert.throws(
  () => validateIngredientLabelAiResult(result({
    allergens: ["小麦"],
    allergen_statement: "（一部に小麦を含む）",
  }), policy),
  /アレルゲンが一括表示から漏れています/,
);

assert.throws(
  () => validateIngredientLabelAiResult(result({
    ingredient_statement: "豚肉（国産）、しょうゆ（国内製造）／調味料（アミノ酸等）",
  }), policy),
  /重量順位2位以下の原産地表示|重量順位1位の原材料だけ/,
);

assert.throws(
  () => validateIngredientLabelAiResult(result({
    origin_label: {
      target_item_id: "item-rank-2",
      target_name: "しょうゆ",
      display_text: "国産",
    },
  }), policy),
  /重量順位1位の原材料と一致しません/,
);

assert.throws(
  () => validateIngredientLabelAiResult(result({ origin_label: undefined }), policy),
  /原料原産地適用情報がありません/,
);

const unresolvedOrigin = validateIngredientLabelAiResult(result({
  ingredient_statement: "豚肉、しょうゆ／調味料（アミノ酸等）",
  origin_label: {
    target_item_id: "item-rank-1",
    target_name: "豚肉",
    display_text: "",
  },
  missing_information: ["重量順位1位の原産地が食材DBにありません"],
  adoption_blocked: true,
}), {
  ...policy,
  expectedOriginTarget: { ...policy.expectedOriginTarget, declaredOrigin: null },
});
assert.equal(unresolvedOrigin.adoption_blocked, true);

console.log("Ingredient label legal policy verified.");
