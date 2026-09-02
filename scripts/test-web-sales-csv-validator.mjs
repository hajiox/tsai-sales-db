import assert from "node:assert/strict";
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
  assert.match(withoutEvidence.issues.join(" "), /公式API証跡/);

  writeFileSync(evidenceFile, `${JSON.stringify({
    schema_version: 3,
    channel: "qoo10",
    source: "qoo10_official_api_via_docscanner",
    source_system: "DocScanner",
    date_basis: "注文日",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    statuses_checked: ["1", "2", "3", "4", "5"],
    sync_enabled: true,
    sync_configured: true,
    sync_errors: 0,
    api_order_count: 0,
    counted_order_count: 0,
    item_count: 0,
    total_quantity: 0,
    total_amount: 0,
  }, null, 2)}\n`, "utf8");

  const verifiedZero = validate(["--zero-evidence", evidenceFile]);
  assert.equal(verifiedZero.status, "valid");
  assert.equal(verifiedZero.total_quantity, 0);
  assert.equal(verifiedZero.date_validated_from_file, false);
  assert.equal(verifiedZero.date_validated_from_evidence, true);
  assert.equal(verifiedZero.zero_evidence_valid, true);
  assert.equal(verifiedZero.zero_evidence_screenshots.length, 0);

  const incompleteEvidence = JSON.parse(readFileSync(evidenceFile, "utf8"));
  incompleteEvidence.statuses_checked = ["1", "2", "3", "4"];
  writeFileSync(evidenceFile, `${JSON.stringify(incompleteEvidence, null, 2)}\n`, "utf8");
  const incomplete = validate(["--zero-evidence", evidenceFile]);
  assert.equal(incomplete.status, "needs_review");
  assert.match(incomplete.issues.join(" "), /配送状態1〜5/);

  incompleteEvidence.schema_version = 2;
  incompleteEvidence.statuses_checked = ["1", "2", "3", "4", "5"];
  writeFileSync(evidenceFile, `${JSON.stringify(incompleteEvidence, null, 2)}\n`, "utf8");
  const legacyEvidence = validate(["--zero-evidence", evidenceFile]);
  assert.equal(legacyEvidence.status, "needs_review");
  assert.match(legacyEvidence.issues.join(" "), /公式API/);

  const bridge = readFileSync(join(root, "tools", "tsa-codex-bridge", "bridge.mjs"), "utf8");
  assert.match(bridge, /findQoo10ZeroEvidence/);
  assert.match(bridge, /executeQoo10OfficialSalesJob/);
  assert.match(bridge, /qoo10_official_api_via_docscanner/);

  const page = readFileSync(join(root, "app", "web-sales", "automation", "page.tsx"), "utf8");
  assert.match(page, /zero_result_verified === true/);
  assert.match(page, /公式APIで対象期間0件を確認済みです/);

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
