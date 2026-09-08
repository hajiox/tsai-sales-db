// Bridge-hosted MCP confirmation transport for SNS and local carrier jobs. Browser operations stay in the official CUA server.
// Elicitation is answered only by a person in the local Bridge dialog, never by the model.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function confirmationFields(schema) {
  if (!schema || schema.type !== "object" || !schema.properties || typeof schema.properties !== "object"
    || Array.isArray(schema.properties) || Object.keys(schema.properties).length > 12
    || (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some(name => typeof name !== "string" || !Object.hasOwn(schema.properties, name))))
    || ["allOf", "anyOf", "oneOf", "$ref"].some(key => key in schema)) return null;
  const required = new Set(schema.required || []);
  const fields = [];
  for (const [name, property] of Object.entries(schema.properties)) {
    // Do not invent values or offer a UI for unknown/complex form schemas.
    if (!property || !["boolean", "string"].includes(property.type) || ["allOf", "anyOf", "oneOf", "$ref", "const"].some(key => key in property)) return null;
    if (property.type === "string" && (!Array.isArray(property.enum) || property.enum.some(v => typeof v !== "string"))) return null;
    fields.push({ name, title: property.title || name, description: property.description || "", type: property.type, choices: property.enum || [], required: required.has(name) });
  }
  return fields;
}

export function validateConfirmationResponse(response, fields) {
  if (response?.action !== "accept") return { action: "cancel", content: null };
  if (!response.content || typeof response.content !== "object") return { action: "cancel", content: null };
  const content = {};
  for (const field of fields) {
    const value = response.content[field.name];
    if (value === undefined && !field.required) continue;
    if (field.type === "boolean" ? typeof value !== "boolean" : !field.choices.includes(value)) return { action: "cancel", content: null };
    content[field.name] = value;
  }
  return { action: "accept", content };
}

export async function requestBrowserConfirmation(params, showDialog, signal, timeoutMs = 5 * 60_000) {
  const cancelled = { action: "cancel", content: null };
  if (!["form", "openai/form"].includes(params?.mode || "form")) return cancelled;
  const fields = confirmationFields(params?.requestedSchema);
  if (!fields || signal?.aborted) return cancelled;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, {once:true});
  const timer = setTimeout(abort, timeoutMs);
  let resolveCancelled;
  const aborted = new Promise(resolve => {resolveCancelled = resolve;});
  const onAbort = () => resolveCancelled(cancelled);
  controller.signal.addEventListener("abort", onAbort, {once:true});
  try {
    const response = await Promise.race([
      Promise.resolve().then(() => showDialog({ message:String(params.message || ""), fields }, controller.signal)), aborted,
    ]);
    return controller.signal.aborted ? cancelled : validateConfirmationResponse(response, fields);
  } catch {return cancelled;}
  finally {
    clearTimeout(timer); signal?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", onAbort);
  }
}

export function startConfirmationRelay({ command, args, env, input = process.stdin, output = process.stdout, showDialog, state = () => {} }) {
  const server = spawn(command, args, { env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const send = value => { if (!server.stdin.destroyed) server.stdin.write(`${JSON.stringify(value)}\n`); };
  const clientLines = createInterface({ input });
  const serverLines = createInterface({ input: server.stdout });
  const activeToolCalls = new Set();
  let active = false;
  let activeRequest = null;
  let ended = false;
  clientLines.on("line", line => {
    try {
      const message = JSON.parse(line);
      if (message.method === "tools/call" && message.id !== undefined) activeToolCalls.add(message.id);
      if (message.method === "notifications/cancelled" && activeRequest && (
        message.params?.requestId === activeRequest.id || activeToolCalls.has(message.params?.requestId)
      )) activeRequest.controller.abort();
      if (message.method === "initialize") {
        message.params ||= {};
        message.params.capabilities ||= {};
        // This host actually provides the interactive form capability missing in codex exec.
        message.params.capabilities.elicitation = { form: {} };
      }
      send(message);
    } catch { server.kill(); }
  });
  serverLines.on("line", async line => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.id !== undefined && !message.method) activeToolCalls.delete(message.id);
    if (message.method === "notifications/cancelled" && message.params?.requestId === activeRequest?.id) activeRequest.controller.abort();
    if (message.method !== "elicitation/create" || message.id === undefined) {
      output.write(`${line}\n`);
      return;
    }
    if (active || ended) { send({ jsonrpc: "2.0", id: message.id, result: { action: "cancel", content: null } }); return; }
    active = true;
    activeRequest = { id: message.id, controller: new AbortController() };
    state("waiting");
    let result = { action: "cancel", content: null };
    try { result = await requestBrowserConfirmation(message.params, showDialog, activeRequest.controller.signal); } catch { /* fail closed */ }
    if (activeRequest.controller.signal.aborted) result = { action: "cancel", content: null };
    if (!ended) send({ jsonrpc: "2.0", id: message.id, result });
    state(result.action === "accept" ? "accepted" : "cancelled");
    active = false;
    activeRequest = null;
  });
  server.stderr.on("data", () => {}); // Never put form content or browser data in logs.
  server.stdin.on("error", () => { activeRequest?.controller.abort(); });
  clientLines.on("close", () => { ended = true; activeRequest?.controller.abort(); server.stdin.end(); server.kill(); });
  server.on("close", code => { ended = true; activeRequest?.controller.abort(); clientLines.close(); state("closed"); process.exitCode = code || 0; });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(process.env.TSA_SNS_CUA_SERVER || "{}");
  if (!config.command || !Array.isArray(config.args)) throw new Error("SNS browser server configuration is missing");
  const statePath = process.env.TSA_SNS_CONFIRMATION_STATE;
  let lastState = null;
  const state = status => {
    if (status === "closed") {
      if (!lastState || ["accepted", "cancelled", "unavailable"].includes(lastState)) return;
      status = "unavailable";
    }
    lastState = status;
    if (statePath) writeFileSync(statePath, JSON.stringify({ status, updatedAt: new Date().toISOString() }), "utf8");
  };
  const showDialog = (form, signal) => new Promise(resolve => {
    const dialog = spawn("powershell.exe", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", fileURLToPath(new URL("./sns-browser-confirmation.ps1", import.meta.url))], { windowsHide: true, env: { ...process.env, TSA_SNS_RELAY_PID: String(process.pid) }, stdio: ["pipe", "pipe", "pipe"] });
    let result = "";
    dialog.stdout.setEncoding("utf8");
    dialog.stdout.on("data", data => { if (result.length < 100_000) result += data; });
    dialog.stderr.on("data", () => {});
    const timer = setTimeout(() => dialog.kill(), 5 * 60_000);
    const closeDialog = () => dialog.kill();
    signal?.addEventListener("abort", closeDialog, { once: true });
    if (signal?.aborted) closeDialog();
    process.once("exit", closeDialog);
    dialog.on("error", () => resolve({ action: "cancel", content: null }));
    dialog.on("close", () => {
      clearTimeout(timer); process.off("exit", closeDialog);
      signal?.removeEventListener("abort", closeDialog);
      try { resolve(JSON.parse(result)); } catch { resolve({ action: "cancel", content: null }); }
    });
    dialog.stdin.end(JSON.stringify({ ...form, target: process.env.TSA_SNS_CONFIRMATION_TARGET || "SNS投稿" }), "utf8");
  });
  const server = startConfirmationRelay({ ...config, env: { ...process.env, ...config.env }, showDialog, state });
  server.on("error", () => { state("unavailable"); process.exitCode = 1; });
}
