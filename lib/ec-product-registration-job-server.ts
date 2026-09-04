import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildEcPriceRecipeSnapshot, type EcPriceRecipeSnapshot } from "@/lib/ec-price-job-server";
import {
  EC_PRODUCT_REGISTER_TARGET,
  QOO10_PRODUCT_NAME_MAX_LENGTH,
  getEcProductRegisterReference,
  normalizeEcProductRegisterJan,
  normalizeEcProductRegisterTitle,
  type EcProductRegisterImage,
  type EcProductRegisterReference,
} from "@/lib/ec-product-registration-codex";
import { getRecipeEcImagePlanForSite } from "@/lib/recipe-ec-images";

export type EcProductRegisterRecipeSnapshot = EcPriceRecipeSnapshot & {
  productPoints: string;
  webDescription: string;
  catchcopy: string;
};

export type EcProductRegisterPayload = {
  recipeSnapshot: EcProductRegisterRecipeSnapshot;
  expectedAccount: string;
  productName: string;
  janCode: string;
  sellerCode: string;
  targetPrice: number;
  description: string;
  images: EcProductRegisterImage[];
  reference: EcProductRegisterReference;
};

export const EC_PRODUCT_REGISTER_EXPECTED_ACCOUNT = "会津ブランド館";

function normalizedText(value: unknown, maximum: number) {
  return String(value || "").replace(/\r\n?/g, "\n").trim().slice(0, maximum);
}

function buildDescription(snapshot: EcProductRegisterRecipeSnapshot) {
  return [snapshot.catchcopy, snapshot.productPoints, snapshot.webDescription]
    .map((value) => normalizedText(value, 20000))
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 30000);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildEcProductRegisterPayloadHash(payload: EcProductRegisterPayload) {
  return createHash("sha256").update(stableJson(payload), "utf8").digest("hex");
}

export function buildEcProductRegisterRecipeSnapshot(row: Record<string, unknown>): EcProductRegisterRecipeSnapshot {
  return {
    ...buildEcPriceRecipeSnapshot(row),
    productPoints: normalizedText(row.product_points ?? row.productPoints, 5000),
    webDescription: normalizedText(row.web_description ?? row.webDescription, 20000),
    catchcopy: normalizedText(row.catchcopy, 500),
  };
}

export function ecProductRegisterSnapshotsMatch(left: unknown, right: EcProductRegisterRecipeSnapshot) {
  if (!left || typeof left !== "object" || Array.isArray(left)) return false;
  const candidate = left as Record<string, unknown>;
  return (Object.keys(right) as Array<keyof EcProductRegisterRecipeSnapshot>)
    .every((key) => candidate[key] === right[key]);
}

export async function loadEcProductRegisterImages(supabase: SupabaseClient, recipeId: string) {
  const { data, error } = await supabase
    .from("recipe_web_images")
    .select("image_url,image_role,sort_order")
    .eq("recipe_id", recipeId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(`Web商品画像を取得できません: ${error.message}`);

  const rows = (data || []) as { image_url: string; image_role: string; sort_order: number }[];
  const galleries = rows.filter((row) => row.image_role === "gallery");
  const nonAmazon = rows.filter((row) => row.image_role === "non_amazon");
  const baseOnly = rows.filter((row) => row.image_role === "base_only");
  const plan = getRecipeEcImagePlanForSite(EC_PRODUCT_REGISTER_TARGET, {
    gallery: galleries.length,
    nonAmazon: nonAmazon.length,
    baseOnly: baseOnly.length,
  });
  const byRole = { gallery: galleries, non_amazon: nonAmazon, base_only: baseOnly } as const;
  return plan.map((entry, index) => ({
    url: String(byRole[entry.imageRole][entry.imageIndex]?.image_url || ""),
    role: index === 0 ? "main" as const : "detail" as const,
    order: entry.listingOrder,
  })).filter((entry) => /^https:\/\//i.test(entry.url));
}

export async function buildEcProductRegisterPayload(
  supabase: SupabaseClient,
  recipe: Record<string, unknown>,
): Promise<EcProductRegisterPayload> {
  const recipeSnapshot = buildEcProductRegisterRecipeSnapshot(recipe);
  const productName = normalizeEcProductRegisterTitle(recipeSnapshot.ecProductName || recipeSnapshot.recipeName);
  const janCode = normalizeEcProductRegisterJan(recipeSnapshot.janCode);
  const reference = getEcProductRegisterReference(janCode);
  const images = await loadEcProductRegisterImages(supabase, recipeSnapshot.recipeId);
  const description = buildDescription(recipeSnapshot);
  if (!productName) throw new Error("EC用商品名が登録されていません");
  if (productName.length > QOO10_PRODUCT_NAME_MAX_LENGTH) {
    throw new Error(`EC用商品名がQoo10の${QOO10_PRODUCT_NAME_MAX_LENGTH}文字上限を超えています`);
  }
  if (!janCode) throw new Error("13桁のJANコードが登録されていません");
  if (!reference) throw new Error("安全に流用できるQoo10参照商品が登録されていません");
  if (!description) throw new Error("Qoo10へ登録する商品説明がありません");
  if (!Number.isInteger(recipeSnapshot.newPriceInclTax) || recipeSnapshot.newPriceInclTax <= 0) {
    throw new Error("保存済み税込販売価格が正しくありません");
  }
  if (images.length < 1 || images[0].role !== "main") {
    throw new Error("Qoo10用のWeb商品画像が登録されていません");
  }
  return {
    recipeSnapshot,
    expectedAccount: EC_PRODUCT_REGISTER_EXPECTED_ACCOUNT,
    productName,
    janCode,
    sellerCode: janCode,
    targetPrice: recipeSnapshot.newPriceInclTax,
    description,
    images,
    reference,
  };
}

export function ecProductRegisterPayloadMatches(left: unknown, right: EcProductRegisterPayload) {
  return ecProductRegisterPayloadMismatchKeys(left, right).length === 0;
}

export function ecProductRegisterPayloadMismatchKeys(left: unknown, right: EcProductRegisterPayload) {
  if (!left || typeof left !== "object" || Array.isArray(left)) return ["payload"];
  const candidate = left as Record<string, unknown>;
  const mismatches: string[] = [];
  if (!ecProductRegisterSnapshotsMatch(candidate.recipeSnapshot, right.recipeSnapshot)) mismatches.push("recipeSnapshot");
  if (String(candidate.expectedAccount || "") !== right.expectedAccount) mismatches.push("expectedAccount");
  if (normalizeEcProductRegisterTitle(candidate.productName) !== right.productName) mismatches.push("productName");
  if (normalizeEcProductRegisterJan(candidate.janCode) !== right.janCode) mismatches.push("janCode");
  if (String(candidate.sellerCode || "") !== right.sellerCode) mismatches.push("sellerCode");
  if (Number(candidate.targetPrice) !== right.targetPrice) mismatches.push("targetPrice");
  if (String(candidate.description || "") !== right.description) mismatches.push("description");
  if (stableJson(candidate.images) !== stableJson(right.images)) mismatches.push("images");
  if (stableJson(candidate.reference) !== stableJson(right.reference)) mismatches.push("reference");
  return mismatches;
}
