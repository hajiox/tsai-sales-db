// Bridge-hosted MCP confirmation transport for SNS and local carrier jobs. Browser operations stay in the official CUA server.
// Elicitation is answered only by a person in the local Bridge dialog, never by the model.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CONFIRMATION_REASONS = new Set(["confirmation_timeout", "dialog_start_failed", "dialog_closed", "user_cancelled", "unsupported_schema", "transport_cancelled", "mutex_busy", "noninteractive_session"]);
export function parseDialogEvent(line) {
  const prefix = "TSA_BROWSER_CONFIRMATION_EVENT ";
  if (!String(line).startsWith(prefix)) return null;
  try {
    const value = JSON.parse(line.slice(prefix.length));
    if (!["shown", "failed"].includes(value.presentation)) return null;
    return {presentation:value.presentation, reason:CONFIRMATION_REASONS.has(value.reason) ? value.reason : null};
  } catch {return null;}
}

export function isSecurityReview(params) {
  return [params?._meta, params?.meta].some(meta => meta && (meta.codex_request_type === "approval_request" || meta.codex_strict_auto_review === true));
}
export function reviewResponseSummary(message) {
  return {
    reviewOutcome: ({accept:"accepted", decline:"declined", cancel:"cancelled"})[message?.result?.action] || "error",
    reviewer: ["auto_review", "guardian_subagent"].includes(message?.result?._meta?.approvals_reviewer) ? message.result._meta.approvals_reviewer : "unknown",
  };
}

export function reviewRequestSummary(params) {
  const metadata = [params?._meta, params?.meta].find(value => value && typeof value === "object") || {};
  return {
    lastRequestType: typeof metadata.codex_request_type === "string" ? metadata.codex_request_type.slice(0, 80) : null,
    lastApprovalKind: typeof metadata.codex_approval_kind === "string" ? metadata.codex_approval_kind.slice(0, 80) : null,
    lastStrictAutoReview: metadata.codex_strict_auto_review === true,
    lastRequiresUserInput: metadata.codex_requires_user_input === true,
  };
}

export function shouldHostConfirmation(params) {
  const metadata = [params?._meta, params?.meta].filter(value => value && typeof value === "object");
  // Automatic security reviews stay with the CLI reviewer. A form explicitly marked
  // as requiring user input must reach the desktop operator even when the same request
  // also carries strict-review metadata; forwarding it to noninteractive codex exec
  // would dismiss the form before the person can answer it.
  if (!["form", "openai/form"].includes(params?.mode || "form")) return false;
  return metadata.some(meta => meta.codex_requires_user_input === true);
}

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

export async function requestBrowserConfirmation(params, showDialog, signal, timeoutMs = 5 * 60_000, onOutcome = () => {}) {
  const cancelled = { action: "cancel", content: null };
  if (!["form", "openai/form"].includes(params?.mode || "form")) {onOutcome("unsupported_schema"); return cancelled;}
  const fields = confirmationFields(params?.requestedSchema);
  if (!fields || signal?.aborted) {onOutcome(signal?.aborted ? "transport_cancelled" : "unsupported_schema"); return cancelled;}
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, {once:true});
  let timedOut = false;
  const timer = setTimeout(() => {timedOut = true; abort();}, timeoutMs);
  let resolveCancelled;
  const aborted = new Promise(resolve => {resolveCancelled = resolve;});
  const onAbort = () => resolveCancelled(cancelled);
  controller.signal.addEventListener("abort", onAbort, {once:true});
  try {
    const response = await Promise.race([
      Promise.resolve().then(() => showDialog({ message:String(params.message || ""), fields }, controller.signal)), aborted,
    ]);
    if (controller.signal.aborted) {onOutcome(timedOut ? "confirmation_timeout" : "transport_cancelled"); return cancelled;}
    const validated = validateConfirmationResponse(response, fields);
    onOutcome(validated.action === "accept" ? null : CONFIRMATION_REASONS.has(response?.reason) ? response.reason : "user_cancelled");
    return validated;
  } catch {onOutcome("dialog_start_failed"); return cancelled;}
  finally {
    clearTimeout(timer); signal?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", onAbort);
  }
}

