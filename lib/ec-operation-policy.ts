import { isEcChannelOperational } from "./ec-channel-lifecycle";

const FINANCE_TASKS = new Set(["web_sales_import", "ad_cost_import", "ec_profit_import"]);
const PRODUCT_TASKS = new Set(["ec_price_update", "ec_product_name_update", "ec_product_content_update", "ec_catchcopy_update"]);

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Current external operations are separate from the channels shown in old reports. */
export function inactiveEcOperationTargets(targets: readonly string[]): string[] {
  return [...new Set(targets.filter(target => !isEcChannelOperational(target)))];
}

export function ecOperationBlockedMessage(targets: readonly string[]): string {
  const labels: Record<string, string> = { mercari: "メルカリShops", qoo10: "Qoo10", tiktok: "TikTok Shop", makeshop: "makeshop" };
  return `${targets.map(target => labels[target] || target).join("・")}は退店済みまたは開店準備中のため、新規取得・反映は実行できません。過去の保存データは保持されています。`;
}

/** Defense for durable jobs created before the store lifecycle changed. Never rewrite locked targets. */
export function inactiveEcJobTargets(job: Record<string, unknown>): string[] {
  const task = String(job.task_key || "");
  const parameters = object(job.parameters);
  if (FINANCE_TASKS.has(task)) return inactiveEcOperationTargets([String(job.channel || "")]);
  if (PRODUCT_TASKS.has(task)) {
    return inactiveEcOperationTargets(Array.isArray(parameters.targets) ? parameters.targets.map(String) : []);
  }
  if (task === "ec_product_register") return inactiveEcOperationTargets([String(parameters.target || job.channel || "qoo10")]);
  if (task === "recipe_reviews_collect") {
    return inactiveEcOperationTargets((Array.isArray(parameters.sources) ? parameters.sources : []).map(source => String(object(source).channel || "")));
  }
  return [];
}
