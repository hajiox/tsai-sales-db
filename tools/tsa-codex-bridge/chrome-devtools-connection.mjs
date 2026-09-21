import { realpathSync, existsSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const CHROME_CONNECTION_WAIT = "ChromeデバッグMCPへの接続を確認できません。実際のログイン・許可待ちがなければ、PC操作の利用可否を確認してください。未確認の操作を繰り返さないでください。";

// Only the long-lived Bridge may start this daemon. Starting it from the
// ephemeral Codex/MCP process attaches its lifetime to that process on Windows.
export async function prepareChromeConnection({ packageRoot, workspace, client, utils }) {
  const load = (file) => import(pathToFileURL(join(packageRoot, "build/src/daemon", file)).href);
  client ??= await load("client.js");
  utils ??= await load("utils.js");
  const started = !utils.isDaemonRunning();
  if (started) {
    const previousOptions = process.env.NODE_OPTIONS;
    const previousRoot = process.env.TSA_STORY_DRAG_PACKAGE_ROOT;
    try {
      process.env.NODE_OPTIONS = `${previousOptions || ""} --import=${new URL("./chrome-devtools-story-drag.mjs", import.meta.url).href}`.trim();
      process.env.TSA_STORY_DRAG_PACKAGE_ROOT = packageRoot;
      await client.startDaemon([
      "--viaCli", "--autoConnect", "--no-usage-statistics", "--no-performance-crux",
      "--no-category-emulation", "--no-category-performance", "--no-category-network",
      `--workspace=${realpathSync.native(workspace)}`,
      ]);
    } finally {
      if (previousOptions === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = previousOptions;
      if (previousRoot === undefined) delete process.env.TSA_STORY_DRAG_PACKAGE_ROOT; else process.env.TSA_STORY_DRAG_PACKAGE_ROOT = previousRoot;
    }
  }
  const status = await client.sendCommand({ method: "status" }, undefined, 5_000);
  if (!status?.success) throw new Error(CHROME_CONNECTION_WAIT);
  const identity = JSON.parse(status.result);
  // Exactly one read-only connection probe. Never retry a pending permission
  // prompt or restart a live daemon after a timeout (it may still be working).
  const response = await client.sendCommand({ method: "invoke_tool", tool: "list_pages", args: {} }, undefined, 65_000);
  if (!response?.success) throw new Error(CHROME_CONNECTION_WAIT);
  const result = JSON.parse(response.result);
  if (result.isError || !Array.isArray(result.content)) throw new Error(CHROME_CONNECTION_WAIT);
  // Page titles/URLs can contain private data. Keep only connection metadata.
  return { ready: true, started, pid: identity.pid, startedAt: identity.startDate, version: identity.version };
}


export const BROWSER_ROUTE_POLICY = `BROWSER ROUTE POLICY (2026-09-21):
For browser steps only, use normal signed-in Chrome integration first, Chrome DevTools MCP second, native PC/computer control last. APIs and verified saved artifacts remain preferred for suitable non-UI work. This ordering supersedes older Skill/reference/prompt instructions that require one tool exclusively or stop on a generic connection/navigation/upload error; account, content, authorization and final verification rules remain unchanged.
A first-route failure is NOT a terminal result. State the observed limitation, then use the next available route for the SAME unfinished step. Tools absent from this run count as unavailable without repeated probes. At most one evidence-based corrective retry per identical failure; no reconnect loops, Chrome restarts, profile changes, or debug-port changes. Native desktop actions are not Chrome integration. Use native tools only after both browser routes fail/are unsupported/unavailable, except an OS-owned dialog that the browser tools cannot control; then return to the pending browser stage.
Chrome DevTools is connected lazily on first use by the long-lived Bridge; do not start your own daemon or debugger. Before switching after a possibly successful submission, inspect whether it succeeded. Preserve the existing draft, exact account/content/target and completed targets; never replay a whole job or submit again merely because a connection failed.
Observed login/MFA/CAPTCHA/account ambiguity/security or permission denial is a genuine operator wait, never a fallback workaround. A generic missing tool/transport timeout is not evidence of those conditions. If all three routes are unavailable, identify the exact remaining step and each route limitation. Never stop at the first missing route or claim unperformed work completed.`;

// The persistent Bridge owns the daemon; ephemeral MCP processes only request it.
export function startBrowserConnectionSupervisor({ workspace, prepare, intervalMs = 250 }) {
  const request = join(workspace, ".bridge-chrome-request.json");
  const response = join(workspace, ".bridge-chrome-response.json");
  rmSync(request, { force: true }); rmSync(response, { force: true });
  let busy = false, stopped = false;
  const tick = async () => {
    if (stopped || busy || !existsSync(request)) return;
    busy = true;
    try {
      const value = JSON.parse(readFileSync(request, "utf8"));
      if (value.kind !== "devtools_fallback" || !/^[a-f0-9-]{36}$/.test(value.id)) return;
      let result;
      try { await prepare(); result = { id: value.id, ready: true }; }
      catch { result = { id: value.id, ready: false, message: CHROME_CONNECTION_WAIT }; }
      if (!stopped) { writeFileSync(response + ".tmp", JSON.stringify(result), "utf8"); renameSync(response + ".tmp", response); }
    } catch { /* Invalid local control data cannot launch a connection. */ }
    finally { rmSync(request, { force: true }); }
    // Exactly one connection preparation per Codex run, including failure.
  };
  const timer = setInterval(() => { void tick(); }, intervalMs); timer.unref();
  return () => { stopped = true; clearInterval(timer); rmSync(request, { force: true }); rmSync(response, { force: true }); };
}
