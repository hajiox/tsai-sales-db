import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PDFParse } from 'pdf-parse';
import { parseFinancialStatementText } from '../lib/finance/financial-statement-parser';

async function main() {
  const pdfPath = process.env.TSA_FINANCIAL_STATEMENT_PDF;
  if (!pdfPath) throw new Error('TSA_FINANCIAL_STATEMENT_PDF is required');

  const parser = new PDFParse({ data: readFileSync(pdfPath) });
  try {
    const textResult = await parser.getText({
      lineEnforce: true,
      cellSeparator: ' ',
      pageJoiner: '\n===== PAGE page_number =====\n',
    });
    const parsed = parseFinancialStatementText(textResult.text);

    assert.equal(parsed.companyName, '株式会社テクニカルスタッフ');
    assert.equal(parsed.periodNumber, 19);
    assert.equal(parsed.periodStart, '2024-08-01');
    assert.equal(parsed.periodEnd, '2025-07-31');
    assert.equal(parsed.pageCount, 7);
    assert.equal(parsed.metrics.long_term_borrowings, 85_449_620);
    assert.equal(parsed.metrics.beginning_inventory, 14_789_842);
    assert.equal(parsed.metrics.ending_inventory, 16_729_453);
    assert.equal(parsed.validation.balanceSheet.passed, true);
    assert.equal(parsed.validation.incomeStatement.passed, true);

    console.log(JSON.stringify({
      ok: true,
      pages: parsed.pageCount,
      companyName: parsed.companyName,
      periodNumber: parsed.periodNumber,
      metrics: parsed.metrics,
      warnings: parsed.warnings,
    }, null, 2));
  } finally {
    await parser.destroy();
  }
}

void main();
