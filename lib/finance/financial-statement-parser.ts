export type FinancialStatementSection =
  | 'balance_sheet'
  | 'income_statement'
  | 'selling_general_administrative'
  | 'equity_changes'
  | 'notes';

export type BalanceSheetSide = 'assets' | 'liabilities' | 'net_assets' | null;

export interface FinancialStatementAccountRow {
  section: FinancialStatementSection;
  accountName: string;
  normalizedAccountName: string;
  amount: number | null;
  /** All numeric columns on the source row. Equity rows commonly have several. */
  amounts: number[];
  page: number;
  rawText: string;
  category: string | null;
  side: BalanceSheetSide;
  isTotal: boolean;
  isDerived: boolean;
}

export interface FinancialStatementAccounts {
  balanceSheet: FinancialStatementAccountRow[];
  incomeStatement: FinancialStatementAccountRow[];
  sellingGeneralAdministrative: FinancialStatementAccountRow[];
  equityChanges: FinancialStatementAccountRow[];
  notes: FinancialStatementAccountRow[];
}

export interface FinancialStatementMetrics {
  cash_and_deposits: number | null;
  accounts_receivable: number | null;
  inventory: number | null;
  accounts_payable: number | null;
  short_term_borrowings: number | null;
  long_term_borrowings: number | null;
  lease_obligations: number | null;
  total_borrowings: number | null;
  current_assets: number | null;
  fixed_assets: number | null;
  current_liabilities: number | null;
  fixed_liabilities: number | null;
  total_assets: number | null;
  total_liabilities: number | null;
  net_assets: number | null;
  total_liabilities_and_net_assets: number | null;
  beginning_inventory: number | null;
  purchases: number | null;
  ending_inventory: number | null;
  inventory_change: number | null;
  cogs: number | null;
  net_sales: number | null;
  gross_profit: number | null;
  sga: number | null;
  operating_income: number | null;
  non_operating_income: number | null;
  non_operating_expenses: number | null;
  ordinary_income: number | null;
  income_before_taxes: number | null;
  income_taxes: number | null;
  net_income: number | null;
  interest_expense: number | null;
  depreciation_expense: number | null;
  lease_depreciation_expense: number | null;
  depreciation_total: number | null;
}

export interface FinancialStatementValidationCheck {
  name: string;
  passed: boolean | null;
  expected: number | null;
  actual: number | null;
  difference: number | null;
}

export interface FinancialStatementValidation {
  balanceSheet: {
    passed: boolean | null;
    totalAssets: number | null;
    totalLiabilitiesAndNetAssets: number | null;
    difference: number | null;
  };
  incomeStatement: {
    passed: boolean | null;
    checks: FinancialStatementValidationCheck[];
  };
}

export interface ParsedFinancialStatement {
  companyName: string | null;
  /** Numeric fiscal period (for example, 19 for 第19期). */
  periodNumber: number | null;
  /** Backward-compatible alias of periodNumber. */
  fiscalPeriod: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  pageCount: number;
  accounts: FinancialStatementAccounts;
  metrics: FinancialStatementMetrics;
  warnings: string[];
  validation: FinancialStatementValidation;
}

interface SourcePage {
  number: number;
  text: string;
}

interface NumberToken {
  value: number;
  start: number;
  end: number;
  raw: string;
}

const FINANCIAL_NUMBER = String.raw`(?:\d{1,3}(?:,\s*\d{3})+|\d+)`;
const NUMBER_TOKEN_RE = new RegExp(
  String.raw`\(\s*[△▲ムA-]?\s*${FINANCIAL_NUMBER}\s*\)|[△▲ムA-]\s*${FINANCIAL_NUMBER}|${FINANCIAL_NUMBER}`,
  'g',
);
const ONE_YEN_TOLERANCE = 1;

function normalizeWidth(value: string) {
  return value.normalize('NFKC').replace(/\u00a0/g, ' ');
}

function compact(value: string) {
  return normalizeWidth(value).replace(/\s+/g, '').replace(/[･·]/g, '・');
}

function displayAccountName(value: string) {
  return compact(value)
    .replace(/^[|｜:：]+|[|｜:：]+$/g, '')
    .replace(/リ[ー−－-]ス/g, 'リース')
    .replace(/^リース資産減価償(?:去階|却費)$/, 'リース資産減価償却費')
    .replace(/^図書教青費$/, '図書教育費')
    .replace(/^販売費及び刊撒費$/, '販売費及び一般管理費')
    .replace(/^目I」受金$/, '前受金')
    .trim();
}

