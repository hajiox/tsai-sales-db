import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  CodexRunGuardError,
  codexRunLimitsForTask,
  waitForCodexExitWithWatchdog,
} from "../tools/tsa-codex-bridge/codex-run-guard.mjs";

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.exitCode = null;
  return child;
}

{
  const child = fakeChild();
  const waited = waitForCodexExitWithWatchdog(child, {
    taskKey: "web_sales_analysis",
    limits: { silenceTimeoutMs: 100, absoluteTimeoutMs: 200 },
    terminate: () => assert.fail("normal completion must not terminate the child"),
  });
  child.emit("close", 0);
  assert.equal(await waited, 0);
}

{
  const child = fakeChild();
  let terminated = false;
  const waited = waitForCodexExitWithWatchdog(child, {
    taskKey: "ec_price_update",
    limits: { silenceTimeoutMs: 30, absoluteTimeoutMs: 200 },
    terminate: () => { terminated = true; },
  });
  await assert.rejects(waited, (error) => {
    assert.ok(error instanceof CodexRunGuardError);
    assert.equal(error.code, "CODEX_SILENCE_TIMEOUT");
    assert.equal(error.jobStatus, "waiting_for_user");
    assert.match(error.message, /自動再実行しません/);
    return true;
  });
  assert.equal(terminated, true);
}

{
  const child = fakeChild();
  let terminated = false;
  const waited = waitForCodexExitWithWatchdog(child, {
    taskKey: "ingredient_label_generate",
    limits: { silenceTimeoutMs: 200, absoluteTimeoutMs: 45 },
    terminate: () => { terminated = true; },
  });
  const activity = setInterval(() => child.stdout.write("progress\n"), 10);
  await assert.rejects(waited, (error) => {
    assert.equal(error.code, "CODEX_ABSOLUTE_TIMEOUT");
    assert.equal(error.jobStatus, "needs_review");
    return true;
  });
  clearInterval(activity);
  assert.equal(terminated, true);
}

{
  const browser = codexRunLimitsForTask("ec_price_update", {});
  const image = codexRunLimitsForTask("recipe_sns_generate", {});
  assert.ok(browser.silenceTimeoutMs > 2 * 60_000, "normal multi-minute browser work must not be stopped at two minutes");
  assert.ok(browser.absoluteTimeoutMs > browser.silenceTimeoutMs);
  assert.ok(image.silenceTimeoutMs > browser.silenceTimeoutMs, "ImageGen receives a longer silence window");
  assert.ok(Number.isFinite(image.absoluteTimeoutMs), "every Codex run must have a finite absolute limit");
}

console.log("Codex Bridge run watchdog checks passed.");
