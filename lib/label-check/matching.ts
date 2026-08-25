import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecipeCandidate } from "./types";

type RecipeRow = {
  id: string;
  name: string;
  category: string | null;
  shelf_life: string | null;
  raw_materials_ocr: string | null;
};

const CACHE_MS = 5 * 60 * 1000;
let recipeCache: { fetchedAt: number; rows: RecipeRow[] } | null = null;

export async function matchLabelToRecipes(
  supabase: SupabaseClient,
  input: { productName?: string | null; rawMaterials?: string | null; manufacturer?: string | null },
): Promise<{ matches: RecipeCandidate[]; mode: "fast" | "ai" | "fallback" }> {
  const recipes = await getRecipes(supabase);
  const fastMatches = buildFastMatches(input.productName, input.rawMaterials, recipes);
  if (isConfidentFastMatch(fastMatches)) {
    return { matches: fastMatches.slice(0, 5), mode: "fast" };
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || recipes.length === 0) {
    return { matches: fastMatches.slice(0, 5), mode: "fallback" };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
        maxOutputTokens: 1400,
      },
    });
    const recipeFacts = recipes.map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      category: recipe.category,
      shelf_life: recipe.shelf_life,
      raw_materials: recipe.raw_materials_ocr?.slice(0, 240) || null,
    }));
    const prompt = `食品の裏ラベル情報をTSAのレシピ候補と照合してください。
品名を最優先し、原材料と製造者は補助情報として扱います。名称の全半角、ひらがな・カタカナ、容量表記の違いを吸収してください。

裏ラベル:
${JSON.stringify({
  product_name: input.productName || null,
  raw_materials: input.rawMaterials || null,
  manufacturer: input.manufacturer || null,
})}

候補レシピ:
${JSON.stringify(recipeFacts)}

次のJSON配列だけを返してください。最大5件、一致しない場合は空配列です。
[{"recipe_id":"UUID","confidence":0.95,"reason":"品名が一致"}]`;
    const result = await model.generateContent(prompt);
    const parsed = parseJsonArray(result.response.text());
    const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
    const matches = parsed
      .map((entry) => {
        const recipeId = String(entry.recipe_id || "");
        const recipe = byId.get(recipeId);
        if (!recipe) return null;
        const confidence = clampConfidence(entry.confidence);
        return {
          recipe_id: recipe.id,
          recipe_name: recipe.name,
          category: recipe.category,
          shelf_life: recipe.shelf_life,
          confidence,
          reason: String(entry.reason || "AI照合").slice(0, 160),
        } satisfies RecipeCandidate;
      })
      .filter((entry): entry is RecipeCandidate => entry !== null && entry.confidence >= 0.45)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);
    return { matches: matches.length > 0 ? matches : fastMatches.slice(0, 5), mode: "ai" };
  } catch {
    return { matches: fastMatches.slice(0, 5), mode: "fallback" };
  }
}

async function getRecipes(supabase: SupabaseClient): Promise<RecipeRow[]> {
  if (recipeCache && Date.now() - recipeCache.fetchedAt < CACHE_MS) return recipeCache.rows;
  const { data, error } = await supabase
    .from("recipes")
    .select("id, name, category, shelf_life, raw_materials_ocr")
    .in("category", ["ネット専用", "自社", "OEM"])
    .order("name");
  if (error) throw new Error("レシピ一覧を取得できません");
  const rows = (data || []) as RecipeRow[];
  recipeCache = { fetchedAt: Date.now(), rows };
  return rows;
}

function buildFastMatches(
  productName: string | null | undefined,
  rawMaterials: string | null | undefined,
  recipes: RecipeRow[],
): RecipeCandidate[] {
  return recipes
    .map((recipe) => {
      const nameScore = scoreName(productName || "", recipe.name);
      const materialScore = rawMaterials && recipe.raw_materials_ocr
        ? tokenSimilarity(rawMaterials, recipe.raw_materials_ocr) * 0.75
        : 0;
      const confidence = Math.min(0.99, Math.max(nameScore, materialScore));
      return {
        recipe_id: recipe.id,
        recipe_name: recipe.name,
        category: recipe.category,
        shelf_life: recipe.shelf_life,
        confidence: Math.round(confidence * 1000) / 1000,
        reason: nameScore >= materialScore ? "商品名の高速照合" : "原材料の高速照合",
      } satisfies RecipeCandidate;
    })
    .filter((match) => match.confidence >= 0.38)
    .sort((a, b) => b.confidence - a.confidence);
}

function isConfidentFastMatch(matches: RecipeCandidate[]) {
  const first = matches[0]?.confidence || 0;
  const second = matches[1]?.confidence || 0;
  return first >= 0.94 && first - second >= 0.08;
}

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\s\u3000()（）「」【】\[\]・,，._\-ー]/g, "");
}

function scoreName(left: string, right: string) {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 0.99;
  if (a.includes(b) || b.includes(a)) {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    return Math.min(0.96, 0.72 + ratio * 0.24);
  }
  return bigramSimilarity(a, b) * 0.86;
}

function bigramSimilarity(left: string, right: string) {
  const grams = (value: string) => {
    const result: string[] = [];
    for (let index = 0; index < value.length - 1; index += 1) result.push(value.slice(index, index + 2));
    return result;
  };
  const a = grams(left);
  const b = grams(right);
  if (a.length === 0 || b.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const gram of b) counts.set(gram, (counts.get(gram) || 0) + 1);
  let overlap = 0;
  for (const gram of a) {
    const count = counts.get(gram) || 0;
    if (count > 0) {
      overlap += 1;
      counts.set(gram, count - 1);
    }
  }
  return (2 * overlap) / (a.length + b.length);
}

function tokenSimilarity(left: string, right: string) {
  const tokenize = (value: string) => new Set(
    value
      .normalize("NFKC")
      .split(/[、,，\s/／]+/)
      .map(normalize)
      .filter((token) => token.length >= 2),
  );
  const a = tokenize(left);
  const b = tokenize(right);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / Math.max(a.size, b.size);
}

function parseJsonArray(text: string): Array<Record<string, unknown>> {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned) as unknown;
  return Array.isArray(parsed)
    ? parsed.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    : [];
}

function clampConfidence(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}
