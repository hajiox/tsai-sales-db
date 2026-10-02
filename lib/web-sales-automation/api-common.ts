import { XMLParser } from "fast-xml-parser";
import { addDays } from "./date";
import type { SyncPeriod } from "./types";

export type ApiRecord = Record<string, unknown>;
export const MAX_API_PAGES = 200;
export const MAX_API_ORDERS = 20_000;

export function apiDeadline(channel: string) {
  const startedAt = Date.now();
  // Only a server-owned local worker can opt into the longer bounded run.
  // This flag is never derived from an HTTP request or a user-supplied period.
  const budget = channel === "yahoo" && process.env.FINANCE_API_LOCAL_WORKER === "1"
    ? 4 * 60 * 60 * 1000 : 210_000;
  return () => {
    // Leave time for a final HTTP response and the server's status write.
    if (Date.now() - startedAt > budget) throw new SalesApiError(channel, "bounded_run_incomplete");
  };
}

export class SalesApiError extends Error {
  constructor(channel: string, public readonly code: string, status?: number) {
    super(`${channel}: API ${code}${status ? ` (HTTP ${status})` : ""}`);
    this.name = "SalesApiError";
  }
}

const YAHOO_OPERATOR_ERROR_CODES: Readonly<Record<string, string>> = {
  "px-04306": "source_ip_not_allowed",
  "px-14303": "business_id_not_registered",
  "px-14304": "seller_not_allowed",
  "px-04303": "order_api_not_approved",
};
const API_OPERATOR_WAIT_CODES = new Set([
  "authentication_required", "permission_required", "account_verification",
  "account_verification_required", "required_credentials", ...Object.values(YAHOO_OPERATOR_ERROR_CODES),
]);

export function apiErrorRequiresOperator(code: unknown): boolean {
  return typeof code === "string" && API_OPERATOR_WAIT_CODES.has(code);
}

// Inspect only a bounded error packet. The provider message, body and unknown
// codes must never escape this function or become part of a saved exception.
async function yahooOperatorErrorCode(response: Response): Promise<string | undefined> {
  const reader = response.body?.getReader();
  if (!reader) return;
  try {
    const decoder = new TextDecoder();
    let length = 0;
    let body = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 64 * 1024) return;
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    if (/<!DOCTYPE|<!ENTITY/i.test(body)) return;
    const parsed = record(body.trimStart().startsWith("{") ? JSON.parse(body)
      : new XMLParser({ parseTagValue: false }).parse(body));
    const result = record(record(parsed.ResultSet).Result || parsed.Result);
    const code = record(parsed.Error).Code ?? record(result.Error).Code;
    if (typeof code === "string" && Object.hasOwn(YAHOO_OPERATOR_ERROR_CODES, code)) {
      return YAHOO_OPERATOR_ERROR_CODES[code];
    }
  } catch {
    // Malformed or unavailable bodies retain the original HTTP classification.
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function record(value: unknown): ApiRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as ApiRecord;
}

export function array(value: unknown): ApiRecord[] {
  return (Array.isArray(value) ? value : value == null ? [] : [value]).map(record);
}

export function textValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export function requiredText(channel: string, value: unknown, field: string): string {
  const text = textValue(value);
  if (!text || text.length > 16_384) throw new SalesApiError(channel, `invalid_${field}`);
  return text;
}

export function numericValue(channel: string, value: unknown, field: string): number {
  if (typeof value !== "number" && (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value.trim()))) {
    throw new SalesApiError(channel, `invalid_${field}`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new SalesApiError(channel, `invalid_${field}`);
  return number;
}

export function quantityValue(channel: string, value: unknown): number {
  const quantity = numericValue(channel, value, "quantity");
  if (!Number.isSafeInteger(quantity)) throw new SalesApiError(channel, "invalid_quantity");
  return quantity;
}

export function jstTimestamp(channel: string, value: unknown): string {
  let text = textValue(value);
  if (/^\d{14}$/.test(text)) {
    text = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T${text.slice(8, 10)}:${text.slice(10, 12)}:${text.slice(12, 14)}+09:00`;
  } else if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(text)) {
    text = `${text.replace(" ", "T")}+09:00`;
  }
  const timestamp = Date.parse(text);
  if (!text || !Number.isFinite(timestamp)) throw new SalesApiError(channel, "invalid_order_date");
  return new Date(timestamp).toISOString();
}

export function unixTimestamp(channel: string, value: unknown): string {
  const seconds = numericValue(channel, value, "order_date");
  if (seconds <= 0) throw new SalesApiError(channel, "invalid_order_date");
  return new Date(seconds * 1000).toISOString();
}

export function requireInPeriod(channel: string, timestamp: string, period: SyncPeriod) {
  const value = Date.parse(timestamp);
  if (value < Date.parse(`${period.startDate}T00:00:00+09:00`)
    || value >= Date.parse(`${addDays(period.endDate, 1)}T00:00:00+09:00`)) {
    throw new SalesApiError(channel, "period_mismatch");
  }
}

// Provider error bodies can echo credentials or customer details. Never propagate them.
export async function apiResponse(channel: string, url: string | URL, init: RequestInit = {}): Promise<Response> {
  try {
    const response = await fetch(url, {
      ...init, cache: "no-store", redirect: "error",
      signal: init.signal || AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      let code = response.status === 401 ? "authentication_required"
        : response.status === 403 ? "permission_required"
          : response.status === 429 ? "rate_limited" : "request_failed";
      if (channel === "yahoo" && new URL(url).origin === "https://circus.shopping.yahooapis.jp") {
        code = await yahooOperatorErrorCode(response) || code;
      }
      throw new SalesApiError(channel, code, response.status);
    }
    return response;
  } catch (error) {
    if (error instanceof SalesApiError) throw error;
    throw new SalesApiError(channel, "connection_or_timeout");
  }
}

export async function apiText(channel: string, url: string | URL, init?: RequestInit): Promise<string> {
  const response = await apiResponse(channel, url, init);
  const text = await response.text().catch(() => { throw new SalesApiError(channel, "response_failed"); });
  if (text.length > 20_000_000) throw new SalesApiError(channel, "response_too_large");
  return text;
}

export async function apiJson(channel: string, url: string | URL, init?: RequestInit): Promise<ApiRecord> {
  const text = await apiText(channel, url, init);
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    const body = parsed as ApiRecord;
    if (body.error || (Array.isArray(body.errors) && body.errors.length)) throw new SalesApiError(channel, "provider_error");
    return body;
  } catch (error) {
    if (error instanceof SalesApiError) throw error;
    throw new SalesApiError(channel, "invalid_response");
  }
}

export function officialEndpoint(channel: string, configured: string | undefined, fallback: string): string {
  const value = configured?.trim().replace(/\/+$/, "") || fallback;
  if (value !== fallback) throw new SalesApiError(channel, "unsupported_endpoint");
  return value;
}

export function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export function apiMetadata(sourceBasis: string, amountBasis: string, reconciliationRequired: boolean) {
  return { acquisitionPath: "api", sourceBasis, amountBasis, reconciliationRequired,
    currency: "JPY", periodTimezone: "Asia/Tokyo", customerDataStored: false };
}