function metricAccountName(value: string) {
  return displayAccountName(value)
    .replace(/[【】\[\]［］()（）]/g, '')
    .replace(/[・･]/g, '')
    .replace(/^うち/, '');
}

export function parseJapaneseFinancialNumber(value: string | number | null | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = normalizeWidth(String(value ?? '')).trim();
  if (!normalized || !/\d/.test(normalized)) return null;

  const negative = /[△▲]/.test(normalized) || /^\s*[ムA-]\s*\d/.test(normalized);
  const digits = normalized.replace(/[△▲ムA(),，\s円￥-]/g, '');
  if (!/^\d+(?:\.\d+)?$/.test(digits)) return null;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

function extractNumberTokens(line: string): NumberToken[] {
  const normalized = normalizeWidth(line);
  return [...normalized.matchAll(NUMBER_TOKEN_RE)]
    .map((match) => {
      const value = parseJapaneseFinancialNumber(match[0]);
      if (value === null || match.index === undefined) return null;
      return {
        value,
        start: match.index,
        end: match.index + match[0].length,
        raw: match[0],
      };
    })
    .filter((token): token is NumberToken => token !== null);
}

function eraYearToWestern(era: string, year: number) {
  if (era === '令和') return 2018 + year;
  if (era === '平成') return 1988 + year;
  if (era === '昭和') return 1925 + year;
  return null;
}

export function parseJapaneseEraDate(value: string) {
  const normalized = compact(value).replace(/元年/, '1年');
  const match = normalized.match(/(令和|平成|昭和)(\d+)年(\d+)月(\d+)日/);
  if (!match) return null;
  const year = eraYearToWestern(match[1], Number(match[2]));
  const month = Number(match[3]);
  const day = Number(match[4]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function splitPages(text: string): SourcePage[] {
  const marker = /^=====\s*PAGE\s+(\d+)\s*=====\s*$/gm;
  const matches = [...text.matchAll(marker)];
  if (matches.length === 0) {
    const formFeedPages = text.split('\f');
    return formFeedPages.map((pageText, index) => ({ number: index + 1, text: pageText }));
  }

  // pdf-parse historically appended pageJoiner after each page. Preserve those
  // archived imports while accepting the canonical markers before each page.
  if (text.slice(0, matches[0].index).trim()) {
    return matches.map((match, index) => {
      const start = index === 0
        ? 0
        : (matches[index - 1].index ?? 0) + matches[index - 1][0].length;
      return { number: Number(match[1]), text: text.slice(start, match.index) };
    });
  }

  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    return { number: Number(match[1]), text: text.slice(start, end) };
  });
}

function row(
  section: FinancialStatementSection,
  accountName: string,
  amounts: number[],
  page: number,
  rawText: string,
  options: {
    amount?: number | null;
    category?: string | null;
    side?: BalanceSheetSide;
    isDerived?: boolean;
  } = {},
): FinancialStatementAccountRow {
  const normalizedName = metricAccountName(accountName);
  const amount = options.amount === undefined ? (amounts.at(-1) ?? null) : options.amount;
  return {
    section,
    accountName: displayAccountName(accountName),
    normalizedAccountName: normalizedName,
    amount,
    amounts,
    page,
    rawText: rawText.trimEnd(),
    category: options.category ?? null,
    side: options.side ?? null,
    isTotal: /(?:合計|の部計|総利益|営業利益|経常利益|純利益|販売費及び一般管理費)$/.test(
      normalizedName,
    ),
    isDerived: options.isDerived ?? false,
  };
}

function parseBalanceSheet(page: SourcePage) {
  const rows: FinancialStatementAccountRow[] = [];
  let rightSide: Exclude<BalanceSheetSide, null> = 'liabilities';

  for (const rawLine of page.text.split(/\r?\n/)) {
    const line = normalizeWidth(rawLine);
    const lineCompact = compact(line);
    if (!lineCompact || /(?:貸借対照表|単位:円|株式会社|科目金額|令和\d+年)/.test(lineCompact)) {
      continue;
    }

    const switchesToNetAssets = lineCompact.includes('純資産の部');
    const tokens = extractNumberTokens(line);
    let previousEnd = 0;

    for (const token of tokens) {
      const accountName = displayAccountName(line.slice(previousEnd, token.start));
      previousEnd = token.end;
      if (!accountName || /^\d+$/.test(accountName)) continue;

      const name = metricAccountName(accountName);
      const side: Exclude<BalanceSheetSide, null> =
        /(?:純資産|株主資本|資本金|利益剰余金|当期純利益)/.test(name)
          ? 'net_assets'
          : /(?:負債|買掛金|未払|借入金|リース債務|預り金|受金)/.test(name)
            ? 'liabilities'
            : tokens.length > 1 && tokens.indexOf(token) > 0
              ? rightSide
              : 'assets';
      rows.push(
        row('balance_sheet', accountName, [token.value], page.number, rawLine, {
          side,
          category: side,
        }),
      );
    }

    if (switchesToNetAssets) rightSide = 'net_assets';
  }

  return rows;
}

function parseIncomeStatement(page: SourcePage) {
  const rows: FinancialStatementAccountRow[] = [];
  let category: string | null = null;

  for (const rawLine of page.text.split(/\r?\n/)) {
    const line = normalizeWidth(rawLine);
    const lineCompact = compact(line);
    if (!lineCompact || /(?:損益計算書|単位:円|株式会社|自令和|至令和|科目金額)/.test(lineCompact)) {
      continue;
    }

    const heading = lineCompact.match(/^【(.+?)】$/);
    if (heading) {
      category = metricAccountName(heading[1]);
      continue;
    }

    const tokens = extractNumberTokens(line);
    if (tokens.length === 0) continue;
    const accountName = displayAccountName(line.slice(0, tokens[0].start));
    if (!accountName) continue;
    const normalizedName = metricAccountName(accountName);
    const values = tokens.map((token) =>
      /損失/.test(normalizedName) && token.value > 0 ? -token.value : token.value,
    );
    if (/^【.+】$/.test(accountName)) category = normalizedName;

    rows.push(
      row('income_statement', accountName, values, page.number, rawLine, {
        amount: values[0],
        category,
      }),
    );

    if (values.length > 1 && /^(?:期末棚卸高|期末商品棚卸高)$/.test(normalizedName)) {
      rows.push(
        row('income_statement', '売上原価', [values[1]], page.number, rawLine, {
          amount: values[1],
          category: '売上原価',
          isDerived: true,
        }),
      );
    } else if (values.length > 1 && normalizedName === '雑収入') {
      rows.push(
        row('income_statement', '営業外収益計', [values[1]], page.number, rawLine, {
          amount: values[1],
          category: '営業外収益',
          isDerived: true,
        }),
      );
    } else if (values.length > 1 && normalizedName === '支払利息') {
      rows.push(
        row('income_statement', '営業外費用計', [values[1]], page.number, rawLine, {
          amount: values[1],
          category: '営業外費用',
          isDerived: true,
        }),
      );
    }
  }

  return rows;
}

function parseSga(page: SourcePage) {
  const rows: FinancialStatementAccountRow[] = [];
  for (const rawLine of page.text.split(/\r?\n/)) {
    const line = normalizeWidth(rawLine);
    const lineCompact = compact(line);
    if (
      !lineCompact ||
      /(?:販売費・一般管理費内訳書|単位:円|株式会社|自令和|至令和|科目金額)/.test(lineCompact)
    ) {
      continue;
    }
    const tokens = extractNumberTokens(line);
    const damagedWelfare = lineCompact.startsWith('法定福利費') &&
      !/^[\d,△▲ムA()円\s-]+$/.test(lineCompact.slice('法定福利費'.length));
    const accountName = damagedWelfare
      ? '法定福利費'
      : displayAccountName(tokens.length ? line.slice(0, tokens[0].start) : line);
    if (damagedWelfare) {
      rows.push(row('selling_general_administrative', accountName, [], page.number, rawLine, { category: '販売費及び一般管理費', amount: null }));
      continue;
    }
    if (tokens.length === 0) {
      if (/^(?:法定福利費|減価償却費|リース資産減価償却費)$/.test(accountName)) {
        rows.push(row('selling_general_administrative', accountName, [], page.number, rawLine, { category: '販売費及び一般管理費', amount: null }));
      }
      continue;
    }
    if (!accountName) continue;
    if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(accountName)) continue;
    if (/[^\d,△▲ムA()円\s-]/.test(line.slice(tokens[0].start))) continue;
    rows.push(
      row(
        'selling_general_administrative',
        accountName,
        tokens.map((token) => token.value),
        page.number,
        rawLine,
        { amount: tokens[0].value, category: '販売費及び一般管理費' },
      ),
    );
  }
  const total = rows.find((candidate) => candidate.normalizedAccountName === '販売費及び一般管理費');
  const details = rows.filter((candidate) => candidate !== total);
  const missing = details.filter((candidate) => candidate.amount === null);
  if (
    total?.amount !== null && total?.amount !== undefined && details.length >= 5 && missing.length === 1 &&
    new Set(details.map((candidate) => candidate.normalizedAccountName)).size === details.length
  ) {
    const residual = total.amount - details.reduce((sum, candidate) => sum + (candidate.amount ?? 0), 0);
    if (residual >= 0) {
      missing[0].amount = residual;
      missing[0].amounts = [residual];
      missing[0].isDerived = true;
    }
  }
  return rows;
}

