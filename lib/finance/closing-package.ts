/** Deterministic extraction of a closing package. Every page/line remains evidence;
 * ambiguous OCR columns are retained as candidates, never promoted to an amount. */
export const CLOSING_PACKAGE_VERSION = 'closing-package-v1';
export const MAX_CLOSING_PDF_SIZE = 20 * 1024 * 1024;
export const CLOSING_UPLOAD_CHUNK_SIZE = 2 * 1024 * 1024;
export const MAX_CLOSING_PAGES = 400;

export type ClosingPageInput = { pageNumber: number; text: string; rawText?: string };
export type ClosingRecord = {
  page: number; rowNo: number; section: string; accountName: string;
  amount: number | null; rawText: string; metadata: Record<string, unknown>;
};
export type ClosingPage = ClosingPageInput & {
  kind: string; label: string; recordsCount: number; warnings: string[];
};
export type ParsedClosingPackage = {
  pages: ClosingPage[]; records: ClosingRecord[];
  documentKinds: { kind: string; label: string; pages: number[] }[];
  warnings: string[]; sourceText: string;
};

const KINDS: Array<[string, string, RegExp]> = [
  ['electronic_receipt', '電子申告受付通知', /受信通知|申告受付完了通知|国税電子申告.*メール詳細/],
  ['loan_detail', '借入金・支払利子内訳', /借入金及び支払利子の内訳/],
  ['deposit_detail', '預貯金内訳', /預貯金等の内訳/],
  ['inventory_detail', '棚卸資産内訳', /棚卸資産.*内訳書/],
  ['receivable_detail', '売掛金・未収入金内訳', /売掛金.*内訳書/],
  ['payable_detail', '買掛金・未払金内訳', /買掛金.*内訳書/],
  ['prepayment_detail', '仮払金・前渡金内訳', /仮払金.*内訳書/],
  ['advance_detail', '仮受金・預り金内訳', /仮受金.*内訳書/],
  ['salary_detail', '役員給与内訳', /役員給与等の内訳/],
  ['rent_detail', '地代家賃内訳', /地代家賃等の内訳/],
  ['miscellaneous_detail', '雑益・雑損失内訳', /雑益.*雑損失.*内訳/],
  ['fixed_asset_ledger', '固定資産台帳・減価償却計算書', /固定資産台帳|減価償却計算書/],
  ['pooled_asset_detail', '一括償却資産明細', /一括償却資産明細表/],
  ['tax_loss_schedule', '繰越欠損金明細', /欠損金の損金算入等に関する明細書|欠損金額の控除明細書/],
  ['depreciation_tax_schedule', '減価償却申告明細', /別表十六|償却額の計算に関する明細/],
  ['business_overview', '法人事業概況説明書', /法人事業概況説明書|NTAOHOKO10020070/],
  ['consumption_tax_schedule', '消費税計算付表', /課税標準額等の内訳書|課税売上割合.*計算表|NTAOSHBO/],
  ['consumption_tax_return', '消費税申告書', /消費税及び地方|課税期間分の消費税|NTA1SHA/],
  ['local_tax_return', '地方税申告書・明細', /第六号様式|第二十号様式|第二十二号の二様式/],
  ['corporate_tax_schedule', '法人税申告別表', /別表[一二三四五六七八九十]|所得の金額の計算に関する明細/],
  ['corporate_tax_return', '法人税申告書', /各事業年度の所得に係る申告|法人税.*申告書/],
  ['notes', '個別注記表', /個別注記表|重要な会計方針|重要な会計.*注記/],
  ['equity_changes', '株主資本等変動計算書', /株主資本等変動計算書|利益剰余金.*当期首/],
  ['sga', '販売費・一般管理費明細', /販売費及び一般管理費内訳|役員報酬.*給料手当.*賞与/],
  ['balance_sheet', '貸借対照表', /貸借対照表|資産の部.*負債の部/],
  ['income_statement', '損益計算書', /損益計算書|売上高.*期首棚卸高.*売上総利益/],
  ['closing_cover', '決算報告書表紙', /決算報告書|第\d+期.*令和/],
  ['closing_confirmation', '決算報告確認', /報告申し上げます|上記.*ご報告/],
];

function compact(value: string) { return value.normalize('NFKC').replace(/\s+/g, ''); }

