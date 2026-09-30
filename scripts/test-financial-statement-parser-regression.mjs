import assert from 'node:assert/strict';
import {
  parseFinancialStatementText,
  parseJapaneseFinancialNumber,
} from '../lib/finance/financial-statement-parser.ts';

const packet = `
===== PAGE 1 =====
税務署受信通知
事業者コード：99999 利用者名：株式会社 架空食品
所得の金額 当期純利益 999,999
添付資料 貸借対照表 損益計算書
===== PAGE 2 =====
第 ２ ０ 期
株式会社 架空食品
自 令和7年8月1日
至 令和8年7月31日
===== PAGE 3 =====
貸 イ昔 女寸 昭一 表
株式会社 架空食品 令和8年7月31日現在
資 産 の 部 負 債 の 部
【流 動 資 産】 1, 100, 000      【流 動 負 債】 200,000
現 金 及 び 預 金 800,000       買 掛 金 200,000
棚 卸 資 産 300,000           【固 定 負 債】 1,500,000
【固 定 資 産】 400,000        長 期 借 入 金 1,500,000
負 債 の 部 計 1,700,000
純 資 産 の 部
【株 主 資 本】 ム200,000
純 資 産 の 部 計 A200,000
資 産 の 部 計 1,500,000       負債･純資産の部計 1,500,000
===== PAGE 4 =====
才員 益 言十 算 菫一
自令和7年8月1日
株式会社 架空食品 至令和8年7月31日
【売 上 高】 2,000,000
【売 上 原 価】
期 首 棚 卸 高 200,000
仕 入 高 1,000,000
期 末 棚 卸 高 300,000 900,000
売 上 総 利 益 1,100,000
【販売費及び一般管理費】 1,000,000
営 業 利 益 100,000
【営 業 外 収 益】
雑 収 入 10,000 10,000
【営 業 外 費 用】
支 払 利 息 20,000 20,000
経 常 利 益 90,000
税引前当期純利益 90,000
法 人 税 等 10,000
当 期 純 利 益 80,000
===== PAGE 5 =====
貝反壱費 般 管 理 費
株式会社 架空食品
役 員 報 酬 100,000
給 料 手 当 200,000
法 定 福 利 費 文字破損
広 告 宣 伝 費 100,000
水 道 光 熱 費 100,000
減 価 償 却 費 100,000
リース資産減価償去階 50,000
支 払 手 数 料 100,000
販売費及び刊撒費 1,000,000
===== PAGE 6 =====
株 主 資 本 等 変 動 計 算 書
当期首残高 1,000,000 A1,280,000 A280,000
当期純利益 80,000 80,000
当期変動額合計 80,000 80,000
当期末残高 1,000,000 A1,200,000 A200,000
純資産合計
===== PAGE 7 =====
n 劃 注 記 表
l.重要な会計方針に係る事項に関する注記
消費税等の会計処理
税込方式で計上している。
2.株主資本等変動計算書に関する注記
発行済株式の総数 100株
===== PAGE 8 =====
借入金及び支払利子の内訳書
架空信用金庫 1,500,000 20,000 1.5
貸借対照表と損益計算書に関する説明
`;

const result = parseFinancialStatementText(packet);
assert.equal(result.companyName, '株式会社架空食品');
assert.equal(result.periodNumber, 20);
assert.equal(result.periodStart, '2025-08-01');
assert.equal(result.periodEnd, '2026-07-31');
assert.equal(result.pageCount, 8);
assert.equal(result.metrics.cash_and_deposits, 800_000);
assert.equal(result.metrics.long_term_borrowings, 1_500_000);
assert.equal(result.metrics.net_assets, -200_000);
assert.equal(result.metrics.beginning_inventory, 200_000);
assert.equal(result.metrics.ending_inventory, 300_000);
assert.equal(result.metrics.inventory_change, 100_000);
assert.equal(result.metrics.cogs, 900_000);
assert.equal(result.metrics.net_income, 80_000);
assert.equal(result.metrics.depreciation_expense, 100_000);
assert.equal(result.metrics.lease_depreciation_expense, 50_000);
assert.equal(result.metrics.depreciation_total, 150_000);
assert.equal(result.validation.balanceSheet.passed, true);
assert.equal(result.validation.incomeStatement.passed, true);
assert.ok(result.accounts.balanceSheet.every((row) => row.page === 3));
assert.ok(result.accounts.incomeStatement.every((row) => row.page === 4));
assert.ok(result.accounts.notes.every((row) => row.page === 7));
assert.ok(result.accounts.equityChanges.every((row) => row.page === 6));
const welfare = result.accounts.sellingGeneralAdministrative.find((row) => row.accountName === '法定福利費');
assert.equal(welfare.amount, 250_000);
assert.equal(welfare.isDerived, true);
assert.equal(result.warnings.length, 1);
assert.match(result.warnings[0], /差額から補完/);
assert.equal(parseJapaneseFinancialNumber('A 1, 234, 567'), -1_234_567);
assert.equal(parseJapaneseFinancialNumber('ム１２３，４５６'), -123_456);

const readable = parseFinancialStatementText(packet.replace('法 定 福 利 費 文字破損', '法 定 福 利 費 250,000'));
assert.deepEqual(readable.warnings, []);
const mismatch = parseFinancialStatementText(packet.replace('法 定 福 利 費 文字破損', '法 定 福 利 費 240,000'));
assert.ok(mismatch.warnings.some((warning) => warning.includes('明細合計')));

const leaseOnly = parseFinancialStatementText(`
===== PAGE 1 =====
販売費・一般管理費内訳書
リース資産減価償却費 50,000
`);
assert.equal(leaseOnly.metrics.depreciation_expense, null);
assert.equal(leaseOnly.metrics.depreciation_total, 50_000);

const trailingMarkers = parseFinancialStatementText(`
第20期
株式会社 架空食品
自令和7年8月1日
至令和8年7月31日
===== PAGE 1 =====
損益計算書
営業損失 123,456
===== PAGE 2 =====
`);
assert.equal(trailingMarkers.pageCount, 2);
assert.equal(trailingMarkers.metrics.operating_income, -123_456);
assert.equal(trailingMarkers.accounts.incomeStatement[0].page, 2);

console.log(JSON.stringify({ ok: true, assertions: 'packet isolation, OCR headers, company/date, inventories, debts, depreciation, totals and damaged amount recovery' }));
