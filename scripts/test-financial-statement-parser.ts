import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseFinancialStatementText,
  parseJapaneseEraDate,
  parseJapaneseFinancialNumber,
} from '../lib/finance/financial-statement-parser';

const sourcePath = process.env.TSA_FINANCIAL_STATEMENT_TEXT;
if (!sourcePath) throw new Error('TSA_FINANCIAL_STATEMENT_TEXT is required');
const source = readFileSync(resolve(sourcePath), 'utf8');
const parsed = parseFinancialStatementText(source);

assert.equal(parsed.companyName, '株式会社テクニカルスタッフ');
assert.equal(parsed.periodNumber, 19);
assert.equal(parsed.fiscalPeriod, 19);
assert.equal(parsed.periodStart, '2024-08-01');
assert.equal(parsed.periodEnd, '2025-07-31');
assert.equal(parsed.pageCount, 7);

assert.deepEqual(
  {
    cash_and_deposits: parsed.metrics.cash_and_deposits,
    accounts_receivable: parsed.metrics.accounts_receivable,
    inventory: parsed.metrics.inventory,
    accounts_payable: parsed.metrics.accounts_payable,
    long_term_borrowings: parsed.metrics.long_term_borrowings,
    lease_obligations: parsed.metrics.lease_obligations,
    total_assets: parsed.metrics.total_assets,
    total_liabilities: parsed.metrics.total_liabilities,
    net_assets: parsed.metrics.net_assets,
  },
  {
    cash_and_deposits: 24_661_047,
    accounts_receivable: 12_582_748,
    inventory: 16_729_453,
    accounts_payable: 9_191_380,
    long_term_borrowings: 85_449_620,
    lease_obligations: 4_868_930,
    total_assets: 83_609_178,
    total_liabilities: 113_774_476,
    net_assets: -30_165_298,
  },
);

assert.deepEqual(
  {
    beginning_inventory: parsed.metrics.beginning_inventory,
    purchases: parsed.metrics.purchases,
    ending_inventory: parsed.metrics.ending_inventory,
    inventory_change: parsed.metrics.inventory_change,
    cogs: parsed.metrics.cogs,
    net_sales: parsed.metrics.net_sales,
    gross_profit: parsed.metrics.gross_profit,
    sga: parsed.metrics.sga,
    operating_income: parsed.metrics.operating_income,
    ordinary_income: parsed.metrics.ordinary_income,
    net_income: parsed.metrics.net_income,
    interest_expense: parsed.metrics.interest_expense,
  },
  {
    beginning_inventory: 14_789_842,
    purchases: 136_448_583,
    ending_inventory: 16_729_453,
    inventory_change: 1_939_611,
    cogs: 134_508_972,
    net_sales: 245_659_908,
    gross_profit: 111_150_936,
    sga: 114_098_204,
    operating_income: -2_947_268,
    ordinary_income: 2_607_492,
    net_income: 2_485_492,
    interest_expense: 1_115_891,
  },
);

assert.equal(parsed.validation.balanceSheet.passed, true);
assert.equal(parsed.validation.balanceSheet.difference, 0);
assert.equal(parsed.validation.incomeStatement.passed, true);
assert.ok(parsed.validation.incomeStatement.checks.every((check) => check.passed === true));
assert.deepEqual(parsed.warnings, []);

assert.ok(parsed.accounts.balanceSheet.length >= 30);
assert.ok(parsed.accounts.incomeStatement.length >= 15);
assert.ok(parsed.accounts.sellingGeneralAdministrative.length >= 20);
assert.ok(parsed.accounts.equityChanges.length >= 8);
assert.ok(parsed.accounts.notes.length >= 10);

assert.equal(parseJapaneseFinancialNumber('△１２，３４５'), -12_345);
assert.equal(parseJapaneseFinancialNumber('▲ 9,876'), -9_876);
assert.equal(parseJapaneseFinancialNumber('（ 2,485,492 ）'), 2_485_492);
assert.equal(parseJapaneseEraDate('令 和 ７ 年 ７ 月 ３１ 日'), '2025-07-31');

const lossWithoutTriangle = parseFinancialStatementText(`
===== PAGE 1 =====
第 ２ ０ 期
株式会社 サンプル
自 令和 7年 8月 1日
至 令和 8年 7月31日
===== PAGE 2 =====
損 益 計 算 書
営業損失 １２３，４５６
`);
assert.equal(lossWithoutTriangle.periodNumber, 20);
assert.equal(lossWithoutTriangle.metrics.operating_income, -123_456);

console.log(
  JSON.stringify(
    {
      ok: true,
      companyName: parsed.companyName,
      fiscalPeriod: parsed.fiscalPeriod,
      pages: parsed.pageCount,
      rowCounts: Object.fromEntries(
        Object.entries(parsed.accounts).map(([key, rows]) => [key, rows.length]),
      ),
      validation: parsed.validation,
    },
    null,
    2,
  ),
);
