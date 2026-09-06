import { parse } from "csv-parse/sync";

export function validateYahooDailyReport(text: string, start: string, end: string, quantity: number, amount: number) {
  const rows = parse(text.replace(/^\uFEFF/, ""), { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  const dates = rows.map((row) => String(row["日付"] || "").replace(/\//g, "-"));
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  if (rows.length !== days || new Set(dates).size !== days || dates.some((date) => date < start || date > end)) {
    throw new Error("Yahoo日別CSVが対象期間の全日を網羅していません");
  }
  const number = (value: unknown) => {
    const text = String(value ?? "").replace(/,/g, "").trim();
    if (!text || !Number.isFinite(Number(text))) throw new Error("Yahoo日別CSVの金額・数量を確認できません");
    return Number(text);
  };
  const dailyQuantity = rows.reduce((sum, row) => sum + number(row["注文数 - 注文点数合計"]), 0);
  const dailyAmount = rows.reduce((sum, row) => sum + number(row["売上合計値"]), 0);
  if (Math.abs(quantity - dailyQuantity) > 0.01 || Math.abs(amount - dailyAmount) > 1) {
    throw new Error(`Yahoo商品CSVと日別合計が不一致（商品 ${quantity}点/${amount}円・日別 ${dailyQuantity}点/${dailyAmount}円）`);
  }
  return { periodStart: start, periodEnd: end, quantity: dailyQuantity, amount: dailyAmount };
}
