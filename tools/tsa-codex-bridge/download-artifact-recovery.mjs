import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { basename, extname, join, resolve, sep } from "node:path";

const REPORT_EXTENSION = /\.(csv|zip|xlsx|xls|txt|json|pdf)$/i;
const AD_EXTENSION = /\.(csv|zip|xlsx|xls)$/i;

export function snapshotReportArtifacts(directory) {
  const snapshot = {};
  if (!existsSync(directory)) return snapshot;
  for (const name of readdirSync(directory)) {
    const filePath = join(directory, name);
    if (!REPORT_EXTENSION.test(name)) continue;
    try {
      const stat = statSync(filePath);
      if (!stat.isFile()) continue;
      snapshot[pathKey(filePath)] = { size: stat.size, mtimeMs: stat.mtimeMs };
    } catch {
      // A file still being finalized is considered new on the next scan.
    }
  }
  return snapshot;
}

export function extractReportArtifactPaths(result, allowedRoots) {
  const roots = allowedRoots.map((root) => resolve(root));
  const values = [
    ...(Array.isArray(result?.source_files) ? result.source_files : []),
    result?.summary,
    result?.details,
  ];
  const found = [];
  for (const value of values) {
    const text = String(value || "");
    if (isSupportedReport(text) && isInsideRoots(text, roots) && existsFile(text)) found.push(resolve(text));
    const matches = text.match(/(?:[A-Za-z]:\\|\\\\)[^\r\n"<>|?*]+?\.(?:csv|zip|xlsx|xls|txt|json|pdf)/gi) || [];
    for (const match of matches) {
      const cleaned = match.trim().replace(/[。．、,;:]+$/, "");
      if (isInsideRoots(cleaned, roots) && existsFile(cleaned)) found.push(resolve(cleaned));
    }
  }
  return uniquePaths(found);
}

export function findReportArtifactCandidates({
  downloadsDir,
  snapshot = {},
  taskKey,
  channel,
  startDate,
  endDate,
  includeExisting = false,
  explicitPaths = [],
}) {
  const explicit = new Set(explicitPaths.map(pathKey));
  const candidates = [];
  if (!existsSync(downloadsDir)) return candidates;
  for (const name of readdirSync(downloadsDir)) {
    const filePath = resolve(downloadsDir, name);
    if (!REPORT_EXTENSION.test(name) || (taskKey === "ad_cost_import" && !AD_EXTENSION.test(name))) continue;
    let stat;
    try {
      stat = statSync(filePath);
      if (!stat.isFile() || stat.size <= 0) continue;
    } catch {
      continue;
    }
    const previous = snapshot[pathKey(filePath)];
    const changed = !previous || previous.size !== stat.size || previous.mtimeMs !== stat.mtimeMs;
    const isExplicit = explicit.has(pathKey(filePath));
    if (!includeExisting && !changed && !isExplicit) continue;
    const score = reportArtifactScore({ taskKey, channel, filePath, startDate, endDate });
    if (score < 80) continue;
    candidates.push({
      path: filePath,
      score: score + (isExplicit ? 1000 : 0) + (changed ? 100 : 0),
      changed,
      explicit: isExplicit,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    });
  }
  return candidates.sort((left, right) => right.score - left.score || right.mtimeMs - left.mtimeMs);
}

export function isReportArtifactForPeriod({ taskKey, channel, filePath, startDate, endDate }) {
  if (!existsFile(filePath) || !isSupportedReport(filePath)) return false;
  return reportArtifactScore({ taskKey, channel, filePath, startDate, endDate }) >= 80;
}

export function stageReportArtifact({ sourcePath, targetDir, channel, startDate, endDate, taskKey }) {
  const source = resolve(sourcePath);
  if (!existsFile(source) || !isSupportedReport(source)) throw new Error(`回収対象レポートが見つかりません: ${source}`);
  mkdirSync(targetDir, { recursive: true });
  const extension = extname(source).toLowerCase();
  const period = `${channel}-${startDate}_${endDate}`;
  const desiredName = taskKey === "ad_cost_import"
    ? `${period}.original${extension}`
    : `${period}-${safeStem(basename(source, extension))}.original${extension}`;
  return copyWithoutOverwrite(source, targetDir, desiredName);
}

export function archiveStagedReport(sourcePath, archiveDir) {
  const source = resolve(sourcePath);
  if (!existsFile(source) || !/\.original\.(csv|zip|xlsx|xls|txt|json|pdf)$/i.test(source)) {
    throw new Error(`共有保存できる原本名ではありません: ${source}`);
  }
  mkdirSync(archiveDir, { recursive: true });
  return copyWithoutOverwrite(source, archiveDir, basename(source));
}

function reportArtifactScore({ taskKey, channel, filePath, startDate, endDate }) {
  const storedName = basename(filePath).toLowerCase();
  const archivePrefix = `${channel}-${startDate}_${endDate}-`.toLowerCase();
  // The archive prefix describes where Bridge stored the file, not what the
  // original report contains. Ignore one such prefix when validating evidence.
  const name = taskKey === "ec_profit_import"
    && /\.original\.(csv|zip|xlsx|xls|txt|json|pdf)$/i.test(storedName)
    && storedName.startsWith(archivePrefix)
    ? storedName.slice(archivePrefix.length)
    : storedName;
  const extension = extname(name);
  const text = extension === ".csv" || extension === ".txt" || extension === ".json"
    ? readTextSample(filePath)
    : "";
  const generatedAtName = (taskKey === "ad_cost_import" && channel === "rakuten" && /^rpp_item_reports_/i.test(name))
    || (taskKey === "ec_profit_import" && channel === "qoo10" && /^deliverymanagement_detail_/i.test(name))
    || (taskKey === "ec_profit_import" && channel === "base" && /aizubrand.*official.*ec/i.test(name))
    || (taskKey === "ec_profit_import" && channel === "tiktok" && /^income_\d{14}/i.test(name));
  const namedAmazonMonth = taskKey === "ec_profit_import" && channel === "amazon"
    ? amazonMonthlyTransactionMonth(name)
    : null;
  const periodScore = namedAmazonMonth
    ? (namedAmazonMonth === String(startDate).slice(0, 7) ? 30 : 0)
    : periodEvidenceScore(generatedAtName ? text : `${name}\n${text}`, startDate, endDate);
  let score = periodScore;

  if (taskKey === "ad_cost_import") {
    if (channel === "meta" && (/^\d+_-_-_\d{4}_\d{2}_\d{2}-_-\d{4}_\d{2}_\d{2}.*\.csv$/i.test(name)
      || (/レポート開始日/.test(text) && /消化金額/.test(text) && /広告セット名/.test(text)))) score += 100;
    if (channel === "rakuten" && (/^rpp_item_reports_.*\.zip$/i.test(name)
      || (/商品管理番号/.test(text) && /(?:rpp|実績額|広告費)/i.test(text)))) score += 100;
    if (channel === "yahoo" && ((/広告詳細レポート/.test(name) && /アイテムリーチ/.test(name))
      || (/商品コード/.test(text) && /利用金額/.test(text) && /roas/i.test(text)))) score += 100;
    if (channel === "amazon" && (/(?:sponsored|advertised|amazon).*(?:product|広告|report)/i.test(name)
      || /スポンサープロダクト広告.*広告対象商品.*レポート/i.test(name)
      || (/(?:開始日|Start Date)/i.test(text) && /(?:広告費|Spend|Cost)/i.test(text)))) score += 100;
    return score;
  }

  let channelMatched = false;
  if (channel === "mercari" && (/^\d{6}-\d{6}_report/i.test(name)
    || (/販売利益/.test(text) && /販売手数料/.test(text) && /売上移転日/.test(text)))) channelMatched = true;
  if (channel === "base" && (/aizubrand.*official.*ec/i.test(name)
    || (/注文ID/.test(text) && /注文日時/.test(text) && /支払い方法/.test(text)))) channelMatched = true;
  if (channel === "qoo10" && (/deliverymanagement_detail/i.test(name)
    || (/配送状態/.test(text) && /カート番号/.test(text) && /購入者決済金額/.test(text)))
    && csvColumnHasDateInPeriod(text, "注文日", startDate, endDate)) channelMatched = true;
  if (channel === "rakuten" && (/item_saleslist/i.test(name)
    || (/商品別売上/.test(text) && /表示期間/.test(text)))) channelMatched = true;
  if (channel === "amazon" && (/(?:date.?range|transaction|settlement).*(?:report)?/i.test(name)
    || (/(?:transaction.?type|トランザクション)/i.test(text) && /(?:amazon fees|Amazon手数料|合計)/i.test(text)))) channelMatched = true;
  if (channel === "yahoo" && (/(?:利用詳細|受取明細|請求明細|billing|receipt)/i.test(name)
    || (/注文ID/.test(text) && /(?:モールクーポン|決済手数料|利用料)/.test(text)))) channelMatched = true;
  if (channel === "tiktok" && (/(?:^|[-_])(tiktok|statement|settlement|payout)(?:[-_.]|$)/i.test(name)
    || /^income[_-]\d+/i.test(name))) channelMatched = true;

  // Existing Downloads files are reusable only when both the channel and requested
  // period are evidenced by the file itself. An explicit Codex path is not proof.
  return channelMatched && periodScore > 0 ? score + 100 : 0;
}

function amazonMonthlyTransactionMonth(name) {
  const match = String(name || "").match(/(20\d{2})(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)monthlytransaction/i);
  if (!match) return null;
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    .indexOf(match[2].toLowerCase()) + 1;
  return `${match[1]}-${String(month).padStart(2, "0")}`;
}

function periodEvidenceScore(text, startDate, endDate) {
  const start = dateTokens(startDate);
  const end = dateTokens(endDate);
  const hasStart = start.some((token) => text.includes(token));
  const hasEnd = end.some((token) => text.includes(token));
  const month = String(startDate).slice(0, 7);
  const [year, monthNumber] = month.split("-");
  const hasMonth = [month, month.replace("-", "/"), `${year}/${Number(monthNumber)}`, `${year}${monthNumber}`, `${year}年${Number(monthNumber)}月`]
    .some((token) => text.includes(token));
  return hasStart && hasEnd ? 30 : hasMonth ? 15 : 0;
}

function dateTokens(value) {
  const [year, month, day] = String(value).split("-");
  return [
    `${year}-${month}-${day}`,
    `${year}/${month}/${day}`,
    `${year}/${Number(month)}/${Number(day)}`,
    `${year}_${month}_${day}`,
    `${year}年${Number(month)}月${Number(day)}日`,
  ];
}

function readTextSample(filePath) {
  try {
    const bytes = readFileSync(filePath).subarray(0, 256_000);
    const utf8 = bytes.toString("utf8");
    let shiftJis = "";
    try { shiftJis = new TextDecoder("shift_jis").decode(bytes); } catch { /* optional ICU decoder */ }
    return `${utf8}\n${shiftJis}`;
  } catch {
    return "";
  }
}

function csvColumnHasDateInPeriod(text, columnName, startDate, endDate) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return false;
  const header = parseCsvLine(lines[0]);
  const index = header.indexOf(columnName);
  if (index < 0) return false;
  for (const line of lines.slice(1)) {
    const value = parseCsvLine(line)[index] || "";
    const match = value.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (!match) continue;
    const normalized = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    if (normalized >= startDate && normalized <= endDate) return true;
  }
  return false;
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

function copyWithoutOverwrite(sourcePath, targetDir, desiredName) {
  const source = resolve(sourcePath);
  let target = resolve(targetDir, desiredName);
  if (pathKey(source) === pathKey(target)) return target;
  if (existsSync(target)) {
    if (readFileSync(target).equals(readFileSync(source))) return target;
    const extension = extname(desiredName);
    const stem = desiredName.slice(0, -extension.length);
    const digest = createHash("sha256").update(readFileSync(source)).digest("hex").slice(0, 10);
    target = resolve(targetDir, `${stem}-${digest}${extension}`);
    if (existsSync(target)) {
      if (readFileSync(target).equals(readFileSync(source))) return target;
      throw new Error(`同名の異なる原本が既にあります: ${target}`);
    }
  }
  copyFileSync(source, target);
  return target;
}

function safeStem(value) {
  const normalized = String(value || "report")
    .replace(/\.original$/i, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim()
    .slice(0, 120);
  return normalized || "report";
}

function isSupportedReport(filePath) {
  return REPORT_EXTENSION.test(String(filePath || ""));
}

function existsFile(filePath) {
  try { return statSync(resolve(filePath)).isFile(); } catch { return false; }
}

function isInsideRoots(filePath, roots) {
  try {
    const candidate = pathKey(filePath);
    return roots.some((root) => candidate === pathKey(root) || candidate.startsWith(`${pathKey(root)}${sep}`));
  } catch {
    return false;
  }
}

function pathKey(filePath) {
  return resolve(String(filePath || "")).toLowerCase();
}

function uniquePaths(paths) {
  const seen = new Set();
  return paths.filter((filePath) => {
    const key = pathKey(filePath);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
