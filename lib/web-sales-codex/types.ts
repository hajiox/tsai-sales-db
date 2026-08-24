import type { WebSalesChannel } from "@/lib/web-sales-automation/types";

export type CodexChannel = WebSalesChannel | "google" | "meta";

export type CodexTaskKey =
  | "web_sales_import"
  | "ad_cost_import"
  | "ec_profit_import"
  | "ec_price_update"
  | "ec_product_name_update"
  | "web_sales_analysis";

export type CodexJobStatus =
  | "queued"
  | "running"
  | "waiting_for_user"
  | "needs_review"
  | "completed"
  | "failed"
  | "cancelled";

export type CodexJobTrigger =
  | "manual"
  | "scheduled_half_month"
  | "scheduled_previous_month"
  | "retry"
  | "test";

export type CodexTaskDefinition = {
  key: Exclude<CodexTaskKey, "web_sales_analysis" | "ec_price_update" | "ec_product_name_update">;
  channel: CodexChannel;
  label: string;
  shortLabel: string;
  description: string;
  archiveFolder: string;
  schedule: string;
};

export type EnqueueCodexJobsInput = {
  taskKey?: Exclude<CodexTaskKey, "web_sales_analysis" | "ec_price_update" | "ec_product_name_update">;
  channels: CodexChannel[];
  startDate: string;
  endDate: string;
  triggerType: Exclude<CodexJobTrigger, "test">;
  requestedBy?: string | null;
  idempotencyPrefix?: string | null;
};
