import { addMonths, format, isBefore, parseISO, startOfMonth } from "date-fns";

export type FiscalWindow = {
  start: string;
  end: string;
  months: string[];
  fiscalLabel: string;
  fiscalStartYear: number;
  fiscalEndYear: number;
};

function padMonth(month: number) {
  return String(month).padStart(2, "0");
}

/**
 * 会計年度（8月開始）に基づいた12か月のウィンドウを返す。
 * latestMonthISO が含まれる直近の「完了済み」FYを対象とする。
 */
export function fiscalWindowFromLatest(
  latestMonthISO: string,
  fiscalStartMonth = 8
): FiscalWindow {
  if (!latestMonthISO) {
    throw new Error("latestMonthISO is required");
  }

  const latest = startOfMonth(parseISO(latestMonthISO));
  if (Number.isNaN(latest.getTime())) {
    throw new Error(`Invalid latestMonthISO: ${latestMonthISO}`);
  }

  const latestYear = latest.getUTCFullYear();
  const pivot = parseISO(`${latestYear}-${padMonth(fiscalStartMonth)}-01`);
  const fiscalEndYear = isBefore(latest, pivot) ? latestYear - 1 : latestYear;
  const fiscalStartYear = fiscalEndYear - 1;

  const start = parseISO(`${fiscalStartYear}-${padMonth(fiscalStartMonth)}-01`);
  const months: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    const m = addMonths(start, i);
    months.push(format(m, "yyyy-MM-01"));
  }
  const end = addMonths(start, 11);

  if (months.length !== 12) {
    throw new Error(`Fiscal window must be 12 months but got ${months.length}`);
  }

  const fiscalLabel = `FY${String(fiscalEndYear).slice(-2).padStart(2, "0")}`;

  return {
    start: format(start, "yyyy-MM-01"),
    end: format(end, "yyyy-MM-01"),
    months,
    fiscalLabel,
    fiscalStartYear,
    fiscalEndYear,
  };
}
