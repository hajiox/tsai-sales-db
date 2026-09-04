const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const bridge = read("tools", "tsa-codex-bridge", "bridge.mjs");
const skill = read("tools", "tsa-codex-bridge", "skills", "tsa-web-sales-csv", "SKILL.md");
const channels = read("tools", "tsa-codex-bridge", "skills", "tsa-web-sales-csv", "references", "channels.md");
const screen = read("app", "web-sales", "automation", "page.tsx");
const amazonFallback = read("tools", "tsa-codex-bridge", "amazon-business-report-download.ps1");
const installer = read("tools", "tsa-codex-bridge", "install-bridge.ps1");

for (const source of [bridge, skill]) {
  assert.match(source, /downloadOutcomePromise/);
  assert.match(source, /timeoutMs:\s*120000/);
  assert.match(source, /permission request was dismissed before a decision/);
  assert.match(source, /Never leave a rejected download promise unhandled|Never leave a rejected download promise unhandled\./i);
}

assert.doesNotMatch(bridge, /wait three seconds and retry that same download once/);
assert.match(bridge, /webSalesBrowserWaitReason/);
assert.match(bridge, /codex_browser_download_approval/);
assert.match(bridge, /chrome_control_conflict/);
assert.match(bridge, /first invocation must be exactly await cua\.getState\(\)/);
assert.match(skill, /first invocation must be exactly `await cua\.getState\(\)`/);
assert.match(bridge, /create at most one temporary Chrome tab/);
assert.match(skill, /create at most one temporary same-profile tab/);
assert.doesNotMatch(skill, /agent\.browsers\.getForUrl|getForUrl\(|getDefault\(/);
assert.match(skill, /さらに最大3分監視/);
assert.match(channels, /https:\/\/sellercentral\.amazon\.co\.jp\/business-reports/);
assert.match(channels, /\/amazonsell\/business.*移動せず/);
assert.match(channels, /Windows経由で1回実行/);
assert.match(bridge, /runAmazonBusinessReportDownloadFallback/);
assert.match(bridge, /amazon_download_fallback_started/);
assert.match(bridge, /waitForCsvChange\(downloadsDir, downloadSnapshot, 180_000\)/);
assert.match(amazonFallback, /sellercentral\.amazon\.co\.jp/);
assert.match(amazonFallback, /\$values -notcontains \$expectedStart/);
assert.match(amazonFallback, /\$values -notcontains \$expectedEnd/);
assert.match(amazonFallback, /\.Current\.Name -eq \$ExpectedAccount/);
assert.match(amazonFallback, /\.Current\.Name -eq "ダウンロード（\.csv）"/);
assert.doesNotMatch(amazonFallback, /SetCursorPos|mouse_event|SendKeys/);
assert.match(installer, /amazon-business-report-download\.ps1/);

assert.match(screen, /CSV取得確認待ち/);
assert.match(screen, /帳票画面を確認して再実行/);
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
assert.equal(classifyWait({
  summary: "Amazon CSVのダウンロード承認待ち",
  details: "ブラウザのセキュリティ確認で、許可要求が閉じられました。",
}), "codex_browser_download_approval");
assert.equal(classifyWait({ summary: "CSV列が不正です", details: "validation failed" }), null);

console.log("WEB sales download guard: single browser binding, handled promise, and structured operator wait verified.");
