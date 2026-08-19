import { createClient } from "@supabase/supabase-js";

const CHANNELS = [
  { code: "WEB", label: "WEB販売実績" },
  { code: "WHOLESALE", label: "卸・OEM売上実績" },
  { code: "STORE", label: "会津ブランド館（店舗）売上実績" },
  { code: "SHOKU", label: "道の駅（食）売上実績" },
] as const;

const TARGET_LABELS: Record<string, string> = {
  WEB: "WEB販売／今年度目標",
  WHOLESALE: "卸・OEM／今年度目標",
  STORE: "会津ブランド館（店舗）／今年度目標",
  SHOKU: "道の駅（食）／今年度目標",
};

type ManualEntry = {
  metric: string;
  channel_code: string;
  amount: number | string | null;
};

export type KpiCompletenessResult = {
  targetMonth: string;
  targetMonthLabel: string;
  fiscalYear: number;
  complete: boolean;
  missing: string[];
  actuals: Record<string, number>;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("TSA Supabase credentials are not configured");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getJstDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    isoDate: `${values.year}-${values.month}-${values.day}`,
  };
}

export function getPreviousMonth(now = new Date()) {
  const jst = getJstDateParts(now);
  const date = new Date(Date.UTC(jst.year, jst.month - 2, 1));
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const next = new Date(Date.UTC(year, month, 1));
  const targetMonth = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return {
    targetMonth,
    nextMonth,
    label: `${year}年${month}月分`,
    fiscalYear: month >= 8 ? year + 1 : year,
  };
}

function hasManualEntry(
  entries: ManualEntry[],
  metric: string,
  channel: string,
  requirePositive = false,
) {
  const row = entries.find(
    (entry) => entry.metric === metric && entry.channel_code === channel,
  );
  if (!row) return false;
  return !requirePositive || Number(row.amount || 0) > 0;
}

export async function assessPreviousMonthKpi(
  now = new Date(),
): Promise<KpiCompletenessResult> {
  const supabase = getSupabase();
  const range = getPreviousMonth(now);

  const [web, wholesale, store, shoku, manual] = await Promise.all([
    supabase.rpc("get_web_sales_monthly", {
      start_date: range.targetMonth,
      end_date: range.nextMonth,
    }),
    supabase.rpc("get_wholesale_sales_monthly", {
      start_date: range.targetMonth,
      end_date: range.nextMonth,
    }),
    supabase.rpc("get_store_sales_monthly", {
      start_date: range.targetMonth,
      end_date: range.nextMonth,
    }),
    supabase.rpc("get_shoku_sales_monthly", {
      start_date: range.targetMonth,
      end_date: range.nextMonth,
    }),
    supabase
      .from("kpi_manual_entries_v1")
      .select("metric, channel_code, amount")
      .eq("month", range.targetMonth),
  ]);

  const results = { WEB: web, WHOLESALE: wholesale, STORE: store, SHOKU: shoku };
  for (const [channel, result] of Object.entries(results)) {
    if (result.error) {
      throw new Error(`${channel} KPIの取得に失敗しました: ${result.error.message}`);
    }
  }
  if (manual.error) {
    throw new Error(`KPI手入力データの取得に失敗しました: ${manual.error.message}`);
  }

  const actuals: Record<string, number> = {};
  for (const channel of CHANNELS) {
    const rows = (results[channel.code].data || []) as { amount?: unknown }[];
    actuals[channel.code] = rows.reduce(
      (sum, row) => sum + Number(row.amount || 0),
      0,
    );
  }

  const manualEntries = (manual.data || []) as ManualEntry[];
  const missing: string[] = [];

  for (const channel of CHANNELS) {
    if (actuals[channel.code] <= 0) missing.push(channel.label);
    if (!hasManualEntry(manualEntries, "target", channel.code, true)) {
      missing.push(TARGET_LABELS[channel.code]);
    }
  }

  if (!hasManualEntry(manualEntries, "acquisition_target", "SALES_TEAM", true)) {
    missing.push("営業活動（新規・OEM獲得数）／目標");
  }
  if (!hasManualEntry(manualEntries, "acquisition_actual", "SALES_TEAM")) {
    missing.push("営業活動実績（新規・OEM獲得数）／実績");
  }
  if (!hasManualEntry(manualEntries, "manufacturing_target", "FACTORY", true)) {
    missing.push("商品製造数／製造目標");
  }
  if (!hasManualEntry(manualEntries, "manufacturing_actual", "FACTORY")) {
    missing.push("商品製造数／製造実績");
  }

  return {
    targetMonth: range.targetMonth.slice(0, 7),
    targetMonthLabel: range.label,
    fiscalYear: range.fiscalYear,
    complete: missing.length === 0,
    missing,
    actuals,
  };
}