function parseEquityChanges(page: SourcePage) {
  const rows: FinancialStatementAccountRow[] = [];
  let category = '株主資本';
  for (const rawLine of page.text.split(/\r?\n/)) {
    const lineCompact = compact(rawLine);
    if (!lineCompact) continue;
    if (lineCompact.includes('利益剰余金の内訳')) {
      category = '利益剰余金の内訳';
      continue;
    }
    const nameMatch = lineCompact.match(/(当期首残高|当期純利益|当期変動額合計|当期末残高)/);
    if (!nameMatch) continue;
    const tokens = extractNumberTokens(rawLine);
    if (tokens.length === 0) continue;
    rows.push(
      row(
        'equity_changes',
        nameMatch[1],
        tokens.map((token) => token.value),
        page.number,
        rawLine,
        { category },
      ),
    );
  }
  return rows;
}

function parseNotes(page: SourcePage) {
  const rows: FinancialStatementAccountRow[] = [];
  let category: string | null = null;
  for (const rawLine of page.text.split(/\r?\n/)) {
    const lineCompact = compact(rawLine);
    if (
      !lineCompact ||
      /(?:個別注記表|株式会社|自令和|至令和)/.test(lineCompact)
    ) {
      continue;
    }
    const heading = lineCompact.match(/^([\dlI])\.(.+)$/);
    if (heading) {
      category = `${/[lI]/.test(heading[1]) ? '1' : heading[1]}.${heading[2]}`;
      rows.push(row('notes', category, [], page.number, rawLine, { category, amount: null }));
      continue;
    }
    if (!category) continue;
    // Dates in accounting-policy prose are descriptive text, not monetary amounts.
    if (/(?:令和|平成|昭和)\s*(?:元|[0-9０-９]+)\s*年/.test(normalizeWidth(rawLine))) {
      rows.push(
        row('notes', lineCompact, [], page.number, rawLine, {
          category,
          amount: null,
        }),
      );
      continue;
    }
    const tokens = extractNumberTokens(rawLine);
    const noteName = tokens.length
      ? displayAccountName(normalizeWidth(rawLine).slice(0, tokens[0].start)) || lineCompact
      : lineCompact;
    rows.push(
      row('notes', noteName, tokens.map((token) => token.value), page.number, rawLine, {
        category,
        amount: tokens.length === 1 ? tokens[0].value : null,
      }),
    );
  }
  return rows;
}

