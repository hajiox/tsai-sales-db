import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const validator = join(root, "tools", "tsa-codex-bridge", "skills", "tsa-web-sales-csv", "scripts", "validate-csv.mjs");
const workDir = mkdtempSync(join(tmpdir(), "tsa-qoo10-zero-validator-"));
const csvFile = join(workDir, "qoo10-2026-08-01_2026-08-31.original.csv");
const preparedFile = join(workDir, "qoo10-2026-08-01_2026-08-31.prepared.csv");
const evidenceFile = join(workDir, "qoo10-2026-08-01_2026-08-31.zero-evidence.original.json");

try {
  writeFileSync(csvFile, [
    "配送状態,注文番号,注文日,商品番号,商品名,数量,販売者商品コード",
    "",
  ].join("\r\n"), "utf8");

  const withoutEvidence = validate([]);
  assert.equal(withoutEvidence.status, "needs_review");
  assert.equal(withoutEvidence.date_validated_from_file, false);
  assert.equal(withoutEvidence.zero_evidence_required, true);
  assert.equal(withoutEvidence.zero_evidence_valid, false);
  assert.match(withoutEvidence.issues.join(" "), /公式画面証跡/);

  const statuses = ["入金待ち", "配送要請", "配送中", "配送完了"];
  const statusResults = statuses.map((status, index) => {
    const screenshotFile = `qoo10-2026-08-01_2026-08-31.zero-D${index + 1}.original.png`;
    const bytes = Buffer.alloc(6_000, index + 1);
    writeFileSync(join(workDir, screenshotFile), bytes);
    return {
      status,
      status_code: `D${index + 1}`,
      result_count: 0,
      result_grid_id: "GoodsGrid",
      empty_marker: "表示する行がありません",
      page_total: 0,
      period_start: "2026-08-01",
      period_end: "2026-08-31",
      start_time: "00:00",
      end_time: "23:50",
      screenshot_file: screenshotFile,
      screenshot_sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  });
  writeFileSync(evidenceFile, `${JSON.stringify({
    schema_version: 2,
    channel: "qoo10",
    account_label: "会津ブランド館",
    official_url: "https://qsm.qoo10.jp/GMKT.INC.Gsm.Web/Delivery/DeliveryManagementPrime.aspx",
    date_basis: "注文日",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    start_time: "00:00",
    end_time: "23:50",
    status_results: statusResults,
  }, null, 2)}\n`, "utf8");

  const verifiedZero = validate(["--zero-evidence", evidenceFile]);
  assert.equal(verifiedZero.status, "valid");
  assert.equal(verifiedZero.total_quantity, 0);
  assert.equal(verifiedZero.date_validated_from_file, false);
  assert.equal(verifiedZero.date_validated_from_evidence, true);
  assert.equal(verifiedZero.zero_evidence_valid, true);
  assert.equal(verifiedZero.zero_evidence_screenshots.length, 4);

  const wrongGridEvidence = JSON.parse(readFileSync(evidenceFile, "utf8"));
  wrongGridEvidence.status_results[0].result_grid_id = "TinyGoodsGrid";
  writeFileSync(evidenceFile, `${JSON.stringify(wrongGridEvidence, null, 2)}\n`, "utf8");
  const wrongGrid = validate(["--zero-evidence", evidenceFile]);
  assert.equal(wrongGrid.status, "needs_review");
  assert.match(wrongGrid.issues.join(" "), /証跡が不完全/);
  wrongGridEvidence.status_results[0].result_grid_id = "GoodsGrid";
  writeFileSync(evidenceFile, `${JSON.stringify(wrongGridEvidence, null, 2)}\n`, "utf8");

  writeFileSync(join(workDir, statusResults[0].screenshot_file), Buffer.alloc(6_000, 9));
  const tamperedEvidence = validate(["--zero-evidence", evidenceFile]);
  assert.equal(tamperedEvidence.status, "needs_review");
  assert.match(tamperedEvidence.issues.join(" "), /作成後に変わっています/);

  const bridge = readFileSync(join(root, "tools", "tsa-codex-bridge", "bridge.mjs"), "utf8");
  assert.match(bridge, /findQoo10ZeroEvidence/);
  assert.match(bridge, /zero_result_verified: verifiedZero/);
  assert.match(bridge, /全4配送状態の公式画面証跡/);

  const page = readFileSync(join(root, "app", "web-sales", "automation", "page.tsx"), "utf8");
  assert.match(page, /zero_result_verified === true/);
  assert.match(page, /公式画面で対象期間0件を確認済みです/);

  console.log("Qoo10 zero-sales evidence validator tests passed");
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

function validate(extraArgs) {
  const result = spawnSync(process.execPath, [
    validator,
    "--channel", "qoo10",
    "--file", csvFile,
    "--start", "2026-08-01",
    "--end", "2026-08-31",
    "--out", preparedFile,
    ...extraArgs,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
