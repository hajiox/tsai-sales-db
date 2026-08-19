export const WEB_SALES_CHANNELS = [
  "amazon",
  "rakuten",
  "yahoo",
  "mercari",
  "base",
  "qoo10",
  "tiktok",
] as const;

export type WebSalesChannel = (typeof WEB_SALES_CHANNELS)[number];

export type WebSalesTrigger =
  | "manual"
  | "cron_daily"
  | "cron_half_month"
  | "cron_previous_month"
  | "mapping_retry";

export type SyncPeriod = {
  startDate: string;
  endDate: string;
  reportMonth: string;
};

export type NormalizedSalesItem = {
  externalOrderId: string;
  externalLineId: string;
  externalProductKey: string;
  externalProductName: string;
  occurredAt: string | null;
  quantity: number;
  amount: number;
  sourceStatus: string | null;
  rawData: Record<string, unknown>;
};

export type ChannelFetchResult = {
  items: NormalizedSalesItem[];
  metadata?: Record<string, unknown>;
};

export type ChannelConfigStatus = {
  channel: WebSalesChannel;
  label: string;
  configured: boolean;
  missing: string[];
};

export type ChannelSyncResult = {
  runId: string;
  channel: WebSalesChannel;
  status: "success" | "needs_review" | "failed" | "skipped";
  itemCount: number;
  quantityTotal: number;
  matchedCount: number;
  unmatchedCount: number;
  error?: string;
};