function findAmount(rows: FinancialStatementAccountRow[], ...aliases: string[]) {
  const normalizedAliases = aliases.map(metricAccountName);
  const exact = rows.find(
    (candidate) =>
      candidate.amount !== null && normalizedAliases.includes(candidate.normalizedAccountName),
  );
  if (exact) return exact.amount;

  const partial = rows.find(
    (candidate) =>
      candidate.amount !== null &&
      normalizedAliases.some((alias) => candidate.normalizedAccountName.includes(alias)),
  );
  return partial?.amount ?? null;
}

function addNullable(...values: Array<number | null>) {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0 ? null : present.reduce((sum, value) => sum + value, 0);
}

function buildMetrics(accounts: FinancialStatementAccounts): FinancialStatementMetrics {
  const bs = accounts.balanceSheet;
  const pl = accounts.incomeStatement;
  const shortTermBorrowings = findAmount(bs, '短期借入金');
  const longTermBorrowings = findAmount(bs, '長期借入金');
  const beginningInventory = findAmount(pl, '期首棚卸高', '期首商品棚卸高');
  const endingInventory = findAmount(pl, '期末棚卸高', '期末商品棚卸高');
  const depreciationExpense = accounts.sellingGeneralAdministrative.find(
    (candidate) => candidate.normalizedAccountName === '減価償却費',
  )?.amount ?? null;
  const leaseDepreciationExpense = findAmount(accounts.sellingGeneralAdministrative, 'リース資産減価償却費');

  return {
    cash_and_deposits: findAmount(bs, '現金及び預金'),
    accounts_receivable: findAmount(bs, '売掛金'),
    inventory: findAmount(bs, '棚卸資産', '商品及び製品', '商品'),
    accounts_payable: findAmount(bs, '買掛金'),
    short_term_borrowings: shortTermBorrowings,
    long_term_borrowings: longTermBorrowings,
    lease_obligations: findAmount(bs, 'リース債務'),
    total_borrowings: addNullable(shortTermBorrowings, longTermBorrowings),
    current_assets: findAmount(bs, '流動資産'),
    fixed_assets: findAmount(bs, '固定資産'),
    current_liabilities: findAmount(bs, '流動負債'),
    fixed_liabilities: findAmount(bs, '固定負債'),
    total_assets: findAmount(bs, '資産の部計', '資産合計'),
    total_liabilities: findAmount(bs, '負債の部計', '負債合計'),
    net_assets: findAmount(bs, '純資産の部計', '純資産合計'),
    total_liabilities_and_net_assets: findAmount(
      bs,
      '負債・純資産の部計',
      '負債純資産の部計',
      '負債純資産合計',
    ),
    beginning_inventory: beginningInventory,
    purchases: findAmount(pl, '仕入高', '当期商品仕入高'),
    ending_inventory: endingInventory,
    inventory_change:
      beginningInventory !== null && endingInventory !== null
        ? endingInventory - beginningInventory
        : null,
    cogs: findAmount(pl, '売上原価'),
    net_sales: findAmount(pl, '売上高', '純売上高'),
    gross_profit: findAmount(pl, '売上総利益'),
    sga:
      findAmount(pl, '販売費及び一般管理費') ??
      findAmount(accounts.sellingGeneralAdministrative, '販売費及び一般管理費'),
    operating_income: findAmount(pl, '営業利益', '営業損失'),
    non_operating_income: findAmount(pl, '営業外収益計'),
    non_operating_expenses: findAmount(pl, '営業外費用計'),
    ordinary_income: findAmount(pl, '経常利益', '経常損失'),
    income_before_taxes: findAmount(pl, '税引前当期純利益', '税引前当期純損失'),
    income_taxes: findAmount(pl, '法人税等'),
    net_income: findAmount(pl, '当期純利益', '当期純損失'),
    interest_expense: findAmount(pl, '支払利息'),
    depreciation_expense: depreciationExpense,
    lease_depreciation_expense: leaseDepreciationExpense,
    depreciation_total: addNullable(depreciationExpense, leaseDepreciationExpense),
  };
}

