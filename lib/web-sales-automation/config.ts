import {
  WEB_SALES_CHANNELS,
  type ChannelConfigStatus,
  type WebSalesChannel,
} from "./types";

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
  ],
  rakuten: ["RAKUTEN_RMS_SERVICE_SECRET", "RAKUTEN_RMS_LICENSE_KEY"],
  yahoo: [
    "YAHOO_SHOPPING_CLIENT_ID",
    "YAHOO_SHOPPING_CLIENT_SECRET",
    "YAHOO_SHOPPING_REFRESH_TOKEN",
    "YAHOO_SHOPPING_SELLER_ID",
  ],
  mercari: ["MERCARI_SHOPS_ACCESS_TOKEN", "MERCARI_SHOPS_USER_AGENT"],
  base: ["BASE_CLIENT_ID", "BASE_CLIENT_SECRET", "BASE_REFRESH_TOKEN"],
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

export function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
