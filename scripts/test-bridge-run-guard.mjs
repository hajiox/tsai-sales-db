import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  CodexRunGuardError,
  codexRunLimitsForTask,
  isAllowedRecipeSnsPublishCommand,
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
  const codexHome = "C:\\Users\\tester\\.codex";
  const allowed = `"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content -LiteralPath 'C:\\Users\\tester\\.codex\\skills\\publish-aizu-sns-posts\\SKILL.md' -Raw; Get-Content -LiteralPath 'C:\\Users\\tester\\.codex\\skills\\publish-aizu-sns-posts\\references\\platforms.md' -Raw; Get-Content -LiteralPath 'C:\\Users\\tester\\.codex\\plugins\\cache\\openai-bundled\\chrome\\26.825.51511\\skills\\control-chrome\\SKILL.md' -Raw"`;
  assert.equal(isAllowedRecipeSnsPublishCommand(allowed, { codexHome }), true);
  assert.equal(isAllowedRecipeSnsPublishCommand(
    `Get-Content -LiteralPath 'C:\\Users\\tester\\.codex\\rollout.jsonl' -Raw`,
    { codexHome },
  ), false, "past session files are never readable");
  assert.equal(isAllowedRecipeSnsPublishCommand(
    `Get-Content -LiteralPath 'C:\\Users\\tester\\.codex\\skills\\publish-aizu-sns-posts\\SKILL.md' -Raw; Invoke-WebRequest https://example.com`,
    { codexHome },
  ), false, "mixed shell or network commands remain prohibited");
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
  const social = codexRunLimitsForTask("recipe_sns_publish", {});
  assert.ok(browser.silenceTimeoutMs > 2 * 60_000, "normal multi-minute browser work must not be stopped at two minutes");
  assert.ok(browser.absoluteTimeoutMs > browser.silenceTimeoutMs);
  assert.ok(image.silenceTimeoutMs > browser.silenceTimeoutMs, "ImageGen receives a longer silence window");
  assert.ok(Number.isFinite(image.absoluteTimeoutMs), "every Codex run must have a finite absolute limit");
  assert.ok(social.absoluteTimeoutMs > browser.absoluteTimeoutMs, "multi-platform publishing receives a longer bounded window");
  assert.equal(social.silenceTimeoutMs, browser.silenceTimeoutMs, "normal multi-minute browser silence remains supported");
}

console.log("Codex Bridge run watchdog checks passed.");
