const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const bridge = read("tools", "tsa-codex-bridge", "bridge.mjs");
const skill = read("tools", "tsa-codex-bridge", "skills", "tsa-web-sales-csv", "SKILL.md");
const screen = read("app", "web-sales", "automation", "page.tsx");

for (const source of [bridge, skill]) {
  assert.match(source, /downloadOutcomePromise/);
  assert.match(source, /permission request was dismissed before a decision/);
  assert.match(source, /Never leave a rejected download promise unhandled|Never leave a rejected download promise unhandled\./i);
}

assert.doesNotMatch(bridge, /wait three seconds and retry that same download once/);
assert.match(bridge, /webSalesBrowserWaitReason/);
assert.match(bridge, /codex_browser_download_approval/);
assert.match(bridge, /chrome_control_conflict/);
assert.match(bridge, /Never call getForUrl\/getDefault\/get again/);
assert.match(skill, /Never call `getForUrl`, `getDefault`, or `get` again/);

assert.match(screen, /Codex承認待ち/);
assert.match(screen, /再実行時にCodexで許可/);
assert.match(screen, /先行操作終了後に再実行/);
assert.match(screen, /resultDetails\(latest\.result\)/);

const waitClassifierSource = bridge.slice(
  bridge.indexOf("function webSalesBrowserWaitReason"),
  bridge.indexOf("function commandLabel"),
);
const classifyWait = new Function(`${waitClassifierSource}; return webSalesBrowserWaitReason;`)();
assert.equal(classifyWait({
  summary: "Chromeのダウンロード権限で停止しました。",
  details: "The permission request was dismissed before a decision was made.",
}), "codex_browser_download_approval");
assert.equal(classifyWait({
  summary: "Chrome操作を完了できませんでした。",
  details: "Detached while handling command because another browser session is active.",
}), "chrome_control_conflict");
assert.equal(classifyWait({ summary: "CSV列が不正です", details: "validation failed" }), null);

console.log("WEB sales download guard: single browser binding, handled promise, and structured operator wait verified.");