function check(name: string, expected: number | null, actual: number | null) {
  const difference = expected === null || actual === null ? null : actual - expected;
  return {
    name,
    passed: difference === null ? null : Math.abs(difference) <= ONE_YEN_TOLERANCE,
    expected,
    actual,
    difference,
  } satisfies FinancialStatementValidationCheck;
}

function buildValidation(metrics: FinancialStatementMetrics): FinancialStatementValidation {
  const bsDifference =
    metrics.total_assets === null || metrics.total_liabilities_and_net_assets === null
      ? null
      : metrics.total_assets - metrics.total_liabilities_and_net_assets;

  const plChecks: FinancialStatementValidationCheck[] = [
    check(
      '売上原価 = 期首棚卸高 + 仕入高 - 期末棚卸高',
      metrics.beginning_inventory === null ||
        metrics.purchases === null ||
        metrics.ending_inventory === null
        ? null
        : metrics.beginning_inventory + metrics.purchases - metrics.ending_inventory,
      metrics.cogs,
    ),
    check(
      '売上総利益 = 売上高 - 売上原価',
      metrics.net_sales === null || metrics.cogs === null
        ? null
        : metrics.net_sales - metrics.cogs,
      metrics.gross_profit,
    ),
    check(
      '営業利益 = 売上総利益 - 販売費及び一般管理費',
      metrics.gross_profit === null || metrics.sga === null
        ? null
        : metrics.gross_profit - metrics.sga,
      metrics.operating_income,
    ),
    check(
      '経常利益 = 営業利益 + 営業外収益 - 営業外費用',
      metrics.operating_income === null ||
        metrics.non_operating_income === null ||
        metrics.non_operating_expenses === null
        ? null
        : metrics.operating_income +
          metrics.non_operating_income -
          metrics.non_operating_expenses,
      metrics.ordinary_income,
    ),
    check(
      '当期純利益 = 税引前当期純利益 - 法人税等',
      metrics.income_before_taxes === null || metrics.income_taxes === null
        ? null
        : metrics.income_before_taxes - metrics.income_taxes,
      metrics.net_income,
    ),
  ];
  const availableChecks = plChecks.filter((candidate) => candidate.passed !== null);

  return {
    balanceSheet: {
      passed: bsDifference === null ? null : Math.abs(bsDifference) <= ONE_YEN_TOLERANCE,
      totalAssets: metrics.total_assets,
      totalLiabilitiesAndNetAssets: metrics.total_liabilities_and_net_assets,
      difference: bsDifference,
    },
    incomeStatement: {
      passed:
        availableChecks.length === 0
          ? null
          : availableChecks.every((candidate) => candidate.passed === true),
      checks: plChecks,
    },
  };
}

