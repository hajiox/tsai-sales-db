import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { parse } from 'csv-parse/sync';
import iconv from 'iconv-lite';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { classifyYahooStatement } from '../lib/yahoo-settlement-classification.ts';

dotenv.config({ path: '.env.local', quiet: true });
const archive = String.raw`\\tshdd\disk\OneDrive共有\【共有】【事業】ネット通販総合\EC月次利益\Yahoo`;
const prefix = 'yahoo-2026-08-01_2026-08-31-';
const files = [1, 2, 3].map(n => `${prefix}billing_202608-${n}.original.csv`);
const receiptFile = `${prefix}receipt_202608.original.csv`;
function read(name) {
  const rows = parse(iconv.decode(fs.readFileSync(path.join(archive, name)), 'cp932'), { columns: true, skip_empty_lines: true });
  for (const row of rows) {
    assert.match(row['利用日'], /^2026\/(08\/\d\d|07\/27)$/);
    assert.match(row['金額（税込）'], /^\d+(\.\d+)?$/);
  }
  return rows;
}
function aggregate(rows) {
  const items = new Map();
  for (const row of rows) items.set(row['利用項目'], (items.get(row['利用項目']) || 0) + Number(row['金額（税込）']));
  return [...items].map(([name, amount]) => ({ name, amount }));
}
const statement = { billing: aggregate(files.flatMap(read)), receipts: aggregate(read(receiptFile)) };
const classified = classifyYahooStatement(statement);
assert.equal(classified.net_payout, 2913665);
assert.equal(classified.excluded_ad_costs, 473047);
const keys = ['refunds', 'platform_fees', 'payment_fees', 'seller_discounts', 'seller_coupons', 'seller_points', 'shipping_costs', 'other_costs'];
const deduction = row => keys.reduce((sum, key) => sum + Number(row[key] || 0), 0) - Number(row.other_credits || 0);
assert.equal(deduction(classified), 470764);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
const { data: current, error } = await db.from('ec_profit_monthly').select('*').eq('channel', 'yahoo').eq('report_month', '2026-08-01').single();
if (error) throw error;
const beforeTotal = deduction(current) + Number(current.raw_summary.excluded_ad_costs);
const afterTotal = deduction({ ...current, ...classified }) + classified.excluded_ad_costs;
assert.equal(afterTotal, beforeTotal, 'Reclassification must conserve combined costs');
const { excluded_ad_costs, excluded_marketplace_funded_discounts, ...columns } = classified;
const corrected = { ...current, ...columns };
const calculatedPayout = current.gross_sales - deduction(corrected);
const note = '2026-09-06公式請求・受取CSV再集計。PRオプション129,235円・プロモーションパッケージ118,052円と取消返金233円を広告費に統一。EC控除470,764円、広告費473,047円、合計943,811円。入金額2,913,665円は不変。売上と精算期間の差は残るためpartialを維持。';
const patch = {
  ...columns,
  notes: note,
  raw_summary: { ...current.raw_summary, ...classified, yahoo_statement: statement, classification_version: 'yahoo-statement-v1', notes: note, calculated_payout: calculatedPayout, payout_difference: current.net_payout - calculatedPayout },
  updated_at: new Date().toISOString(),
};
console.log(JSON.stringify({ before: { ec: deduction(current), ads: current.raw_summary.excluded_ad_costs }, after: { ec: deduction(corrected), ads: excluded_ad_costs }, combined: afterTotal }));
if (process.argv.includes('--apply')) {
  fs.mkdirSync('tmp', { recursive: true });
  fs.writeFileSync(`tmp/yahoo-august-before-${Date.now()}.json`, JSON.stringify(current, null, 2));
  const result = await db.from('ec_profit_monthly').update(patch).eq('id', current.id).eq('updated_at', current.updated_at).select('id');
  if (result.error) throw result.error;
  assert.equal(result.data.length, 1, 'Concurrent update detected');
  const verify = await db.from('ec_profit_monthly').select('*').eq('id', current.id).single();
  if (verify.error) throw verify.error;
  assert.equal(deduction(verify.data), 470764);
  assert.equal(verify.data.raw_summary.excluded_ad_costs, 473047);
  console.log('Applied and read-back verified.');
} else console.log('Dry run only.');
