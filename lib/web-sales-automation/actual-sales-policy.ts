export class ActualSalesAmountUnavailableError extends Error {
  constructor(channel: string) {
    super(`${channel}: 公式商品売上金額を取得できません。商品別売上レポートを取り込んでください`);
    this.name = "ActualSalesAmountUnavailableError";
  }
}

// This accepts an actual EC line/report total only. An EC catalog/unit price
// multiplied by quantity cannot establish discounts or merchandise revenue.
export function requireReportedAmount(channel: string, value: unknown): number {
  if (value == null || value === "" || typeof value === "boolean" || !Number.isFinite(Number(value))) {
    throw new ActualSalesAmountUnavailableError(channel);
  }
  return Number(value);
}