function buildWarnings(
  accounts: FinancialStatementAccounts,
  metrics: FinancialStatementMetrics,
  validation: FinancialStatementValidation,
) {
  const warnings: string[] = [];
  for (const candidate of accounts.sellingGeneralAdministrative) {
    if (candidate.isDerived) {
      warnings.push(`${candidate.accountName} はOCR金額を読み取れないため、販管費合計との差額から補完しました（${candidate.amount} 円、${candidate.page}ページ）。原本と照合してください。`);
    } else if (candidate.amount === null) {
      warnings.push(`${candidate.accountName} の金額を読み取れませんでした（${candidate.page}ページ）。`);
    }
  }
  const sgaDetails = accounts.sellingGeneralAdministrative.filter((candidate) => !candidate.isTotal);
  if (metrics.sga !== null && sgaDetails.length > 0 && sgaDetails.every((candidate) => candidate.amount !== null)) {
    const sgaSum = sgaDetails.reduce((sum, candidate) => sum + (candidate.amount ?? 0), 0);
    if (Math.abs(sgaSum - metrics.sga) > ONE_YEN_TOLERANCE) {
      warnings.push(`販管費の明細合計と損益計算書が一致しません（差額 ${sgaSum - metrics.sga} 円）。`);
    }
  }
  if (accounts.balanceSheet.length === 0) warnings.push('貸借対照表の勘定科目を抽出できませんでした。');
  if (accounts.incomeStatement.length === 0) warnings.push('損益計算書の勘定科目を抽出できませんでした。');
  if (metrics.total_assets === null) warnings.push('資産合計を抽出できませんでした。');
  if (metrics.net_sales === null) warnings.push('売上高を抽出できませんでした。');
  if (validation.balanceSheet.passed === false) {
    warnings.push(`貸借対照表が一致しません（差額 ${validation.balanceSheet.difference} 円）。`);
  }
  for (const failed of validation.incomeStatement.checks.filter((candidate) => candidate.passed === false)) {
    warnings.push(`${failed.name} の検算が一致しません（差額 ${failed.difference} 円）。`);
  }
  if (
    metrics.inventory !== null &&
    metrics.ending_inventory !== null &&
    Math.abs(metrics.inventory - metrics.ending_inventory) > ONE_YEN_TOLERANCE
  ) {
    warnings.push(
      `貸借対照表の棚卸資産と損益計算書の期末棚卸高が一致しません（差額 ${
        metrics.inventory - metrics.ending_inventory
      } 円）。`,
    );
  }
  return warnings;
}