export function startConfirmationRelay({ command, args, env, input = process.stdin, output = process.stdout, showDialog, state = () => {}, reviewAudit = () => {} }) {
  const server = spawn(command, args, { env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const send = value => { if (!server.stdin.destroyed) server.stdin.write(`${JSON.stringify(value)}\n`); };
  const clientLines = createInterface({ input });
  const serverLines = createInterface({ input: server.stdout });
  const reviewIds = new Set();
  const review = {reviewRequests:0, reviewResponses:0, reviewOutcome:null, reviewer:"unknown", lastRequestType:null, lastApprovalKind:null, lastStrictAutoReview:false, lastRequiresUserInput:false};
  const emitReviewAudit = () => {try {reviewAudit({...review});} catch { /* Advisory observation must not alter the security protocol. */ }};
  const activeToolCalls = new Set();
  let active = false;
  let activeRequest = null;
  let ended = false;
  clientLines.on("line", line => {
    try {
      const message = JSON.parse(line);
      if (!message.method && reviewIds.has(message.id)) {
        reviewIds.delete(message.id);
        review.reviewResponses++;
        Object.assign(review, reviewResponseSummary(message));
        emitReviewAudit();
      }
      if (message.method === "tools/call" && message.id !== undefined) activeToolCalls.add(message.id);
      if (message.method === "notifications/cancelled" && activeRequest && (
        message.params?.requestId === activeRequest.id || activeToolCalls.has(message.params?.requestId)
      )) activeRequest.controller.abort();
      if (message.method === "initialize") {
        message.params ||= {};
        message.params.capabilities ||= {};
        // This host actually provides the interactive form capability missing in codex exec.
        message.params.capabilities.elicitation = { ...(message.params.capabilities.elicitation || {}), form: message.params.capabilities.elicitation?.form || {} };
      }
      if (message.method === "initialize") send(message);
      else if (!server.stdin.destroyed) server.stdin.write(`${line}\n`);
    } catch { server.kill(); }
  });
  serverLines.on("line", async line => {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (message.method === "elicitation/create" && message.id !== undefined && isSecurityReview(message.params) && !reviewIds.has(message.id)) {
      reviewIds.add(message.id); review.reviewRequests++; Object.assign(review, reviewRequestSummary(message.params)); emitReviewAudit();
    }
    if (message.id !== undefined && !message.method) activeToolCalls.delete(message.id);
    if (message.method === "notifications/cancelled" && message.params?.requestId === activeRequest?.id) activeRequest.controller.abort();
    if (message.method !== "elicitation/create" || message.id === undefined || !shouldHostConfirmation(message.params)) {
      output.write(`${line}\n`);
      return;
    }
    if (active || ended) { send({ jsonrpc: "2.0", id: message.id, result: { action: "cancel", content: null } }); return; }
    active = true;
    activeRequest = { id: message.id, controller: new AbortController() };
    state("waiting", {presentation:"requested", reason:null});
    let result = { action: "cancel", content: null };
    let outcomeReason = null;
    try { result = await requestBrowserConfirmation(message.params, showDialog, activeRequest.controller.signal, 5 * 60_000, reason => {outcomeReason = reason;}); } catch {outcomeReason = "dialog_start_failed";}
    if (activeRequest.controller.signal.aborted) result = { action: "cancel", content: null };
    if (!ended) send({ jsonrpc: "2.0", id: message.id, result });
    state(result.action === "accept" ? "accepted" : "cancelled", {reason:outcomeReason});
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
  let presentation = null;
  let reason = null;
  const state = (status, detail = {}) => {
    if (status === "closed") {
      if (!lastState || ["accepted", "cancelled", "unavailable"].includes(lastState)) return;
      status = "unavailable";
    }
    lastState = status;
    if (detail.presentation) presentation = detail.presentation;
    if (Object.hasOwn(detail, "reason")) reason = detail.reason;
    if (statePath) writeFileSync(statePath, JSON.stringify({ status, presentation, reason, updatedAt: new Date().toISOString() }), "utf8");
  };
  const showDialog = (form, signal) => new Promise(resolve => {
    const dialog = spawn("powershell.exe", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", fileURLToPath(new URL("./sns-browser-confirmation.ps1", import.meta.url))], { windowsHide: true, env: { ...process.env, TSA_SNS_RELAY_PID: String(process.pid) }, stdio: ["pipe", "pipe", "pipe"] });
    let result = "";
    dialog.stdout.setEncoding("utf8");
    dialog.stdout.on("data", data => { if (result.length < 100_000) result += data; });
    let stderrBuffer = "";
    let dialogReason = null;
    let shown = false;
    const startupTimer = setTimeout(() => { if (!shown) {dialogReason = "dialog_start_failed"; dialog.kill();} }, 15_000);
    dialog.stderr.setEncoding("utf8");
    dialog.stderr.on("data", chunk => {
      stderrBuffer = (stderrBuffer + chunk).slice(-4096);
      const lines = stderrBuffer.split(/\r?\n/); stderrBuffer = lines.pop() || "";
      for (const line of lines) {
        const event = parseDialogEvent(line);
        if (!event) continue; // Raw stderr is never persisted or shown.
        shown ||= event.presentation === "shown";
        if (shown || event.presentation === "failed") clearTimeout(startupTimer);
        dialogReason = event.reason;
        state(event.presentation === "shown" ? "waiting" : "unavailable", event);
      }
    });
    const timer = setTimeout(() => {dialogReason = "confirmation_timeout"; dialog.kill();}, 5 * 60_000);
    const closeDialog = () => dialog.kill();
    signal?.addEventListener("abort", closeDialog, { once: true });
    if (signal?.aborted) closeDialog();
    process.once("exit", closeDialog);
    dialog.on("error", () => resolve({ action:"cancel", content:null, reason:"dialog_start_failed" }));
    dialog.on("close", () => {
      clearTimeout(timer); clearTimeout(startupTimer); process.off("exit", closeDialog);
      signal?.removeEventListener("abort", closeDialog);
      try { resolve(JSON.parse(result)); } catch { resolve({ action:"cancel", content:null, reason:dialogReason || (shown ? "dialog_closed" : "dialog_start_failed") }); }
    });
    dialog.stdin.end(JSON.stringify({ ...form, target: process.env.TSA_SNS_CONFIRMATION_TARGET || "SNS投稿" }), "utf8");
  });
  const reviewAudit = value => {
    try {if (statePath) writeFileSync(join(dirname(statePath), "browser-review-state.json"), JSON.stringify({...value, updatedAt:new Date().toISOString()}), "utf8");} catch { /* No protocol change on an advisory state write failure. */ }
  };
  reviewAudit({reviewRequests:0, reviewResponses:0, reviewOutcome:null, reviewer:"unknown", lastRequestType:null, lastApprovalKind:null, lastStrictAutoReview:false, lastRequiresUserInput:false});
  const server = startConfirmationRelay({ ...config, env: { ...process.env, ...config.env }, showDialog, state, reviewAudit });
  server.on("error", () => { state("unavailable"); process.exitCode = 1; });
}