export function classifyClosingPage(text: string) {
  const header = compact(text.slice(0, 3500));
  const match = KINDS.find(([, , pattern]) => pattern.test(header));
  return match ? { kind: match[0], label: match[1] } : { kind: 'other', label: 'その他・要確認' };
}

function moneyCandidates(text: string): { amount: number; raw: string; index: number }[] {
  const value = text.normalize('NFKC');
  // Grouped yen values only. Do not repair OCR glyphs, decimal rates, account IDs,
  // postal addresses, dates, form field codes, or number strings joined across rows.
  return [...value.matchAll(/(?<![\d,.])(?:[△▲-]\s*)?\d{1,3}(?:\s*,\s*\d{3})+(?![\d,])/g)].flatMap(match => {
    const raw = match[0].trim();
    const amount = Number(raw.replace(/[△▲\s,]/g, '')) * (/^[△▲]/.test(raw) ? -1 : 1);
    return Number.isSafeInteger(amount) ? [{ amount, raw, index: match.index ?? 0 }] : [];
  });
}

function genericRecords(page: ClosingPageInput, section: string): ClosingRecord[] {
  const lines = page.text.split(/\r?\n/);
  return lines.flatMap((rawText, index) => {
    const candidates = moneyCandidates(rawText);
    if (!candidates.length) return [];
    const label = rawText.replace(/[△▲-]?\s*\d{1,3}(?:\s*,\s*\d{3})+/g, ' ').trim();
    const cleanLabel = compact(label).replace(/[|｜]/g, '');
    // A direct, single labelled amount is safe to store as an extracted figure;
    // multiple columns/OCR references remain null and require reconciliation.
    const simple = candidates.length === 1 && /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー・及び等()（）\s]+$/u.test(label)
      && !/注|番号|限度|適用|①|②|③/.test(label) && label.length < 45;
    return [{ page: page.pageNumber, rowNo: index + 1, section,
      accountName: cleanLabel.slice(0, 160) || '金額候補・列対応要確認',
      amount: simple ? candidates[0].amount : null, rawText,
      metadata: { status: 'needs_review',
        candidates: candidates.map(({ amount, raw }) => ({ amount, raw })),
        unit: null, extraction: simple ? 'single_labelled_amount' : 'unassigned_numeric_candidates' },
    }];
  });
}

