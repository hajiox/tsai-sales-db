import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync, realpathSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { installStoryDrag } from "./chrome-devtools-story-drag.mjs";

const options = Object.fromEntries(process.argv.slice(2).map((entry) => {
  const match = String(entry).match(/^--([^=]+)=(.*)$/s);
  return match ? [match[1], match[2]] : [String(entry).replace(/^--/, ""), "true"];
}));

const packageRoot = resolve(String(options.packageRoot || ""));
const workspace = resolve(String(options.workspace || ""));
const daemonWorkspace = resolve(String(options.daemonWorkspace || ""));
const sessionId = options.sessionId == null ? undefined : String(options.sessionId).trim();

if (!existsSync(packageRoot)) throw new Error("Chrome DevTools MCP package root is missing");
if (!existsSync(workspace)) throw new Error("SNS job workspace is missing");
if (!existsSync(daemonWorkspace)) throw new Error("Chrome DevTools daemon workspace is missing");
if (sessionId != null && !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(sessionId)) {
  throw new Error("Invalid Chrome DevTools daemon session id");
}

const moduleUrl = (relativePath) => pathToFileURL(join(packageRoot, relativePath)).href;
const [thirdParty, toolModule, definitionModule, daemonClient, daemonUtils] = await Promise.all([
  import(moduleUrl("build/src/third_party/index.js")),
  import(moduleUrl("build/src/tools/tools.js")),
  import(moduleUrl("build/src/tools/ToolDefinition.js")),
  import(moduleUrl("build/src/daemon/client.js")),
  import(moduleUrl("build/src/daemon/utils.js")),
]);

const { McpServer, StdioServerTransport, zod } = thirdParty;
const { createTools } = toolModule;
const { pageIdSchema } = definitionModule;
const { sendCommand } = daemonClient;
const { isDaemonRunning } = daemonUtils;

const allowedToolNames = new Set([
  "list_pages",
  "new_page",
  "close_page",
  "select_page",
  "navigate_page",
  "take_snapshot",
  "take_screenshot",
  "click",
  "drag",
  "hover",
  "fill",
  "fill_form",
  "type_text",
  "press_key",
  "upload_file",
  "wait_for",
  "handle_dialog",
  "evaluate_script",
]);

const canonicalWorkspace = realpathSync.native(workspace);

function ensureInsideWorkspace(candidate, fieldName) {
  if (typeof candidate !== "string" || !candidate.trim()) {
    throw new Error(`${fieldName} must be a non-empty local path`);
  }
  const absolute = isAbsolute(candidate) ? resolve(candidate) : resolve(workspace, candidate);
  const canonical = existsSync(absolute)
    ? realpathSync.native(absolute)
    : join(realpathSync.native(dirname(absolute)), absolute.split(/[\\/]/).at(-1));
  const rel = relative(canonicalWorkspace, canonical);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`${fieldName} is outside the SNS job workspace`);
  }
  return canonical;
}

function validateFileScope(toolName, params) {
  const checked = { ...(params || {}) };
  if (Array.isArray(checked.filePaths)) {
    checked.filePaths = checked.filePaths.map((value, index) => ensureInsideWorkspace(value, `filePaths[${index}]`));
  }
  if (typeof checked.filePath === "string") {
    checked.filePath = ensureInsideWorkspace(checked.filePath, "filePath");
  }
  if (toolName === "upload_file") {
    if (!Array.isArray(checked.filePaths) || checked.filePaths.length !== 1 || !existsSync(checked.filePaths[0])) {
      throw new Error("upload_file requires exactly one existing file inside the SNS job workspace");
    }
  }
  return checked;
}

let connectionAttempt = null;
async function ensureDaemon() {
  if (!connectionAttempt) connectionAttempt = (async () => {
    const requestDir = options.connectionRequestDir;
    if (!requestDir) {
      if (!isDaemonRunning(sessionId)) throw new Error("Chrome DevTools connection unavailable; continue to native PC only if no real permission gate is pending.");
      return;
    }
    if (realpathSync.native(requestDir) !== canonicalWorkspace) throw new Error("Invalid Bridge connection request workspace");
    const id = randomUUID();
    const request = join(requestDir, ".bridge-chrome-request.json");
    const response = join(requestDir, ".bridge-chrome-response.json");
    writeFileSync(request + ".tmp", JSON.stringify({ id, kind: "devtools_fallback" }), "utf8"); renameSync(request + ".tmp", request);
    const deadline = Date.now() + 80000;
    while (Date.now() < deadline) {
      if (existsSync(response)) {
        const value = JSON.parse(readFileSync(response, "utf8"));
        if (value.id === id) {
          if (!value.ready) throw new Error(value.message);
          return;
        }
      }
      await sleep(250);
    }
    throw new Error("Bridge connection preparation timed out; do not reconnect. Check whether a real permission gate is pending; otherwise continue to native PC.");
  })();
  return connectionAttempt;
}

async function forwardTool(toolName, params) {
  try {
    const checkedParams = validateFileScope(toolName, params);
    await ensureDaemon();
    const response = await sendCommand({
      method: "invoke_tool",
      tool: toolName,
      args: checkedParams,
    }, sessionId, 120_000);
    if (!response?.success) {
      return {
        isError: true,
        content: [{ type: "text", text: String(response?.error || "Chrome DevTools daemon call failed") }],
      };
    }
    const result = JSON.parse(String(response.result || "{}"));
    if (!Array.isArray(result?.content)) throw new Error("Chrome DevTools daemon returned an invalid MCP result");
    return result;
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
    };
  }
}

const server = new McpServer({ name: "tsa-chrome-devtools-daemon-relay", version: "1.0.0" });
const definitions = createTools({ pageIdRouting: true });
// Match the schema loaded by the long-lived daemon; execution still forwards
// through the existing scope checks and official MCP connection.
installStoryDrag(definitions.find(tool => tool.name === "drag"), zod);
for (const tool of definitions) {
  if (!allowedToolNames.has(tool.name)) continue;
  const schema = tool.pageScoped === true ? { ...pageIdSchema, ...tool.schema } : tool.schema;
  server.registerTool(tool.name, {
    description: tool.description,
    inputSchema: zod.object(schema).passthrough(),
    annotations: tool.annotations,
  }, async (params) => await forwardTool(tool.name, params));
}

await server.connect(new StdioServerTransport());
