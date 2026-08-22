import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EcPriceTarget } from "@/lib/ec-price-codex";

export type EcPriceProductMappings = Record<EcPriceTarget, string[]>;

const MAPPING_CONFIG: Record<EcPriceTarget, { table: string; titleColumn: string }> = {
  amazon: { table: "amazon_product_mapping", titleColumn: "amazon_title" },
  rakuten: { table: "rakuten_product_mapping", titleColumn: "rakuten_title" },
  yahoo: { table: "yahoo_product_mapping", titleColumn: "yahoo_title" },
  mercari: { table: "mercari_product_mapping", titleColumn: "mercari_title" },
  base: { table: "base_product_mapping", titleColumn: "base_title" },
  qoo10: { table: "qoo10_product_mapping", titleColumn: "qoo10_title" },
  tiktok: { table: "tiktok_product_mapping", titleColumn: "tiktok_product_name" },
};

function normalizeTitle(value: unknown) {
  return String(value || "")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function uniqueTitles(values: unknown[]) {
  return [...new Set(values.map(normalizeTitle).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, "ja"));
}

export function normalizeEcPriceProductMappings(
  input: unknown,
  targets: EcPriceTarget[],
): EcPriceProductMappings {
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  return Object.fromEntries(MAPPING_CONFIG_KEYS.map((target) => [
    target,
    targets.includes(target) && Array.isArray(source[target])
      ? uniqueTitles(source[target] as unknown[])
      : [],
  ])) as EcPriceProductMappings;
}

export function ecPriceProductMappingsMatch(left: unknown, right: EcPriceProductMappings) {
  const normalized = normalizeEcPriceProductMappings(left, MAPPING_CONFIG_KEYS);
  return MAPPING_CONFIG_KEYS.every((target) =>
    normalized[target].length === right[target].length
    && normalized[target].every((title, index) => title === right[target][index]));
}

const MAPPING_CONFIG_KEYS = Object.keys(MAPPING_CONFIG) as EcPriceTarget[];

export async function loadEcPriceProductMappings(
  supabase: SupabaseClient,
  linkedProductId: string | null,
  targets: EcPriceTarget[],
) {
  const result = normalizeEcPriceProductMappings({}, targets);
  if (!linkedProductId) return result;

  await Promise.all(targets.map(async (target) => {
    const config = MAPPING_CONFIG[target];
    const { data, error } = await supabase
      .from(config.table)
      .select(config.titleColumn)
      .eq("product_id", linkedProductId);
    if (error) throw new Error(`${target}の商品紐付けを取得できません: ${error.message}`);
    const titles = (data || []).map((row) => (row as Record<string, unknown>)[config.titleColumn]);

    if (target === "base") {
      result.base = uniqueTitles(titles.filter((title) => !normalizeTitle(title).includes("【TikTok連携】")));
      return;
    }
    if (target === "tiktok") {
      const { data: baseData, error: baseError } = await supabase
        .from(MAPPING_CONFIG.base.table)
        .select(MAPPING_CONFIG.base.titleColumn)
        .eq("product_id", linkedProductId);
      if (baseError) throw new Error(`TikTok連携商品の紐付けを取得できません: ${baseError.message}`);
      const baseTitles = (baseData || [])
        .map((row) => (row as Record<string, unknown>)[MAPPING_CONFIG.base.titleColumn])
        .filter((title) => normalizeTitle(title).includes("【TikTok連携】"));
      result.tiktok = uniqueTitles([...titles, ...baseTitles]);
      return;
    }
    result[target] = uniqueTitles(titles);
  }));

  return result;
}