function loanRecords(page: ClosingPageInput): ClosingRecord[] {
  const text = page.text.normalize('NFKC');
  const starts = [...text.matchAll(/^(日本政策金融公庫|[^\n]*信用(?:金庫|組合))[^\n]*/gm)];
  const records: ClosingRecord[] = [];
  for (let index = 0; index < starts.length; index++) {
    const start = starts[index].index ?? 0;
    const end = starts[index + 1]?.index ?? text.indexOf('小計', start);
    const rawText = text.slice(start, end < start ? text.length : end);
    const amounts = moneyCandidates(rawText);
    const data = rawText;
    const rates = [...data.matchAll(/(?<!\d)(\d\s*\.\s*\d{3}|[0-5]\s+\d{3})(?!\.\d)/g)]
      .map(match => Number(match[0].replace(/\s*\.\s*/g, '.').replace(/\s+/, '.')))
      .filter(rate => Number.isFinite(rate) && rate >= 0 && rate < 20);
    const lender = starts[index][0].split(/会津若松市|耶麻郡/)[0].trim();
    const sorted = [...amounts].sort((a, b) => b.amount - a.amount);
    const unambiguous = sorted.length === 2 && rates.length === 1;
    records.push({ page: page.pageNumber, rowNo: text.slice(0, start).split('\n').length,
      section: 'loan_detail', accountName: lender, amount: null, rawText,
      metadata: { lender, balance: unambiguous ? sorted[0].amount : null,
        interestPaid: unambiguous ? sorted[1].amount : null,
        ratePercent: rates.length === 1 ? rates[0] : null,
        candidates: amounts.map(({ amount, raw }) => ({ amount, raw })),
        status: 'needs_review', extraction: 'lender_block', unit: 'JPY' },
    });
  }
  const subtotalMatch = text.match(/小計[^\n]*\n([^\n]+)/);
  const subtotal = subtotalMatch ? moneyCandidates(subtotalMatch[1]) : [];
  const balances = records.map(record => record.metadata.balance);
  const interests = records.map(record => record.metadata.interestPaid);
  const reconciled = records.length > 0 && balances.every(value => typeof value === 'number') && interests.every(value => typeof value === 'number')
    && subtotal.length === 2 && balances.reduce<number>((sum, value) => sum + Number(value), 0) === subtotal[0].amount
    && interests.reduce<number>((sum, value) => sum + Number(value), 0) === subtotal[1].amount;
  for (const record of records) {
    record.metadata.validation = { passed: reconciled, name: '金融機関別残高・利息と小計の照合', subtotal: subtotal.map(item => item.amount) };
    record.metadata.status = reconciled ? 'reconciled' : 'needs_review';
    record.amount = reconciled ? Number(record.metadata.balance) : null;
  }
  // Related-party loans are a separate subtotal and are never included in the
  // bank subtotal reconciliation. Preserve the lender's full source name.
  if (subtotalMatch?.index !== undefined) {
    const afterSubtotal = subtotalMatch.index + subtotalMatch[0].length;
    const nextSubtotal = text.indexOf('小計', afterSubtotal);
    if (nextSubtotal > afterSubtotal) {
      const relatedText = text.slice(afterSubtotal, nextSubtotal);
      const lines = relatedText.split('\n');
      const related: ClosingRecord[] = [];
      for (let index = 0; index < lines.length; index++) {
        const lenderMatch = lines[index].match(/^(.+?)\s+([\p{Script=Han}]{2,8}(?:市|町|村)[^\n]*)$/u);
        if (!lenderMatch || moneyCandidates(lines[index]).length) continue;
        const nextLines = lines.slice(index + 1,index + 3).join('\n');
        const amounts = moneyCandidates(nextLines);
        if (amounts.length !== 1) continue;
        const lender = lenderMatch[1].trim().replace(/\s+/g,' ');
        related.push({page:page.pageNumber,rowNo:text.slice(0,afterSubtotal).split('\n').length+index,section:'related_party_loan_detail',
          accountName:lender,amount:null,rawText:lines.slice(index,index+3).join('\n'),
          metadata:{lender,balance:amounts[0].amount,interestPaid:null,ratePercent:null,lenderType:'related_party',status:'needs_review',unit:'JPY',extraction:'related_party_lender_block'}});
      }
      const relatedSubtotalLine=text.slice(nextSubtotal).split('\n').slice(1,3).find(line=>moneyCandidates(line).length===1);
      const relatedSubtotal=relatedSubtotalLine ? moneyCandidates(relatedSubtotalLine)[0].amount : null;
      const relatedPassed=related.length>0 && relatedSubtotal!==null && related.reduce((sum,record)=>sum+Number(record.metadata.balance),0)===relatedSubtotal;
      for (const record of related) {
        record.amount=relatedPassed ? Number(record.metadata.balance) : null;
        record.metadata.status=relatedPassed?'reconciled':'needs_review';
        record.metadata.validation={passed:relatedPassed,name:'関係者借入残高と小計の照合',subtotal:relatedSubtotal};
      }
      records.push(...related);
    }
  }
  return records;
}

function receiptRecords(page: ClosingPageInput): ClosingRecord[] {
  const text = page.text.normalize('NFKC');
  const flattened = compact(text);
  const records: ClosingRecord[] = [];
  const patterns: Array<[string, string, RegExp, string]> = [
    ['vat_final_due', '申告時消費税・地方消費税納付額', /消費税及び地方消費税の合計(?:\(納付又は還付\)税額)?([\d,]+)円/, '消費税及び地方消費税の合計'],
    ['consumption_tax_base', '消費税課税標準額', /課税標準額([\d,]+)円/, '課税標準額'],
    ['corporate_tax_refund', '法人税還付申告額', /この申告による還付金額([\d,]+)円/, 'この申告による還付金額'],
    ['taxable_income_after_loss', '繰越欠損金控除後の所得金額', /所得金額又は欠損金額([\d,]+)円/, '所得金額又は欠損金額'],
    ['loss_carryforward_used', '繰越欠損金の当期控除額', /欠損金又は災害損失金等の当(?:期控除額)?([\d,]+)円/, '欠損金又は災害損失金等の当'],
    ['loss_carryforward_remaining', '翌期繰越欠損金', /翌期へ繰り越す欠損金又は災(?:害損失金)?([\d,]+)円/, '翌期へ繰り越す欠損金又は災'],
  ];
  for (const [key, label, pattern, anchor] of patterns) {
    const match = flattened.match(pattern);
    if (!match) continue;
    const amount = Number(match[1].replaceAll(',', ''));
    if (!Number.isSafeInteger(amount)) continue;
    const lines = text.split('\n');
    const row = lines.findIndex(line => compact(line).includes(anchor));
    records.push({ page: page.pageNumber, rowNo: row + 1,
      section: 'tax_summary', accountName: label,
      amount, rawText: lines.slice(Math.max(0, row), row + 4).join('\n'),
      metadata: { metricKey: key, status: 'extracted', unit: 'JPY', extraction: 'receipt_label' } });
  }
  return records;
}

