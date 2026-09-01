import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, resolve, sep } from "node:path";

const DEFINITIONS = {
  amazon: {
    headerRow: 0,
    required: ["（親）ASIN", "（子）ASIN", "タイトル", "注文された商品点数", "注文商品の売上額"],
    quantity: "注文された商品点数",
  },
  rakuten: {
    headerRow: 6,
    required: ["商品名", "商品管理番号", "平均単価", "売上個数", "売上", "売上件数"],
    quantity: "売上個数",
    metadataPeriod: true,
  },
  yahoo: {
    headerRow: 0,
    required: ["商品名", "商品コード", "売上合計値（税込）", "注文数合計", "注文点数合計", "注文者数合計"],
    quantity: "注文点数合計",
  },
  mercari: {
    headerRow: 0,
    required: ["注文番号", "明細番号", "明細種別", "売上移転日", "商品名", "数量", "売上（税込）"],
    quantity: "数量",
    date: "売上移転日",
    review: (row) => row["明細種別"] && row["明細種別"] !== "購入" ? `購入以外の明細種別: ${row["明細種別"]}` : null,
  },
  base: {
    headerRow: 0,
    required: ["注文ID", "注文日時", "商品名", "価格", "数量", "合計金額", "発送状況"],
    quantity: "数量",
    date: "注文日時",
    review: (row) => row["発送状況"] && row["発送状況"] !== "発送済み" ? `発送済み以外の注文: ${row["発送状況"]}` : null,
  },
  qoo10: {
    headerRow: 0,
    required: ["配送状態", "注文番号", "注文日", "商品番号", "商品名", "数量", "販売者商品コード"],
    quantity: "数量",
    date: "注文日",
    review: (row) => row["配送状態"] && !["配送中", "配送完了"].includes(row["配送状態"]) ? `対象外の配送状態: ${row["配送状態"]}` : null,
  },
  tiktok: {
    headerRow: 0,
    required: ["注文ID", "注文状況", "SKU ID", "商品名", "数量", "注文金額", "注文の支払い日時"],
    quantity: "数量",
    date: "注文の支払い日時",
    review: (row) => row["注文状況"] && row["注文状況"] !== "発送済み" ? `発送済み以外の注文: ${row["注文状況"]}` : null,
  },
};

const args = parseArgs(process.argv.slice(2));
const definition = DEFINITIONS[args.channel];
if (!definition || !args.file || !args.start || !args.end) {
  fail("usage: validate-csv.mjs --channel <channel> --file <csv> --start YYYY-MM-DD --end YYYY-MM-DD [--out <csv>] [--zero-evidence <json>]");
}

const sourcePath = resolve(args.file);
if (!existsSync(sourcePath)) fail(`file not found: ${sourcePath}`);
const { text, encoding } = decode(readFileSync(sourcePath));
const parsed = parseCsv(text.replace(/^\uFEFF/, ""));
if (parsed.length <= definition.headerRow) fail("CSVにヘッダー行がありません");

const header = parsed[definition.headerRow].map(clean);
const missingHeaders = definition.required.filter((name) => !header.includes(name));
if (missingHeaders.length) {
  print({ status: "invalid", channel: args.channel, source_file: sourcePath, encoding, missing_headers: missingHeaders });
  process.exit(0);
}

const rows = parsed.slice(definition.headerRow + 1).filter((row) => row.some((value) => clean(value)));
const objects = rows.map((row) => Object.fromEntries(header.map((name, index) => [name, clean(row[index])])));
const issues = new Set();
const inPeriod = [];
let outsidePeriodRows = 0;

for (const row of objects) {
  if (definition.review) {
    const issue = definition.review(row);
    if (issue) issues.add(issue);
  }
  if (!definition.date) {
    inPeriod.push(row);
    continue;
  }
  const date = parseDate(row[definition.date]);
  if (!date) {
    issues.add(`${definition.date}を解釈できない行があります`);
    continue;
  }
  if (date >= args.start && date <= args.end) inPeriod.push(row);
  else outsidePeriodRows += 1;
}

if (definition.metadataPeriod) {
  const metadata = parsed.slice(0, definition.headerRow).flat().map(clean).join(" ");
  const expectedStart = japaneseDate(args.start);
  const expectedEnd = japaneseDate(args.end);
  if (!metadata.includes(expectedStart) || !metadata.includes(expectedEnd)) {
    issues.add(`表示期間が一致しません（期待: ${expectedStart}から${expectedEnd}）`);
  }
}

const selectedRows = definition.date ? inPeriod : objects;
const zeroEvidence = args.channel === "qoo10" && selectedRows.length === 0
  ? validateQoo10ZeroEvidence(args["zero-evidence"], args)
  : { required: false, valid: false, file: null, screenshots: [], issue: null };
if (zeroEvidence.issue) issues.add(zeroEvidence.issue);
const importPath = args.out ? resolve(args.out) : sourcePath;
if (args.out) {
  const prefix = parsed.slice(0, definition.headerRow);
  const outputRows = [...prefix, header, ...selectedRows.map((row) => header.map((name) => row[name] ?? ""))];
  writeFileSync(importPath, `\uFEFF${stringifyCsv(outputRows)}`, "utf8");
}

