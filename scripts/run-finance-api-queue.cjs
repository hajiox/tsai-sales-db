const path = require("node:path");
const fs = require("node:fs");
const { createClient } = require("@supabase/supabase-js");
const { registerFinanceTsLoader } = require("./finance-api-ts-loader.cjs");
const { createFinanceApiMonitor } = require("./finance-api-monitor.cjs");

function parseOptions(args) {
  const options = { poll: false, maxRuns: 10, intervalMs: 30000, help: false };
  for (const argument of args) {
    if (argument === "--once") options.poll = false;
    else if (argument === "--poll") options.poll = true;
    else if (argument === "--help") options.help = true;
    else if (/^--max-runs=\d+$/.test(argument)) options.maxRuns = Number(argument.split("=")[1]);
    else if (/^--interval-ms=\d+$/.test(argument)) options.intervalMs = Number(argument.split("=")[1]);
    else throw new Error("Unknown finance API worker option.");
  }
  if (options.maxRuns < 1 || options.maxRuns > 100 || options.intervalMs < 10000 || options.intervalMs > 300000) throw new Error("Worker options exceed the supported limits.");
  return options;
}

async function drainQueue(supabase, executeAcquisitionRun, maxRuns, emit = () => {}, lifecycle = {}) {
  let processed = 0;
  while (processed < maxRuns) {
    if (lifecycle.shouldStop?.()) break;
    const { data, error } = await supabase.from("web_sales_acquisition_runs")
      .select("id,kind,channel,report_month").eq("status", "queued").eq("route", "api")
      .order("started_at", { ascending: true }).limit(1).maybeSingle();
    if (error) throw new Error("API acquisition queue cannot be read.");
    if (!data) break;
    // executeAcquisitionRun owns the atomic queued -> running claim and all
    // provenance writes. A second worker never repeats a claimed acquisition.
    await lifecycle.onTransition?.("running", String(data.id), data);
    let result;
    try { result = await executeAcquisitionRun(String(data.id)); }
    finally { await lifecycle.onTransition?.("idle", null); }
    processed++;
    emit({ runId: String(data.id), status: typeof result?.status === "string" ? result.status : "processed" });
    lifecycle.onResult?.(String(data.id), typeof result?.status === "string" ? result.status : "processed");
  }
  return processed;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("node scripts/run-finance-api-queue.cjs --once [--max-runs=10]\nOptional: --poll --interval-ms=30000 (no service or startup registration).\n");
    return;
  }
  const projectRoot = path.resolve(__dirname, "..");
  const envPath = path.join(projectRoot, ".env.local");
  if (fs.existsSync(envPath)) {
    const values = require("dotenv").parse(fs.readFileSync(envPath, "utf8"));
    for (const [key, value] of Object.entries(values)) if (!process.env[key]) process.env[key] = value;
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Finance API worker connection configuration is missing.");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const unregister = registerFinanceTsLoader(projectRoot);
  let stopping = false;
  let presenceFailed = false;
  const monitor = createFinanceApiMonitor();
  let presence = { status: "idle", current_run_id: null };
  let heartbeatPromise;
  let heartbeatTimer;
  let wake;
  const stop = () => { stopping = true; if (wake) wake(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  async function publishPresence() {
    const { error } = await supabase.from("web_sales_api_runtime").upsert({ id: "office-pc", ...presence, last_seen_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) throw new Error("Finance API worker presence cannot be saved.");
    monitor.publish();
  }
  async function transition(status, currentRunId, context) {
    if (presenceFailed) throw new Error("Finance API worker presence is unavailable.");
    if (heartbeatPromise) await heartbeatPromise;
    presence = { status, current_run_id: currentRunId };
    monitor.transition(status, currentRunId, context);
    await publishPresence();
  }
  try {
    await publishPresence();
    heartbeatTimer = setInterval(() => {
      if (heartbeatPromise || stopping || presenceFailed) return;
      heartbeatPromise = publishPresence().catch(() => { presenceFailed = true; stop(); }).finally(() => { heartbeatPromise = undefined; });
    }, 30000);
    process.env.FINANCE_API_LOCAL_WORKER = "1";
    const { executeAcquisitionRun } = require("../lib/finance-acquisition/dispatch.ts");
    if (typeof executeAcquisitionRun !== "function") throw new Error("Finance acquisition dispatcher is unavailable.");
    do {
      const processed = await drainQueue(supabase, executeAcquisitionRun, options.maxRuns, (entry) => process.stdout.write(`${JSON.stringify(entry)}\n`),
        { shouldStop: () => stopping || presenceFailed, onTransition: transition, onResult: (id, status) => monitor.terminal(id, status) });
      if (presenceFailed) throw new Error("Finance API worker presence is unavailable.");
      await transition("idle", null);
      process.stdout.write(`${JSON.stringify({ status: "queue_pass_complete", processed })}\n`);
      if (!options.poll || stopping) break;
      await new Promise((resolve) => {
        const timer = setTimeout(() => { wake = undefined; resolve(); }, options.intervalMs);
        wake = () => { clearTimeout(timer); wake = undefined; resolve(); };
      });
    } while (!stopping);
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (heartbeatPromise) await heartbeatPromise;
    presence = { status: "stopped", current_run_id: null };
    monitor.transition("stopped", null);
    try { await publishPresence(); } catch { /* Stop without printing a remote error. */ }
    unregister();
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

if (require.main === module) main().catch(() => {
  // Never print errors from module loading, remote bodies or connection URLs.
  process.stderr.write("Finance API worker failed. Inspect the sanitized acquisition run status and local configuration.\n");
  process.exitCode = 1;
});
module.exports = { parseOptions, drainQueue };
