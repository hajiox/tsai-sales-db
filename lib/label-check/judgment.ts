import type { LabelJudgmentResult } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseShelfLifeDays(shelfLife: string): number | null {
  const normalized = shelfLife.normalize("NFKC").trim();
  if (!normalized) return null;

  let totalDays = 0;
  let matched = false;
  const year = normalized.match(/(\d+)\s*年/);
  const month = normalized.match(/(\d+)\s*[ヶかカケ箇]?\s*月/);
  const week = normalized.match(/(\d+)\s*週/);
  const day = normalized.match(/(\d+)\s*日/);

  if (year) {
    totalDays += Number(year[1]) * 365;
    matched = true;
  }
  if (month) {
    totalDays += Number(month[1]) * 30;
    matched = true;
  }
  if (week) {
    totalDays += Number(week[1]) * 7;
    matched = true;
  }
  if (day) {
    totalDays += Number(day[1]);
    matched = true;
  }

  if (!matched && /^\d+$/.test(normalized)) {
    totalDays = Number(normalized);
    matched = true;
  }

  return matched && totalDays > 0 ? totalDays : null;
}

function parseDateOnly(value: string): number | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
}

function todayInTokyo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDateOnly(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function judgeExpiryDate(
  shelfLifeDays: number,
  expiryDate: string,
  manufacturingDate?: string | null,
): LabelJudgmentResult {
  const expiryTimestamp = parseDateOnly(expiryDate);
  const baseTimestamp = parseDateOnly(manufacturingDate || todayInTokyo());
  if (expiryTimestamp === null || baseTimestamp === null) {
    throw new Error("日付の形式が正しくありません");
  }

  const expectedTimestamp = baseTimestamp + shelfLifeDays * DAY_MS;
  const deviationDays = Math.round((expiryTimestamp - expectedTimestamp) / DAY_MS);
  const deviationPercent = Math.round((Math.abs(deviationDays) / shelfLifeDays) * 10000) / 100;
  const threshold = shelfLifeDays >= 730 ? 35 : 25;

  return {
    judgment: deviationPercent <= threshold ? "OK" : "NG",
    shelf_life_days: shelfLifeDays,
    expected_expiry: formatDateOnly(expectedTimestamp),
    deviation_percent: deviationPercent,
    deviation_days: deviationDays,
  };
}
