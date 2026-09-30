import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface FinancialStatementPdfPage {
  number: number;
  text: string;
  rawText: string;
}

interface PositionedText {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function numericText(text: string) {
  const value = text.normalize('NFKC').replace(/\s+/g, '');
  return /^[△▲ムA-]?[\d,]+$/.test(value) ? value.replace(/,/g, '') : null;
}

function deduplicateOverprintedAmounts(items: PositionedText[]) {
  // Scanned accounting PDFs can contain overlapping OCR passes. Only remove
  // matching text at the same position, or numeric fragments covered by a
  // longer complete amount; equal values in separate columns remain intact.
  return items.filter((item, index) => {
    const normalized = item.text.normalize('NFKC').replace(/\s+/g, '');
    const numeric = numericText(item.text);
    return !items.some((other, otherIndex) => {
      if (index === otherIndex || Math.abs(other.y - item.y) > 1.5) return false;
      const otherNormalized = other.text.normalize('NFKC').replace(/\s+/g, '');
      if (
        normalized === otherNormalized &&
        Math.abs(item.x - other.x) < 1.5 &&
        Math.abs(item.width - other.width) < 2
      ) {
        return otherIndex < index;
      }
      const otherNumeric = numericText(other.text);
      if (!numeric || !otherNumeric || otherNumeric.length <= numeric.length) return false;
      const overlap = Math.max(
        0,
        Math.min(item.x + item.width, other.x + other.width) - Math.max(item.x, other.x),
      );
      return otherNumeric.includes(numeric) && overlap >= item.width * 0.85;
    });
  });
}

function reconstructLines(items: PositionedText[], deduplicate: boolean) {
  const source = deduplicate ? deduplicateOverprintedAmounts(items) : items;
  const groups: Array<{ y: number; items: PositionedText[] }> = [];
  for (const item of [...source].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const tolerance = Math.max(1.5, Math.min(2.5, item.height * 0.25));
    let group = groups.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
    if (!group) {
      group = { y: item.y, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups
    .map((group) => {
      const ordered = [...group.items].sort((a, b) => a.x - b.x);
      let result = '';
      let previousRight = 0;
      for (const item of ordered) {
        const gap = result ? Math.max(1, Math.min(40, Math.round((item.x - previousRight) / 3))) : 0;
        result += `${' '.repeat(gap)}${item.text}`;
        previousRight = Math.max(previousRight, item.x + item.width);
      }
      return result.trimEnd();
    })
    .join('\n');
}

export async function extractFinancialStatementPdfText(data: Uint8Array) {
  const loading = getDocument({
    data: new Uint8Array(data),
    verbosity: 0,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await loading.promise;
  try {
    const pages: FinancialStatementPdfPage[] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const items: PositionedText[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        items.push({
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
        });
      }
      pages.push({
        number,
        text: reconstructLines(items, true),
        rawText: reconstructLines(items, false),
      });
      page.cleanup();
    }
    const joinPages = (key: 'text' | 'rawText') =>
      pages.map((page) => `===== PAGE ${page.number} =====\n${page[key]}`).join('\n');
    return { text: joinPages('text'), rawText: joinPages('rawText'), pageCount: pdf.numPages, pages };
  } finally {
    await pdf.destroy();
  }
}