function labelledDetailRecords(page: ClosingPageInput, section: string): ClosingRecord[] {
  const lines = page.text.normalize('NFKC').split('\n');
  const definitions: Array<[string, string, RegExp]> = section === 'payable_detail' ? [
    ['director_salary_payable', '役員報酬未払金', /役員報酬未払金/],
    ['employee_salary_payable', '給与未払金', /給与未払金/],
  ] : section === 'inventory_detail' ? [
    ['inventory_goods', '商品期末在庫', /^商品/],
    ['inventory_materials', '原材料期末在庫', /^原材料/],
  ] : [];
  return definitions.flatMap(([metricKey, label, pattern]) => {
    const index = lines.findIndex(line => pattern.test(compact(line)));
    if (index < 0) return [];
    const candidates = moneyCandidates(lines[index]);
    return [{ page: page.pageNumber, rowNo: index + 1, section, accountName: label,
      amount: candidates.length === 1 ? candidates[0].amount : null, rawText: lines.slice(Math.max(0,index-1),index+2).join('\n'),
      metadata: { metricKey, status: candidates.length === 1 ? 'extracted' : 'needs_review', unit: 'JPY', extraction: 'labelled_detail',
        candidates: candidates.map(({ amount, raw })=>({amount,raw})) }, }];
  });
}

function depreciationRecords(page: ClosingPageInput, section: string): ClosingRecord[] {
  const lines = page.text.normalize('NFKC').split('\n');
  const rows: ClosingRecord[] = [];
  const add = (row: number, metricKey: string, label: string, amount: number, rawText: string, metadata: Record<string, unknown> = {}) => {
    rows.push({page:page.pageNumber,rowNo:row+1,section:'depreciation_summary',accountName:label,amount,rawText,
      metadata:{metricKey,status:'extracted',unit:'JPY',extraction:'labelled_depreciation_columns',...metadata}});
  };
  if (section === 'fixed_asset_ledger') {
    const start = lines.findIndex(line => compact(line).includes('【有形固定資産】'));
    if (start >= 0) {
      const relative = lines.slice(start).findIndex(line=>compact(line).startsWith('期末合計'));
      if (relative >= 0) {
        const index = start + relative;
        const cells = lines[index].trim().split(/\s{2,}/);
        const parseCell = (cell:string|undefined) => cell && /^\d{1,3}(?:\s*,\s*\d{3})+$/.test(cell.trim()) ? Number(cell.replace(/[\s,]/g,'')) : null;
        const ordinary = parseCell(cells[3]);
        const booked = parseCell(cells[4]);
        if (cells.length >= 7 && cells.length <= 9 && cells.slice(1,5).every(cell=>parseCell(cell)!==null)
          && ordinary !== null && booked !== null && ordinary >= booked) {
          const rawText=lines.slice(start,index+1).join('\n');
          add(index,'ordinary_depreciation_reference','台帳の普通償却額（参考）',ordinary,rawText,{comparisonType:'ordinary_depreciation_reference'});
          add(index,'depreciation_booked_ledger','台帳の当期償却額',booked,rawText);
          add(index,'ordinary_depreciation_difference','普通償却額と当期計上額の差',ordinary-booked,rawText,
            {status:'derived',formula:'ordinary_depreciation_reference - depreciation_booked_ledger',comparisonType:'reference_difference'});
        }
      }
    }
  }
  if (section === 'depreciation_tax_schedule' && compact(page.text.slice(0,1000)).includes('一括償却資産の損金算入')) {
    const index=lines.findIndex(line=>compact(line).startsWith('当期分の損金算入限度額'));
    const next=lines.findIndex((line,row)=>row>index && compact(line).startsWith('当期損金経理額'));
    if (index>=0 && next>index && next-index<=4) {
      const rawText=lines.slice(index,next+1).join('\n');
      const limits=moneyCandidates(lines.slice(index,next).join('\n'));
      const zeros=lines[next].match(/(?<!\d)0(?!\d)/g);
      if (limits.length>0 && zeros?.length===limits.length) add(index,'pooled_depreciation_shortfall','一括償却の損金算入不足額',limits.reduce((sum,item)=>sum+item.amount,0),rawText,
        {status:'derived',formula:'当期分の損金算入限度額合計 - 当期損金経理額（全欄0）',comparisonType:'tax_limit_reference'});
    }
  }
  return rows;
}

