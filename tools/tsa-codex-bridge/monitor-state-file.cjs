const { mkdirSync, renameSync, rmSync, writeFileSync } = require("node:fs");
const { dirname } = require("node:path");

const REPLACE_RETRY_DELAYS_MS = Object.freeze([0, 10, 25, 50, 100, 200, 400, 800]);
const RETRYABLE_REPLACE_CODES = new Set(["EACCES", "EBUSY", "EEXIST", "ENOTEMPTY", "EPERM"]);
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));

function sleepSync(milliseconds) {
  if (milliseconds > 0) Atomics.wait(sleepBuffer, 0, 0, milliseconds);
}

function writeMonitorStateJson(path, value, options = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  const onRetry = typeof options.onRetry === "function" ? options.onRetry : null;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");

  try {
    let lastError = null;
    for (let attempt = 0; attempt < REPLACE_RETRY_DELAYS_MS.length; attempt += 1) {
      const delay = REPLACE_RETRY_DELAYS_MS[attempt];
      sleepSync(delay);
      try {
        renameSync(temporaryPath, path);
        return;
      } catch (error) {
        if (!RETRYABLE_REPLACE_CODES.has(String(error?.code || ""))) throw error;
        lastError = error;
        onRetry?.({ attempt: attempt + 1, delay, error });
      }
    }
    throw lastError || new Error(`Bridge monitor state could not replace ${path}`);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

module.exports = {
  REPLACE_RETRY_DELAYS_MS,
  writeMonitorStateJson,
};
