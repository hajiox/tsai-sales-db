import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import XLSX from "xlsx";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Supabase environment variables are not set");

const supabase = createClient(url, serviceKey);
const downloads = path.join(os.homedir(), "Downloads");
const inputPath = process.argv[2] || findYahooWorkbook(downloads);
if (!inputPath) throw new Error("Yahoo conversion workbook was not found");

const workbook = XLSX.readFile(inputPath, { raw: false });
const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
  header: 1,
  defval: "",
  raw: false,
});

const sourceMappings = deduplicateByCode(
  rows.slice(1).map((row) => ({
    yahooName: clean(row[0]),
    yahooItemId: clean(row[1]),
    labelName: clean(row[2]),
    deliveryPattern: normalizeDeliveryPattern(row[3]),
  })),
);

for (const orderMapping of readOrderOnlyMappings(downloads)) {
  if (!sourceMappings.some((mapping) => mapping.yahooItemId === orderMapping.yahooItemId)) {
    sourceMappings.push(orderMapping);
  }
}

const { data: existing, error: selectError } = await supabase
  .from("shipping_label_mappings")
  .select("*")
  .order("sort_order", { ascending: true });
if (selectError) throw selectError;

const claimedExistingIds = new Map();
let linked = 0;
let inserted = 0;
let updated = 0;
let unresolved = 0;
const maxSortOrder = Math.max(0, ...(existing || []).map((row) => Number(row.sort_order) || 0));

for (const [index, source] of sourceMappings.entries()) {
  if (!source.yahooItemId) continue;
  const direct = (existing || []).find((row) => row.yahoo_item_id === source.yahooItemId);
  const complement = direct || findComplement(source, existing || []);
  const alreadyClaimedBy = complement ? claimedExistingIds.get(complement.id) : undefined;
  const canLink = complement && (!alreadyClaimedBy || alreadyClaimedBy === source.yahooItemId);

  const payload = {
    yahoo_item_id: source.yahooItemId,
    yahoo_name: source.yahooName,
    label_name: source.labelName || complement?.label_name || source.yahooName,
    delivery_pattern:
      source.deliveryPattern !== "未設定"
        ? source.deliveryPattern
        : complement?.delivery_pattern || "未設定",
  };

  if (canLink) {
    claimedExistingIds.set(complement.id, source.yahooItemId);
    const { error } = await supabase
      .from("shipping_label_mappings")
      .update(payload)
      .eq("id", complement.id);
    if (error) throw error;
    if (direct) updated += 1;
    else linked += 1;
    continue;
  }

  const { error } = await supabase.from("shipping_label_mappings").insert({
    sku: null,
    amazon_name: "",
    amazon_pattern: "",
    sort_order: maxSortOrder + index + 1,
    ...payload,
  });
  if (error) throw error;
  inserted += 1;
  if (payload.delivery_pattern === "未設定") unresolved += 1;
}

console.log(JSON.stringify({
  inputPath,
  sourceMappings: sourceMappings.length,
  linked,
  updated,
  inserted,
  unresolved,
}, null, 2));

function findYahooWorkbook(directory) {
  return fs
    .readdirSync(directory)
    .filter((name) => name.toLowerCase().includes("yahoo") && name.toLowerCase().endsWith(".xlsx"))
    .map((name) => path.join(directory, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

function readOrderOnlyMappings(directory) {
  const found = new Map();
  const csvFiles = fs
    .readdirSync(directory)
    .filter((name) => name.toLowerCase().includes("yahoo") && name.toLowerCase().endsWith(".csv"));

  for (const fileName of csvFiles) {
    const bytes = fs.readFileSync(path.join(directory, fileName));
    const decoded = new TextDecoder("shift-jis").decode(bytes);
    const csvWorkbook = XLSX.read(decoded, { type: "string", raw: false });
    const orderRows = XLSX.utils.sheet_to_json(csvWorkbook.Sheets[csvWorkbook.SheetNames[0]], {
      defval: "",
      raw: false,
    });

    for (const row of orderRows) {
      const itemIds = parseLineField(row.ItemId);
      const titles = parseLineField(row.Title);
      for (const [key, yahooItemId] of itemIds) {
        if (!yahooItemId || found.has(yahooItemId)) continue;
        const yahooName = titles.get(key) || clean(row.Title);
        found.set(yahooItemId, {
          yahooItemId,
          yahooName,
          labelName: "",
          deliveryPattern: normalizeDeliveryPattern(row.ShipMethodName),
        });
      }
    }
  }
  return Array.from(found.values());
}

function parseLineField(value) {
  const source = clean(value);
  const result = new Map();
  const matches = Array.from(source.matchAll(/(?:^|&)L(\d+)=/g));
  if (!matches.length) {
    if (source) result.set("L1", source);
    return result;
  }
  for (const [index, match] of matches.entries()) {
    const start = (match.index || 0) + match[0].length;
    const end = matches[index + 1]?.index ?? source.length;
    result.set(`L${match[1]}`, source.slice(start, end));
  }
  return result;
}

function findComplement(source, existingRows) {
  const sourceName = normalizeName(source.yahooName);
  const sourceLabel = normalizeName(source.labelName);
  const scored = existingRows
    .filter((row) => !row.yahoo_item_id)
    .map((row) => {
      const amazonName = normalizeName(row.amazon_name);
      const labelName = normalizeName(row.label_name);
      let score = 0;
      if (sourceName && amazonName === sourceName) score = 100;
      else if (sourceLabel && labelName === sourceLabel) score = 95;
      else if (
        sourceName &&
        amazonName &&
        Math.min(sourceName.length, amazonName.length) >= 20 &&
        (sourceName.includes(amazonName) || amazonName.includes(sourceName))
      ) score = 80;
      else if (
        sourceLabel &&
        labelName &&
        Math.min(sourceLabel.length, labelName.length) >= 12 &&
        (sourceLabel.includes(labelName) || labelName.includes(sourceLabel))
      ) score = 60;
      return { row, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length || (scored[1] && scored[1].score === scored[0].score)) return null;
  return scored[0].row;
}

function normalizeName(value) {
  return clean(value)
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(/yahoo|amazon|ショッピング|限定商品|激安|送料無料|会津ブランド館/g, "")
    .replace(/[\s\u3000【】\[\]()（）・、,._\-ー～~!！?？「」『』×]/g, "");
}

function normalizeDeliveryPattern(value) {
  const normalized = clean(value);
  if (normalized.includes("冷凍")) return "冷凍";
  if (normalized.includes("冷蔵")) return "冷蔵";
  if (normalized.includes("ネコポス")) return "ネコポス";
  if (normalized.includes("通常")) return "通常";
  return "未設定";
}

function deduplicateByCode(rows) {
  const unique = new Map();
  for (const row of rows) {
    if (!row.yahooItemId) continue;
    const current = unique.get(row.yahooItemId);
    if (!current) unique.set(row.yahooItemId, row);
    else {
      unique.set(row.yahooItemId, {
        yahooItemId: row.yahooItemId,
        yahooName: current.yahooName || row.yahooName,
        labelName: current.labelName || row.labelName,
        deliveryPattern: current.deliveryPattern !== "未設定" ? current.deliveryPattern : row.deliveryPattern,
      });
    }
  }
  return Array.from(unique.values());
}

function clean(value) {
  return String(value ?? "").trim();
}