export function parseClosingPackage(pagesInput: ClosingPageInput[]): ParsedClosingPackage {
  if (!pagesInput.length || pagesInput.length > MAX_CLOSING_PAGES) throw new Error('PDFページ数が対応範囲外です（1〜400ページ）');
  const seen = new Set<number>();
  const records: ClosingRecord[] = [];
  const pages: ClosingPage[] = [];
  const documentKinds: ParsedClosingPackage['documentKinds'] = [];
  for (const source of pagesInput) {
    if (!Number.isInteger(source.pageNumber) || source.pageNumber < 1 || seen.has(source.pageNumber)) throw new Error('PDFページ番号が不正または重複しています');
    seen.add(source.pageNumber);
    const classification = classifyClosingPage(source.text);
    const warnings = source.text.replace(/\s/g, '').length < 20 ? ['文字情報が少ないページです。原本の確認が必要です。'] : [];
    const extracted = [
      ...genericRecords(source, classification.kind),
      ...(classification.kind === 'loan_detail' ? loanRecords(source) : []),
      ...(classification.kind === 'electronic_receipt' ? receiptRecords(source) : []),
      ...labelledDetailRecords(source, classification.kind),
      ...depreciationRecords(source, classification.kind),
    ];
    records.push(...extracted);
    pages.push({ ...source, ...classification, warnings, recordsCount: extracted.length });
    const group = documentKinds.find(item => item.kind === classification.kind);
    if (group) group.pages.push(source.pageNumber);
    else documentKinds.push({ ...classification, pages: [source.pageNumber] });
  }
  pages.sort((a, b) => a.pageNumber - b.pageNumber);
  if (pages.some((page, index) => page.pageNumber !== index + 1)) throw new Error('PDFの全ページを連番で保存できませんでした');
  const ordinaryDifference = records.find(record=>record.metadata.metricKey==='ordinary_depreciation_difference');
  const pooledDifference = records.find(record=>record.metadata.metricKey==='pooled_depreciation_shortfall');
  if (ordinaryDifference?.amount != null && pooledDifference?.amount != null) {
    const record:ClosingRecord={page:ordinaryDifference.page,rowNo:ordinaryDifference.rowNo,section:'depreciation_summary',accountName:'償却計上額と資料参考額の差（普通償却＋一括償却）',
      amount:ordinaryDifference.amount+pooledDifference.amount,rawText:`${ordinaryDifference.rawText}\n\n${pooledDifference.rawText}`,
      metadata:{metricKey:'depreciation_shortfall',status:'derived',unit:'JPY',formula:'ordinary_depreciation_difference + pooled_depreciation_shortfall',
        sourcePages:[ordinaryDifference.page,pooledDifference.page],comparisonType:'tax_depreciation_limit_reference',
        interpretation:'資料の普通償却額・一括償却損金算入限度額との比較用参考額。現金支出または追加計上の確定額ではありません。'}};
    records.push(record);
    pages.find(page=>page.pageNumber===record.page)!.recordsCount++;
  }
  const reviewCount = records.filter(record => record.metadata.status === 'needs_review').length;
  const unknown = pages.filter(page => page.kind === 'other').length;
  return { pages, records, documentKinds,
    sourceText: pages.map(page => `===== PAGE ${page.pageNumber} =====\n${page.text}`).join('\n'),
    warnings: [ ...(unknown ? [`${unknown}ページは資料分類を自動判定できませんでした。原本・全文は保存済みです。`] : []),
      ...(reviewCount ? [`${reviewCount}行はOCR列対応などの確認が必要です。未確認の金額候補は確定指標に加算しません。`] : []),
      ...pages.flatMap(page => page.warnings.map(warning => `${page.pageNumber}ページ: ${warning}`)), ],
  };
}