const totalQuantity = selectedRows.reduce((sum, row) => sum + numberValue(row[definition.quantity]), 0);
const blankTitles = selectedRows.filter((row) => !clean(row["商品名"] ?? row["タイトル"])).length;
if (blankTitles > 0) issues.add(`商品名またはタイトル空欄: ${blankTitles}行`);

print({
  status: issues.size ? "needs_review" : "valid",
  channel: args.channel,
  source_file: sourcePath,
  import_file: importPath,
  encoding,
  header_row: definition.headerRow + 1,
  source_rows: objects.length,
  import_rows: selectedRows.length,
  outside_period_rows: outsidePeriodRows,
  total_quantity: totalQuantity,
  period: { start: args.start, end: args.end, file_date_column: definition.date || null },
  date_validated_from_file: Boolean((definition.date && objects.length > 0) || definition.metadataPeriod),
  date_validated_from_evidence: zeroEvidence.valid,
  zero_evidence_required: zeroEvidence.required,
  zero_evidence_valid: zeroEvidence.valid,
  zero_evidence_file: zeroEvidence.file,
  zero_evidence_screenshots: zeroEvidence.screenshots,
  issues: [...issues],
});

function validateQoo10ZeroEvidence(value, options) {
  const invalid = (issue) => ({ required: true, valid: false, file: null, screenshots: [], issue });
  if (!value) return invalid("Qoo10の0件を証明する公式画面証跡がありません");

  const evidencePath = resolve(value);
  if (!existsSync(evidencePath)) return invalid("Qoo10の0件証跡ファイルが見つかりません");

  let evidence;
  try {
    evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch {
    return invalid("Qoo10の0件証跡JSONを解析できません");
  }

  if (evidence?.schema_version !== 2
    || evidence?.channel !== "qoo10"
    || evidence?.account_label !== "会津ブランド館"
    || evidence?.official_url !== "https://qsm.qoo10.jp/GMKT.INC.Gsm.Web/Delivery/DeliveryManagementPrime.aspx"
    || evidence?.date_basis !== "注文日"
    || evidence?.start_time !== "00:00"
    || evidence?.end_time !== "23:50"
    || evidence?.period_start !== options.start
    || evidence?.period_end !== options.end) {
    return invalid("Qoo10の0件証跡が店舗・期間・日付基準と一致しません");
  }

  const expectedStatuses = new Map([
    ["入金待ち", "D1"],
    ["配送要請", "D2"],
    ["配送中", "D3"],
    ["配送完了", "D4"],
  ]);
  const results = Array.isArray(evidence.status_results) ? evidence.status_results : [];
  if (results.length !== expectedStatuses.size
    || new Set(results.map((entry) => entry?.status)).size !== expectedStatuses.size
    || [...expectedStatuses.keys()].some((status) => !results.some((entry) => entry?.status === status))) {
    return invalid("Qoo10の0件証跡に全配送状態の確認結果がありません");
  }

  const evidenceRoot = resolve(dirname(evidencePath));
  const evidenceRootPrefix = `${evidenceRoot.toLowerCase().replace(/[\\/]+$/, "")}${sep}`;
  const screenshots = [];
  for (const entry of results) {
    if (entry.result_count !== 0
      || entry.status_code !== expectedStatuses.get(entry.status)
      || entry.result_grid_id !== "GoodsGrid"
      || entry.empty_marker !== "表示する行がありません"
      || entry.page_total !== 0
      || entry.period_start !== options.start
      || entry.period_end !== options.end
      || entry.start_time !== "00:00"
      || entry.end_time !== "23:50"
      || typeof entry.screenshot_file !== "string"
      || basename(entry.screenshot_file) !== entry.screenshot_file
      || !/\.png$/i.test(entry.screenshot_file)
      || !/^[0-9a-f]{64}$/i.test(String(entry.screenshot_sha256 || ""))) {
      return invalid(`Qoo10の${entry?.status || "不明"}証跡が不完全です`);
    }
    const screenshotPath = resolve(evidenceRoot, entry.screenshot_file);
    if (!screenshotPath.toLowerCase().startsWith(evidenceRootPrefix)
      || !existsSync(screenshotPath)
      || readFileSync(screenshotPath).length < 5_000) {
      return invalid(`Qoo10の${entry.status}画面証跡が見つかりません`);
    }
    const actualHash = createHash("sha256").update(readFileSync(screenshotPath)).digest("hex");
    if (actualHash !== String(entry.screenshot_sha256).toLowerCase()) {
      return invalid(`Qoo10の${entry.status}画面証跡が作成後に変わっています`);
    }
    screenshots.push(screenshotPath);
  }

  return {
    required: true,
    valid: true,
    file: evidencePath,
    screenshots,
    issue: null,
  };
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key.startsWith("--")) continue;
    result[key.slice(2)] = values[index + 1];
    index += 1;
  }
  return result;
}

function decode(bytes) {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("shift_jis").decode(bytes), encoding: "shift_jis" };
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

function stringifyCsv(rows) {
  return `${rows.map((row) => row.map((value) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(",")).join("\r\n")}\r\n`;
}

function parseDate(value) {
  const input = clean(value).replace(/^'/, "").replace(/\t/g, "");
  let match = input.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  match = input.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  return null;
}

function japaneseDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return `${year}年${String(month).padStart(2, "0")}月${String(day).padStart(2, "0")}日`;
}

function clean(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").trim();
}

function numberValue(value) {
  const number = Number.parseFloat(clean(value).replace(/[,，\s]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
