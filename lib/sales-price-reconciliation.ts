export function explicitPackCount(name: string): number | null {
  const text = name.normalize("NFKC");
  if (/【単品】/.test(text)) return 1;
  const match = text.match(/(?:[×x]\s*)?(\d+)\s*(?:個|食|本|袋)(?:セット|入|$|\s)/);
  return match ? Number(match[1]) : null;
}

export function hasPackConflict(source: string, target: string): boolean {
  const a = explicitPackCount(source);
  const b = explicitPackCount(target);
  return a !== null && b !== null && a !== b;
}

export function priceDifference(reference: number, observed: number): boolean {
  return reference > 0 && observed >= 0
    && Math.abs(reference - observed) > Math.max(2, reference * 0.02);
}
