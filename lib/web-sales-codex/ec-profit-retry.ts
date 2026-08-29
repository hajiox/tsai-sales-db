export type EcProfitRetryChannel =
  | "amazon"
  | "rakuten"
  | "yahoo"
  | "mercari"
  | "base"
  | "qoo10"
  | "tiktok";

const RAKUTEN_BILLPAY_CHECK_DAYS = new Set([12, 14, 15, 17, 18, 20]);

export function settlementPeriodMonthsAgo(year: number, monthIndex: number, monthsAgo: number) {
  if (!Number.isInteger(monthsAgo) || monthsAgo < 1) {
    throw new Error("monthsAgo must be a positive integer");
  }
  const end = new Date(Date.UTC(year, monthIndex - monthsAgo + 1, 0));
  const reportYear = end.getUTCFullYear();
  const reportMonth = String(end.getUTCMonth() + 1).padStart(2, "0");
  return {
    startDate: `${reportYear}-${reportMonth}-01`,
    endDate: end.toISOString().slice(0, 10),
    reportMonth: `${reportYear}-${reportMonth}`,
  };
}

export function isAutomaticSettlementRetryDue(input: {
  channel: EcProfitRetryChannel;
  day: number;
  weekday: number;
  monthsAgo: number;
}) {
  if (input.monthsAgo > 2) return false;
  if (input.monthsAgo === 2 && input.channel !== "rakuten" && input.channel !== "qoo10") {
    return false;
  }
  if (input.channel === "qoo10") {
    // Qoo10 settles orders on Wednesday. Check the settled ledger the next morning.
    return input.weekday === 4;
  }
  if (input.channel === "rakuten") {
    // BillPay announces provisional statements around the 10th business day.
    // The bounded window covers weekends and Japanese holidays without a daily Codex run.
    return RAKUTEN_BILLPAY_CHECK_DAYS.has(input.day);
  }
  return input.monthsAgo === 1;
}
