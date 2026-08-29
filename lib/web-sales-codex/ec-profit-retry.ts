export type EcProfitRetryChannel =
  | "amazon"
  | "rakuten"
  | "yahoo"
  | "mercari"
  | "base"
  | "qoo10"
  | "tiktok";

const RAKUTEN_BILLPAY_CHECK_DAYS = new Set([5, 12, 14, 15, 17, 18, 20]);

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
    // BillPay publishes final statements on the 5th and 20th, and provisional
    // statements around the 10th business day. The bounded mid-month window
    // covers weekends and Japanese holidays without a daily Codex run.
    return RAKUTEN_BILLPAY_CHECK_DAYS.has(input.day);
  }
  return input.monthsAgo === 1;
}

export function isQoo10SettledDetailUnavailable(result: unknown) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return false;
  const record = result as Record<string, unknown>;
  const text = `${String(record.summary || "")} ${String(record.details || "")}`;
  const settlementCompleted = /(?:精算(?:は|が)?完了済み|official settlement completed)/i.test(text);
  const fullFallbackCompleted = /全注文[\s\S]*(?:購入者決済日|purchaser[ -]?payment)[\s\S]*(?:発送日|shipping)[\s\S]*(?:詳細行|detail)[\s\S]*(?:0件|zero)/i.test(text);
  const detailUnavailable = /(?:詳細(?:内訳|行)?[\s\S]*(?:照合でき|取得でき|0件)|detailed reconciliation unavailable)/i.test(text);
  return detailUnavailable && (settlementCompleted || fullFallbackCompleted);
}
