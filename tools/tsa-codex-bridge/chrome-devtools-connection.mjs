import { realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const CHROME_CONNECTION_WAIT = "Chromeへの接続を確認できません。事務所PCのChromeでリモートデバッグの許可画面を確認してください。投稿操作は開始していません。許可後は未投稿の対象だけを再実行してください。";

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
