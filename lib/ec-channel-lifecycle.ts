/** Store lifecycle changes affect new work and period views, never saved history. */
export const EC_RETIRED_FROM = "2026-10-01";
export const ALL_EC_CHANNELS = ["amazon", "rakuten", "yahoo", "mercari", "base", "qoo10", "tiktok"] as const;
export type HistoricalEcChannel = typeof ALL_EC_CHANNELS[number];
export type VisibleEcChannel = HistoricalEcChannel | "makeshop";
export type EcChannelState = "active" | "retired" | "preparing";

const RETIRED_CHANNELS = new Set(["mercari", "qoo10", "tiktok"]);
const CURRENT_CHANNELS = ["amazon", "rakuten", "yahoo", "base"] as const;

function periodMonth(period?: string | Date): string {
  if (period instanceof Date) {
    if (!Number.isFinite(period.getTime())) return "9999-12";
    return new Date(period.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);
  }
  if (period !== undefined) {
    // API callers pass the end of a validated period so a range crossing the
    // retirement boundary cannot fetch a retired store's October activity.
    return /^\d{4}-(0[1-9]|1[0-2])(?:$|-)/.test(period) ? period.slice(0, 7) : "9999-12";
  }
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

export function getEcChannelState(channel: string, period?: string | Date): EcChannelState {
  if (channel === "makeshop") return "preparing";
  return RETIRED_CHANNELS.has(channel) && periodMonth(period) >= EC_RETIRED_FROM.slice(0, 7)
    ? "retired" : "active";
}

export function isEcChannelOperational(channel: string, period?: string | Date): boolean {
  // Non-store channels (Google/Meta advertising, etc.) keep their own policy.
  return getEcChannelState(channel, period) === "active";
}

export function getOperationalEcChannels(period?: string | Date): HistoricalEcChannel[] {
  return ALL_EC_CHANNELS.filter(channel => isEcChannelOperational(channel, period));
}

export function getVisibleEcChannels(period?: string | Date): VisibleEcChannel[] {
  return periodMonth(period) < EC_RETIRED_FROM.slice(0, 7)
    ? [...ALL_EC_CHANNELS] : [...CURRENT_CHANNELS, "makeshop"];
}

export function ecChannelUnavailableReason(channel: string): string {
  return channel === "makeshop" ? "makeshopは開店準備中のため、新規処理は実行しません"
    : "2026年9月末に退店済みのため、新規取得・自動処理は実行しません。過去データ・保存済み資料は保持しています";
}
