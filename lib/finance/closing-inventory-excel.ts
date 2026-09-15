import * as XLSX from "xlsx";
import type { ClosingInventoryReport, ExportCell } from "./closing-inventory";

export const inventoryStatusLabel = (status: string) => status === "missing" ? "未作成" : status === "completed" ? "確定済み" : "入力中";
export const inventoryTotalNote = "各元画面の金額を合算しています。税込・税別・実売単価ベースが混在します。";

export function buildClosingInventoryExcel(report: ClosingInventoryReport) {
  const workbook = XLSX.utils.book_new();
  const summary: ExportCell[][] = [
    [`${report.fiscalYear}年度 決算棚卸し一覧`],
    ["対象期間", `${report.fiscalYear - 1}年8月〜${report.fiscalYear}年7月`],
    ["取得日時", new Date(report.fetchedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })],
    [inventoryTotalNote],
    [report.hasIncomplete ? "未作成・入力中・要確認を含むため、金額は暫定です。" : "各棚卸しは確定済みです。"],
    ["システム", "棚卸し", "棚卸日", "状況", "金額基準", "棚卸金額（円）", "要確認件数", "備考"],
    ...report.rows.map(row => [row.system, row.label, row.date, inventoryStatusLabel(row.status), row.basis, row.amount, row.pendingCount, row.warning]),
    [report.hasIncomplete ? "入力済み金額の合計（暫定）" : "合計", null, null, null, null, report.total],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(summary);
  const totalRow = summary.length;
  sheet[`F${totalRow}`] = { t: "n", v: report.total, f: `SUM(F7:F${totalRow - 1})`, z: '#,##0"円"' };
  for (let i = 7; i < totalRow; i++) if (sheet[`F${i}`]?.t === "n") sheet[`F${i}`].z = '#,##0"円"';
  sheet["!cols"] = [24, 24, 14, 12, 30, 22, 14, 55].map(wch => ({ wch }));
  sheet["!autofilter"] = { ref: `A6:H${totalRow - 1}` };
  sheet["!merges"] = [0, 3, 4].map(r => ({ s: { r, c: 0 }, e: { r, c: 7 } }));
  XLSX.utils.book_append_sheet(workbook, sheet, "決算棚卸し一覧");
  report.rows.forEach((row, index) => {
    if (row.status === "missing") return;
    const detail = XLSX.utils.aoa_to_sheet([
      [`${report.fiscalYear}年度 ${row.label}`],
      ["システム", row.system, "棚卸日", row.date],
      ["状況", inventoryStatusLabel(row.status), "金額基準", row.basis],
      ["棚卸金額（円）", row.amount, "確認事項", row.warning],
      [], ...row.details,
    ]);
    detail["!cols"] = [38, 22, 20, 32, 22, 40].map(wch => ({ wch }));
    if (detail.B4?.t === "n") detail.B4.z = '#,##0"円"';
    // Values are a dated snapshot of the screen. Source formulas are not copied
    // into a differently arranged workbook, avoiding broken external references.
    XLSX.utils.book_append_sheet(workbook, detail, `${index + 1}_${row.label}`.replace(/[\\/?*\[\]:]/g, "_").slice(0, 31));
  });
  return workbook;
}
