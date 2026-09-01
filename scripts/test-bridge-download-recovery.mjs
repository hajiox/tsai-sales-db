import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  archiveStagedReport,
  extractReportArtifactPaths,
  findReportArtifactCandidates,
  isReportArtifactForPeriod,
  snapshotReportArtifacts,
  stageReportArtifact,
} from "../tools/tsa-codex-bridge/download-artifact-recovery.mjs";

const root = mkdtempSync(join(tmpdir(), "tsa-bridge-download-recovery-"));
const downloads = join(root, "Downloads");
const work = join(root, "work");
const archive = join(root, "archive");
mkdirSync(downloads);

try {
  const meta = join(downloads, "247604225296764_-_-_2026_08_01-_-2026_08_31.csv");
  writeFileSync(meta, "レポート開始日,レポート終了日,広告セット名,消化金額 (JPY)\n2026-08-01,2026-08-31,商品,100\n", "utf8");
  const snapshot = snapshotReportArtifacts(downloads);
  assert.equal(findReportArtifactCandidates({
    downloadsDir: downloads,
    snapshot,
    taskKey: "ad_cost_import",
    channel: "meta",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
  }).length, 0, "unchanged files must not look newly downloaded");

  const existingMeta = findReportArtifactCandidates({
    downloadsDir: downloads,
    taskKey: "ad_cost_import",
    channel: "meta",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    includeExisting: true,
  });
  assert.equal(existingMeta[0].path, meta);

  writeFileSync(meta, `${readFileSync(meta, "utf8")}2026-08-01,2026-08-31,商品2,200\n`, "utf8");
  assert.equal(findReportArtifactCandidates({
    downloadsDir: downloads,
    snapshot,
    taskKey: "ad_cost_import",
    channel: "meta",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
  })[0].changed, true);

  const unrelated = join(downloads, "personal-budget.csv");
  writeFileSync(unrelated, "date,cost\n2026-08-01,500\n", "utf8");
  assert.equal(findReportArtifactCandidates({
    downloadsDir: downloads,
    taskKey: "ad_cost_import",
    channel: "yahoo",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    includeExisting: true,
  }).length, 0);

  const yahoo = join(downloads, "広告詳細レポート_アイテムリーチ（商品）_商品別_月別.csv");
  writeFileSync(yahoo, "日付,商品コード,利用金額,ROAS\n2026/08,100,200,300\n", "utf8");
  assert.equal(findReportArtifactCandidates({
    downloadsDir: downloads,
    taskKey: "ad_cost_import",
    channel: "yahoo",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    includeExisting: true,
  })[0].path, yahoo);

  const rakuten = join(downloads, "rpp_item_reports_aizubrandhall_20260901131227759.zip");
  writeFileSync(rakuten, "PK dummy");
  assert.equal(findReportArtifactCandidates({
    downloadsDir: downloads,
    taskKey: "ad_cost_import",
    channel: "rakuten",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    includeExisting: true,
  })[0].path, rakuten);

  const amazonAds = join(downloads, "スポンサープロダクト広告_広告対象商品_レポート (1).xlsx");
  writeFileSync(amazonAds, "PK fake workbook");
  assert.equal(findReportArtifactCandidates({
    downloadsDir: downloads,
    taskKey: "ad_cost_import",
    channel: "amazon",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    includeExisting: true,
  })[0].path, amazonAds, "Amazon's standard Japanese report name must reach server-side month validation");

  const mercari = join(downloads, "202608-202608_report.csv");
  writeFileSync(mercari, "販売利益,販売手数料（税込）,売上移転日\n100,10,2026/8/1\n", "utf8");
  assert.equal(findReportArtifactCandidates({
    downloadsDir: downloads,
    taskKey: "ec_profit_import",
    channel: "mercari",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    includeExisting: true,
  })[0].path, mercari);

  const staleAmazon = join(downloads, "2026JulMonthlyTransaction.csv");
  writeFileSync(staleAmazon, "トランザクション,Amazon手数料,日付\n注文,100,2026-07-31\n調整,0,2026-08-01\n", "utf8");
  assert.equal(findReportArtifactCandidates({
    downloadsDir: downloads,
    taskKey: "ec_profit_import",
    channel: "amazon",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    includeExisting: true,
    explicitPaths: [staleAmazon],
  }).length, 0, "explicit paths must not bypass the requested EC settlement period");

  const staleYahoo = join(downloads, "billing_202508-1.csv");
  writeFileSync(staleYahoo, "注文ID,決済手数料,利用日\nold,100,2025-08-15\n", "utf8");
  assert.equal(findReportArtifactCandidates({
    downloadsDir: downloads,
    taskKey: "ec_profit_import",
    channel: "yahoo",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    includeExisting: true,
    explicitPaths: [staleYahoo],
  }).length, 0, "an old Yahoo billing CSV must not be staged for a newer month");

  const yahooHtml = join(downloads, "Yahoo請求明細_202608.csv");
  writeFileSync(yahooHtml, "<!DOCTYPE HTML><html><body>2026-08 請求明細</body></html>", "utf8");
  assert.equal(findReportArtifactCandidates({
    downloadsDir: downloads,
    taskKey: "ec_profit_import",
    channel: "yahoo",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    includeExisting: true,
    explicitPaths: [yahooHtml],
  }).some((candidate) => candidate.path === yahooHtml), false, "HTML saved with a CSV extension is not settlement evidence");

  const yahooDailySales = join(downloads, "aizubrandhall-store_overall.csv");
  writeFileSync(yahooDailySales, "日付,売上合計値\n2026-08-01,1000\n2026-08-31,2000\n", "utf8");
  assert.equal(findReportArtifactCandidates({
    downloadsDir: downloads,
    taskKey: "ec_profit_import",
    channel: "yahoo",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    includeExisting: true,
  }).some((candidate) => candidate.path === yahooDailySales), true, "Yahoo daily official sales must be staged for reconciliation");

  const wrongTikTok = join(downloads, "aizubrand-official-ec-20260901.csv");
  writeFileSync(wrongTikTok, "注文ID,注文日時,支払い方法\nbase-order,2026-08-12,credit_card\n", "utf8");
  assert.equal(findReportArtifactCandidates({
    downloadsDir: downloads,
    taskKey: "ec_profit_import",
    channel: "tiktok",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    includeExisting: true,
    explicitPaths: [wrongTikTok],
  }).length, 0, "a BASE order CSV must not be staged as TikTok settlement data");

  const pollutedAmazonArchive = join(downloads, "amazon-2026-08-01_2026-08-31-2026JulMonthlyTransaction.original.csv");
  writeFileSync(pollutedAmazonArchive, "トランザクション,Amazon手数料,日付\n注文,100,2026-07-31\n調整,0,2026-08-01\n", "utf8");
  assert.equal(isReportArtifactForPeriod({
    taskKey: "ec_profit_import",
    channel: "amazon",
    filePath: pollutedAmazonArchive,
    startDate: "2026-08-01",
    endDate: "2026-08-31",
  }), false, "a synthetic archive prefix must not turn a July Amazon report into August evidence");

  const validAmazonArchive = join(downloads, "amazon-2026-08-01_2026-08-31-2026AugMonthlyTransaction.original.csv");
  writeFileSync(validAmazonArchive, "トランザクション,Amazon手数料,日付\n注文,100,2026-08-15\n", "utf8");
  assert.equal(isReportArtifactForPeriod({
    taskKey: "ec_profit_import",
    channel: "amazon",
    filePath: validAmazonArchive,
    startDate: "2026-08-01",
    endDate: "2026-08-31",
  }), true, "an archived Amazon report with August rows remains reusable");

  const pollutedTikTokArchive = join(downloads, "tiktok-2026-08-01_2026-08-31-aizubrand-official-ec-20260901.original.csv");
  writeFileSync(pollutedTikTokArchive, "注文ID,注文日時,支払い方法\nbase-order,2026-08-12,credit_card\n", "utf8");
  assert.equal(isReportArtifactForPeriod({
    taskKey: "ec_profit_import",
    channel: "tiktok",
    filePath: pollutedTikTokArchive,
    startDate: "2026-08-01",
    endDate: "2026-08-31",
  }), false, "a synthetic archive prefix must not turn a BASE export into TikTok evidence");

  const timestampOnlyTikTok = join(downloads, "income_20260806115059(UTC+9).xlsx");
  writeFileSync(timestampOnlyTikTok, "PK fake workbook", "utf8");
  assert.equal(isReportArtifactForPeriod({
    taskKey: "ec_profit_import",
    channel: "tiktok",
    filePath: timestampOnlyTikTok,
    startDate: "2026-08-01",
    endDate: "2026-08-31",
  }), false, "TikTok export creation time must not be treated as its statement period");

  const staleQoo10 = join(downloads, "DeliveryManagement_detail_20260901_1153.csv");
  writeFileSync(staleQoo10, '"配送状態","注文日","カート番号","購入者決済金額"\n"配送完了","2026-07-31 10:00:00","1","1000"\n', "utf8");
  assert.equal(findReportArtifactCandidates({
    downloadsDir: downloads,
    taskKey: "ec_profit_import",
    channel: "qoo10",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    includeExisting: true,
  }).length, 0, "Qoo10 export generated in September must not be mistaken for August data");
  writeFileSync(staleQoo10, '"配送状態","注文日","カート番号","購入者決済金額"\n"配送完了","2026-08-02 10:00:00","1","1000"\n', "utf8");
  assert.equal(findReportArtifactCandidates({
    downloadsDir: downloads,
    taskKey: "ec_profit_import",
    channel: "qoo10",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    includeExisting: true,
  })[0].path, staleQoo10);

  const staged = stageReportArtifact({
    sourcePath: yahoo,
    targetDir: work,
    channel: "yahoo",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    taskKey: "ad_cost_import",
  });
  assert.match(staged, /yahoo-2026-08-01_2026-08-31\.original\.csv$/i);
  assert.equal(readFileSync(staged, "utf8"), readFileSync(yahoo, "utf8"));
  assert.equal(stageReportArtifact({
    sourcePath: yahoo,
    targetDir: work,
    channel: "yahoo",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    taskKey: "ad_cost_import",
  }), staged, "identical retry must reuse the staged file");
  const archived = archiveStagedReport(staged, archive);
  assert.equal(readFileSync(archived, "utf8"), readFileSync(yahoo, "utf8"));

  const explicit = extractReportArtifactPaths({
    details: `検証済みダウンロード: ${yahoo}`,
    source_files: [],
  }, [downloads]);
  assert.deepEqual(explicit, [yahoo]);
  assert.deepEqual(extractReportArtifactPaths({ details: `対象外: ${unrelated}` }, [work]), []);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("Bridge download recovery checks passed.");
