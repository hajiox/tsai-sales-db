import type { SyncPeriod } from "./types";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

export function getReportMonth(startDate: string) {
  return `${startDate.slice(0, 7)}-01`;
}

export function validatePeriod(startDate: string, endDate: string): SyncPeriod {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error("日付の形式が正しくありません");
  }
  if (startDate > endDate) throw new Error("終了日は開始日以降にしてください");
  if (startDate.slice(0, 7) !== endDate.slice(0, 7)) {
    throw new Error("自動集計は同じ月の期間を指定してください");
  }
  return { startDate, endDate, reportMonth: getReportMonth(startDate) };
}

export function getScheduledPeriod(now = new Date()): {
  trigger: "cron_daily" | "cron_half_month" | "cron_previous_month";
  period: SyncPeriod;
} {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth();
  const day = jst.getUTCDate();

  if (day === 16) {
    const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const endDate = `${year}-${String(month + 1).padStart(2, "0")}-15`;
    return {
      trigger: "cron_half_month",
      period: { startDate, endDate, reportMonth: getReportMonth(startDate) },
    };
  }

  if (day === 1) {
    const previousMonthEnd = new Date(Date.UTC(year, month, 0));
    const previousYear = previousMonthEnd.getUTCFullYear();
    const previousMonth = String(previousMonthEnd.getUTCMonth() + 1).padStart(2, "0");
    const endDate = isoDate(previousMonthEnd);
    const startDate = `${previousYear}-${previousMonth}-01`;
    return {
      trigger: "cron_previous_month",
      period: { startDate, endDate, reportMonth: getReportMonth(startDate) },
    };
  }

  const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return {
    trigger: "cron_daily",
    period: { startDate, endDate, reportMonth: getReportMonth(startDate) },
  };
}
