// One execution policy per task. Job inputs cannot escalate the model at runtime.
export const TASK_MODEL_POLICY_VERSION = "2026-09-23.1";
const routine = { model: "gpt-6-luna", reasoningEffort: "high", browser: true };
const generation = { model: "gpt-6-sol", reasoningEffort: "medium", browser: false };
const analysis = { model: "gpt-6-astra", reasoningEffort: "medium", browser: false };
export const TASK_MODEL_POLICIES = Object.freeze(Object.fromEntries([
  ...["web_sales_import", "ad_cost_import", "ec_profit_import", "carrier_monthly_import",
    "ec_price_update", "ec_product_register", "ec_product_name_update", "ec_catchcopy_update",
    "ec_product_content_update", "recipe_sns_publish", "recipe_reviews_collect"].map(key => [key, Object.freeze({ ...routine })]),
  ...["ec_product_name_generate", "ec_catchcopy_generate", "ec_product_content_generate",
    "ingredient_label_generate", "recipe_sns_generate", "docscanner_fax_summary"].map(key => [key, Object.freeze({ ...generation })]),
  ...["web_sales_analysis", "recipe_reviews_analyze"].map(key => [key, Object.freeze({ ...analysis })]),
]));

export function taskModelPolicy(taskKey) {
  const policy = TASK_MODEL_POLICIES[taskKey];
  if (!policy) throw new Error(`Unknown Bridge model policy: ${taskKey}`);
  return policy;
}

// Previously queued Astra jobs retain their immutable inputs and can complete
// under the new policy. All other unexpected model/effort pairs remain invalid.
export function acceptsTaskModelParameters(taskKey, parameters) {
  const policy = taskModelPolicy(taskKey);
  return (parameters.model === policy.model && parameters.reasoningEffort === policy.reasoningEffort)
    || (parameters.model === "gpt-6-astra" && parameters.reasoningEffort === "medium");
}

export function applyTaskModelPolicy(taskKey, args) {
  const policy = taskModelPolicy(taskKey);
  const result = [];
  for (let i = 0; i < args.length; i++) {
    const arg = String(args[i]);
    if (arg === "--model" || arg === "-m") { i++; continue; }
    if (arg.startsWith("--model=")) continue;
    if ((arg === "-c" || arg === "--config") && /^(model|model_reasoning_effort)\s*=/.test(String(args[i + 1]))) { i++; continue; }
    result.push(args[i]);
  }
  // Insert before stdin's '-' so the policy is always parsed as CLI flags.
  const at = result.at(-1) === "-" ? result.length - 1 : result.length;
  result.splice(at, 0, "--model", policy.model, "-c", `model_reasoning_effort=${JSON.stringify(policy.reasoningEffort)}`);
  return result;
}

export const BROWSER_COMPLETION_POLICY = [
  "Browser lifecycle: record the IDs of pre-existing tabs before starting browser work. Track the exact IDs of tabs you create for this job, including child tabs opened by your actions. Never infer ownership from a shared group name or from a before/after difference alone when other jobs are running.",
  "After finishing and verifying collection/download/registration/update/publication, close every task-created tab that is no longer needed using the documented browser close API. Do this before returning the final result JSON. Re-list tabs once to verify those IDs are gone. Release borrowed existing tabs using the documented API when available; do not close operator-owned or another job's tabs, quit Chrome, or terminate browser processes.",
  "On an observed login/MFA/CAPTCHA/permission wait, retain only the task tab needed for the operator to resolve that wait and identify it in the source's message. Close other finished task-created tabs. Never discard an unresolved submission or unsaved operator input. If closure is unavailable or denied, report the exact cleanup limitation in an existing result message field; preserve the business result and do not retry the business operation for cleanup.",
].join("\n");
