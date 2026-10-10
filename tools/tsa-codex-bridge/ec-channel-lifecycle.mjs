// Past-period displays/imports do not authorize fresh acquisition from retired shops.
export const EC_RETIREMENT_MONTH = "2026-10";
const RETIRED_CHANNELS = new Set(["mercari", "qoo10", "tiktok"]);
const PERIOD_TASKS = new Set(["web_sales_import", "ec_profit_import", "ad_cost_import"]);
const CURRENT_SITE_TASKS = new Set([
  "ec_price_update", "ec_product_register", "ec_product_name_update",
  "ec_catchcopy_update", "ec_product_content_update", "recipe_reviews_collect",
]);
const LABELS = { mercari: "メルカリShops", qoo10: "Qoo10", tiktok: "TikTok Shop", makeshop: "makeshop" };

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function historicalPeriod(job) {
  return validDate(job.period_start) && validDate(job.period_end)
    && job.period_start <= job.period_end && job.period_end < `${EC_RETIREMENT_MONTH}-01`;
}

export function isRetiredEcArchiveJob(job) {
  return ["web_sales_import", "ec_profit_import"].includes(job?.task_key)
    && RETIRED_CHANNELS.has(job?.channel) && historicalPeriod(job);
}

export function ecJobLifecycleStop(job, packet = null) {
  if (!job || (!PERIOD_TASKS.has(job.task_key) && !CURRENT_SITE_TASKS.has(job.task_key))) return null;
  const parameters = job.parameters && typeof job.parameters === "object" ? job.parameters : {};
  const channels = [job.channel, parameters.target,
    ...(Array.isArray(parameters.targets) ? parameters.targets : []),
    ...(Array.isArray(parameters.sources) ? parameters.sources.map((source) => source?.channel) : []),
    ...(Array.isArray(packet?.sources) ? packet.sources.map((source) => source?.channel) : []),
  ].filter((channel) => typeof channel === "string").map((channel) => channel.trim().toLowerCase());
  const blocked = [...new Set(channels.filter((channel) => channel === "makeshop" || RETIRED_CHANNELS.has(channel)))];
  if (!blocked.length) return null;
  const retired = blocked.filter((channel) => RETIRED_CHANNELS.has(channel));
  const messages = [];
  if (retired.length) messages.push(`${retired.map((channel) => LABELS[channel]).join("・")}は2026年9月末に退店済みです。新たな取得・登録・更新は対象月によらず実行しません。9月までの保存済みデータと検証済み保存資料の再取込は維持します`);
  if (blocked.includes("makeshop")) messages.push("makeshopは開店準備中のため、取得・登録・更新はまだ実行しません");
  return { channels: blocked, message: messages.join("。") };
}
