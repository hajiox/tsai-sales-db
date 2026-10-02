import {
  WEB_SALES_CHANNELS,
  type ChannelConfigStatus,
  type WebSalesChannel,
} from "./types";
import { getConfiguredApiCredentialNames } from "../finance-acquisition/credential-store";
import { financeCapability } from "../finance-acquisition/capabilities";

const CHANNEL_LABELS: Record<WebSalesChannel, string> = {
  amazon: "Amazon",
  rakuten: "楽天市場",
  yahoo: "Yahoo!ショッピング",
  mercari: "メルカリShops",
  base: "BASE",
  qoo10: "Qoo10",
  tiktok: "TikTok Shop",
};

const REQUIRED_ENV: Record<WebSalesChannel, string[]> = {
  amazon: [
    "AMAZON_SP_API_CLIENT_ID",
    "AMAZON_SP_API_CLIENT_SECRET",
    "AMAZON_SP_API_REFRESH_TOKEN",
    "AMAZON_SP_API_SELLER_ID",
  ],
  rakuten: ["RAKUTEN_RMS_SERVICE_SECRET", "RAKUTEN_RMS_LICENSE_KEY"],
  yahoo: [
    "YAHOO_SHOPPING_CLIENT_ID",
    "YAHOO_SHOPPING_CLIENT_SECRET",
    "YAHOO_SHOPPING_REFRESH_TOKEN",
    "YAHOO_SHOPPING_SELLER_ID",
  ],
  mercari: ["MERCARI_SHOPS_ACCESS_TOKEN", "MERCARI_SHOPS_USER_AGENT"],
  base: ["BASE_CLIENT_ID", "BASE_CLIENT_SECRET", "BASE_REFRESH_TOKEN", "BASE_SHOP_ID", "BASE_REDIRECT_URI"],
  qoo10: ["QOO10_API_KEY"],
  tiktok: [
    "TIKTOK_SHOP_APP_KEY",
    "TIKTOK_SHOP_APP_SECRET",
    "TIKTOK_SHOP_ACCESS_TOKEN",
    "TIKTOK_SHOP_SHOP_CIPHER",
  ],
};

export function getChannelLabel(channel: WebSalesChannel) {
  return CHANNEL_LABELS[channel];
}

export function getChannelConfigStatus(
  channel: WebSalesChannel,
): ChannelConfigStatus {
  const missing = REQUIRED_ENV[channel].filter(
    (name) => !process.env[name]?.trim(),
  );
  return {
    channel,
    label: CHANNEL_LABELS[channel],
    configured: missing.length === 0,
    missing,
  };
}

export function getAllChannelConfigStatuses() {
  return WEB_SALES_CHANNELS.map(getChannelConfigStatus);
}

function statusFromNames(channel: WebSalesChannel, configuredNames: Set<string>): ChannelConfigStatus {
  const capability = financeCapability("sales", channel, configuredNames);
  return { channel, label: CHANNEL_LABELS[channel], configured: capability.api_ready, missing: capability.missing_config };
}

/** Server-only: encrypted managed credentials take precedence during execution. */
export async function getChannelConfigStatusAsync(channel: WebSalesChannel): Promise<ChannelConfigStatus> {
  if (!["amazon", "rakuten", "yahoo", "base"].includes(channel)) return getChannelConfigStatus(channel);
  return statusFromNames(channel, await getConfiguredApiCredentialNames());
}

export async function getAllChannelConfigStatusesAsync(): Promise<ChannelConfigStatus[]> {
  const names = await getConfiguredApiCredentialNames();
  return WEB_SALES_CHANNELS.map(channel => ["amazon", "rakuten", "yahoo", "base"].includes(channel)
    ? statusFromNames(channel, names) : getChannelConfigStatus(channel));
}

export function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
