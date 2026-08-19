import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(repoRoot, ".env.local") });

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const archiveRoot = valueAfter("--archive")
  || process.env.TSA_EC_PROFIT_ARCHIVE_ROOT
  || "\\\\tshdd\\disk\\OneDrive共有\\【共有】【事業】ネット通販総合\\EC月次利益";
const yahooDir = path.join(archiveRoot, "Yahoo");

const files = fs.readdirSync(yahooDir);
const receiptFiles = files
  .filter((name) => /receipt-detail\.original\.(csv|txt)$/i.test(name) || name === "Yahoo_受取明細_2026-07.txt")
  .map((name) => path.join(yahooDir, name));

const amounts = new Map();
for (const file of receiptFiles) {
  const month = monthFromName(path.basename(file));
  if (!month) continue;
  const amount = file.toLowerCase().endsWith(".csv")
    ? couponTotalFromCsv(file)
    : couponTotalFromSnapshot(file);
  amounts.set(month, { amount, file });
}

const rows = Array.from(amounts, ([month, value]) => ({ month, ...value }))
  .sort((a, b) => a.month.localeCompare(b.month));

for (const row of rows) {
  console.log(`${row.month}: ${row.amount.toLocaleString("ja-JP")} JPY (${path.basename(row.file)})`);
}

if (!apply) {
  console.log("Dry run only. Add --apply to update ec_profit_monthly.");
  process.exit(0);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Supabase service credentials are missing.");
const supabase = createClient(supabaseUrl, serviceKey);

for (const row of rows) {
  const reportMonth = `${row.month}-01`;
  const { data: existing, error: readError } = await supabase
    .from("ec_profit_monthly")
    .select("raw_summary")
    .eq("channel", "yahoo")
    .eq("report_month", reportMonth)
    .single();
  if (readError) throw readError;

  const rawSummary = existing?.raw_summary && typeof existing.raw_summary === "object"
    ? existing.raw_summary
    : {};
  const note = `Yahoo公式受取明細の「モールクーポン利用料」税込合計 ${row.amount.toLocaleString("ja-JP")}円をYahoo原資クーポン補填として記録。商品別売上・受取総額の差額および「特典の一部利用料」は補填額に含めていない。`;
  const { error: updateError } = await supabase
    .from("ec_profit_monthly")
    .update({
      raw_summary: {
        ...rawSummary,
        excluded_marketplace_funded_discounts: row.amount,
        marketplace_funded_discount_basis: "Yahoo受取明細 モールクーポン利用料（税込）",
        marketplace_funded_discount_source: path.basename(row.file),
        marketplace_funded_discount_verified_at: new Date().toISOString(),
      },
      notes: note,
      updated_at: new Date().toISOString(),
    })
    .eq("channel", "yahoo")
    .eq("report_month", reportMonth);
  if (updateError) throw updateError;
}

console.log(`Updated ${rows.length} Yahoo monthly rows.`);

function couponTotalFromCsv(file) {
  const text = iconv.decode(fs.readFileSync(file), "cp932").replace(/^\uFEFF/, "");
  const records = parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true });
  return records
    .filter((row) => String(row["利用項目"] || "").trim() === "モールクーポン利用料")
    .reduce((sum, row) => sum + money(row["金額（税込）"]), 0);
}

function couponTotalFromSnapshot(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  return lines.reduce((sum, original) => {
    const line = original.includes("モールクーポン利用料") ? original : repairMojibake(original);
    if (!line.includes('- row "モールクーポン利用料')) return sum;
    const values = Array.from(line.matchAll(/\d[\d,]*/g), (match) => money(match[0]));
    return sum + (values.at(-1) || 0);
  }, 0);
}

function repairMojibake(value) {
  return iconv.decode(iconv.encode(value, "cp932"), "utf8");
}

function money(value) {
  const parsed = Number(String(value || "0").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthFromName(name) {
  const rangeMatch = name.match(/yahoo-(\d{4}-\d{2})-\d{2}_/i);
  if (rangeMatch) return rangeMatch[1];
  const simpleMatch = name.match(/(\d{4}-\d{2})/);
  return simpleMatch?.[1] || null;
}

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}