function detectPageSection(page: SourcePage) {
  const text = compact(page.text);
  const headings = page.text.split(/\r?\n/).map(compact).filter(Boolean).slice(0, 8);
  const hasHeading = (name: string) => headings.some((line) => line === name);
  // A complete filing packet also contains forms that mention these statements.
  // Require a statement heading or its characteristic account structure, rather
  // than accepting an incidental phrase anywhere in a tax form.
  if (hasHeading('貸借対照表') ||
      ['資産の部', '負債の部', '現金及び預金', '流動資産', '流動負債'].every((name) => text.includes(name))) return 'balance_sheet' as const;
  if (hasHeading('損益計算書') ||
      ['売上高', '期首棚卸高', '期末棚卸高', '売上総利益', '営業利益'].every((name) => text.includes(name))) return 'income_statement' as const;
  if (hasHeading('販売費・一般管理費内訳書') || hasHeading('販売費及び一般管理費内訳書') ||
      ['役員報酬', '給料手当', '広告宣伝費', '水道光熱費', '減価償却費', '支払手数料'].every((name) => text.includes(name))) {
    return 'selling_general_administrative' as const;
  }
  // 注記本文には「株主資本等変動計算書に関する注記」が現れるため、
  // 株主資本等変動計算書より先に判定する。
  if (hasHeading('個別注記表') || text.includes('重要な会計方針に係る事項に関する注記')) return 'notes' as const;
  if (hasHeading('株主資本等変動計算書') ||
      ['当期首残高', '当期変動額合計', '当期末残高', '純資産合計'].every((name) => text.includes(name))) return 'equity_changes' as const;
  return null;
}

export function parseFinancialStatementText(text: string): ParsedFinancialStatement {
  const pages = splitPages(text);
  const statementPages = pages.filter((page) => detectPageSection(page) !== null);
  const headerPages = [...statementPages, ...pages.filter((page) => !statementPages.includes(page))];
  const normalizedText = normalizeWidth(headerPages.map((page) => page.text).join('\n'));
  const compactText = compact(text);
  const standalonePeriod = normalizedText.split(/\r?\n/).map(compact)
    .map((line) => line.match(/^第(\d+)期$/)).find((match) => match !== null);
  const periodMatch = standalonePeriod ?? compactText.match(/第(\d+)期/);
  const headerText = compact(normalizedText);
  const startMatch = headerText.match(/自((?:令和|平成|昭和)(?:元|\d+)年\d+月\d+日)/);
  const endMatch = headerText.match(/至((?:令和|平成|昭和)(?:元|\d+)年\d+月\d+日)/);

  let companyName: string | null = null;
  for (const line of normalizedText.split(/\r?\n/)) {
    if (!line.includes('株式会社')) continue;
    const candidate = compact(line).replace(/※/g, '').match(/株式会社[^\d:;|【】()]+/)?.[0]
      .split(/(?:令和|平成|昭和|単位|自令|至令|代表取締役)/, 1)[0];
    if (!candidate) continue;
    companyName = candidate;
    break;
  }

  const accounts: FinancialStatementAccounts = {
    balanceSheet: [],
    incomeStatement: [],
    sellingGeneralAdministrative: [],
    equityChanges: [],
    notes: [],
  };

  for (const page of pages) {
    switch (detectPageSection(page)) {
      case 'balance_sheet':
        accounts.balanceSheet.push(...parseBalanceSheet(page));
        break;
      case 'income_statement':
        accounts.incomeStatement.push(...parseIncomeStatement(page));
        break;
      case 'selling_general_administrative':
        accounts.sellingGeneralAdministrative.push(...parseSga(page));
        break;
      case 'equity_changes':
        accounts.equityChanges.push(...parseEquityChanges(page));
        break;
      case 'notes':
        accounts.notes.push(...parseNotes(page));
        break;
    }
  }

  const metrics = buildMetrics(accounts);
  const validation = buildValidation(metrics);
  const warnings = buildWarnings(accounts, metrics, validation);
  const periodNumber = periodMatch ? Number(periodMatch[1]) : null;

  return {
    companyName,
    periodNumber,
    fiscalPeriod: periodNumber,
    periodStart: startMatch ? parseJapaneseEraDate(startMatch[1]) : null,
    periodEnd: endMatch ? parseJapaneseEraDate(endMatch[1]) : null,
    pageCount: pages.length,
    accounts,
    metrics,
    warnings,
    validation,
  };
}
