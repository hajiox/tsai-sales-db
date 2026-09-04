import type { CodexJobStatus } from "@/lib/web-sales-codex/types";

export const EC_PRODUCT_REGISTER_TASK_KEY = "ec_product_register" as const;
export const EC_PRODUCT_REGISTER_TARGET = "qoo10" as const;
export const QOO10_PRODUCT_NAME_MAX_LENGTH = 100;

export type EcProductRegisterTarget = typeof EC_PRODUCT_REGISTER_TARGET;

export type EcProductRegisterReference = {
  productIdentifier: string;
  expectedTitleTerms: string[];
  reason: string;
};

export type EcProductRegisterImage = {
  url: string;
  role: "main" | "detail";
  order: number;
};

export type EcProductRegisterResult = {
  status: "completed" | "waiting_for_user" | "needs_review" | "failed";
  site: EcProductRegisterTarget;
  operation: "created" | "already_exists" | "blocked";
  account_label: string | null;
  product_identifier: string | null;
  final_product_name: string | null;
  final_seller_code: string | null;
  final_jan_code: string | null;
  final_price: number | null;
  final_image_count: number | null;
  final_image_urls: string[] | null;
  description_verified: boolean | null;
  category: string | null;
  shipping_code: string | null;
  tax_setting: string | null;
  inventory_setting: string | null;
  dispatch_setting: string | null;
  origin_setting: string | null;
  sale_period_setting: string | null;
  public_url: string | null;
  message: string;
  summary: string;
};

export type EcProductRegisterJobView = {
  id: string;
  status: CodexJobStatus;
  progress: number;
  currentStep: string;
  summary: string | null;
  result: EcProductRegisterResult | null;
  createdAt: string;
  startedAt: string | null;
  heartbeatAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
};

const REFERENCES_BY_JAN: Record<string, EcProductRegisterReference> = {
  "4571318635049": {
    productIdentifier: "1168157064",
    expectedTitleTerms: ["極にぼし", "スープ", "5"],
    reason: "同じ特濃つけ麺シリーズの常温・つけ汁のみ5個セット。カテゴリ、配送、販売単位の参照専用",
  },
};

export function normalizeEcProductRegisterTitle(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function normalizeEcProductRegisterJan(value: unknown) {
  const jan = String(value || "").replace(/\D/g, "");
  return /^\d{13}$/.test(jan) ? jan : "";
}

export function getEcProductRegisterReference(janCode: string | null) {
  return REFERENCES_BY_JAN[normalizeEcProductRegisterJan(janCode)] || null;
}

export function ecProductRegisterResultFromUnknown(value: unknown): EcProductRegisterResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const status = String(candidate.status || "");
  const operation = String(candidate.operation || "");
  if (!new Set(["completed", "waiting_for_user", "needs_review", "failed"]).has(status)) return null;
  if (!new Set(["created", "already_exists", "blocked"]).has(operation)) return null;
  return {
    status: status as EcProductRegisterResult["status"],
    site: EC_PRODUCT_REGISTER_TARGET,
    operation: operation as EcProductRegisterResult["operation"],
    account_label: candidate.account_label ? String(candidate.account_label) : null,
    product_identifier: candidate.product_identifier ? String(candidate.product_identifier) : null,
    final_product_name: candidate.final_product_name ? String(candidate.final_product_name) : null,
    final_seller_code: candidate.final_seller_code ? String(candidate.final_seller_code) : null,
    final_jan_code: candidate.final_jan_code ? String(candidate.final_jan_code) : null,
    final_price: Number.isInteger(Number(candidate.final_price)) ? Number(candidate.final_price) : null,
    final_image_count: Number.isInteger(Number(candidate.final_image_count)) ? Number(candidate.final_image_count) : null,
    final_image_urls: Array.isArray(candidate.final_image_urls) ? candidate.final_image_urls.map(String) : null,
    description_verified: typeof candidate.description_verified === "boolean" ? candidate.description_verified : null,
    category: candidate.category ? String(candidate.category) : null,
    shipping_code: candidate.shipping_code ? String(candidate.shipping_code) : null,
    tax_setting: candidate.tax_setting ? String(candidate.tax_setting) : null,
    inventory_setting: candidate.inventory_setting ? String(candidate.inventory_setting) : null,
    dispatch_setting: candidate.dispatch_setting ? String(candidate.dispatch_setting) : null,
    origin_setting: candidate.origin_setting ? String(candidate.origin_setting) : null,
    sale_period_setting: candidate.sale_period_setting ? String(candidate.sale_period_setting) : null,
    public_url: candidate.public_url ? String(candidate.public_url) : null,
    message: String(candidate.message || "").slice(0, 2000),
    summary: String(candidate.summary || "").slice(0, 2000),
  };
}
