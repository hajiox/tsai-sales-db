import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncPeriod } from "../web-sales-automation/types";

export type CoverageLevel = "complete" | "partial" | "needs_review";
export type EcProfitData = {
  channel: "amazon" | "base";
  report_month: string;
  period_start: string;
  period_end: string;
  report_basis: "order" | "transaction" | "settlement" | "mixed";
  coverage_level: CoverageLevel;
  gross_sales: number;
  refunds: number;
  platform_fees: number;
  payment_fees: number;
  seller_discounts: number;
  seller_coupons: number;
  seller_points: number;
  shipping_costs: number;
  other_costs: number;
  other_credits: number;
  net_payout: number | null;
  excluded_marketplace_funded_discounts: number;
  excluded_ad_costs: number;
  source_files: string[];
  notes: string;
};

export type AcquisitionResult = {
  status: "success" | "needs_review" | "skipped";
  coverageLevel: CoverageLevel;
  importedCount: number;
  source: string;
  details: string;
  warnings: string[];
  totalCost?: number;
  unmatchedCount?: number;
  preservedExisting?: boolean;
  reportId?: string;
  metadata?: Record<string, unknown>;
};

export type AcquisitionOptions = {
  supabase?: SupabaseClient;
  resumeReportId?: string;
  dryRun?: boolean;
};

export type FinanceFetchResult = {
  data: EcProfitData;
  warnings: string[];
  metadata: Record<string, unknown>;
};

export type AdRow = Record<string, unknown> & {
  report_month: string;
  campaign_name: string;
  series_code: number | null;
};

export type AdvertisingFetchResult = {
  rows: AdRow[];
  source: string;
  warnings: string[];
  reportId?: string;
  pending?: boolean;
};

export type { SyncPeriod };
