import { createHash, timingSafeEqual } from "node:crypto";

export const DOCSCANNER_FAX_SUMMARY_TASK_KEY = "docscanner_fax_summary" as const;
export const DOCSCANNER_FAX_SUMMARY_MODEL = "gpt-5.6-luna";
export const DOCSCANNER_FAX_SUMMARY_REASONING_EFFORT = "low";
export const DOCSCANNER_FAX_SUMMARY_RULES_VERSION = "2026-08-27.1";
export const DOCSCANNER_FAX_SUMMARY_MAX_IMAGES = 6;
export const DOCSCANNER_FAX_SUMMARY_MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export type DocScannerFaxSummaryResult = {
  document_type: string;
  summary: string;
  key_points: string[];
  action_required: boolean;
  action_items: string[];
  needs_manual_review: boolean;
  unreadable_details: string;
  confidence: "high" | "medium" | "low";
};

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maxLength);
}

function cleanList(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => cleanText(entry, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function normalizeDocScannerFaxSourceKey(value: unknown) {
  const sourceKey = cleanText(value, 140);
  if (!sourceKey || !/^[^\r\n]{1,140}$/.test(sourceKey)) {
    throw new Error("FAX受信IDが正しくありません");
  }
  return sourceKey;
}

export function faxSummaryIdempotencyKey(sourceKey: string) {
  return `docscanner-fax-summary:${createHash("sha256").update(sourceKey).digest("hex")}`;
}

export function isDocScannerIntegrationAuthorized(request: Request) {
  const expected = process.env.TSG_INTEGRATION_SECRET?.trim();
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const provided = request.headers.get("x-tsg-integration-secret")?.trim() || bearer;
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

export function validateDocScannerFaxSummaryResult(value: unknown): DocScannerFaxSummaryResult {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const documentType = cleanText(input.document_type, 80);
  const summary = cleanText(input.summary, 500);
  const confidence = String(input.confidence || "");
  if (!documentType || !summary || !["high", "medium", "low"].includes(confidence)) {
    throw new Error("FAX要約結果の必須項目が正しくありません");
  }
  if (typeof input.action_required !== "boolean" || typeof input.needs_manual_review !== "boolean") {
    throw new Error("FAX要約結果の判定項目が正しくありません");
  }

  return {
    document_type: documentType,
    summary,
    key_points: cleanList(input.key_points, 5, 180),
    action_required: input.action_required,
    action_items: cleanList(input.action_items, 5, 180),
    needs_manual_review: input.needs_manual_review,
    unreadable_details: cleanText(input.unreadable_details, 300),
    confidence: confidence as DocScannerFaxSummaryResult["confidence"],
  };
}

export function formatDocScannerFaxSummaryForTsg(result: DocScannerFaxSummaryResult) {
  const lines = [
    `書類種別: ${result.document_type}`,
    `概要: ${result.summary}`,
  ];
  if (result.key_points.length > 0) {
    lines.push("要点:", ...result.key_points.map((item) => `・${item}`));
  }
  if (result.action_required) {
    lines.push("対応: 必要", ...result.action_items.map((item) => `・${item}`));
  } else {
    lines.push("対応: 特になし");
  }
  if (result.unreadable_details) lines.push(`不鮮明箇所: ${result.unreadable_details}`);
  return cleanText(lines.join("\n"), 2000);
}

export function docScannerFaxSummaryNeedsReview(result: DocScannerFaxSummaryResult) {
  return result.needs_manual_review || result.confidence === "low";
}

export async function updateTsgDocScannerFaxSummary(input: {
  sourceKey: string;
  summaryStatus: "completed" | "needs_review" | "failed";
  summary?: string;
}) {
  const secret = process.env.TSG_INTEGRATION_SECRET?.trim();
  if (!secret) throw new Error("TSG_INTEGRATION_SECRET is not configured");
  const baseUrl = (process.env.TSG_INTEGRATION_BASE_URL || "https://v0-line-blush.vercel.app").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/integrations/doc-scanner/fax-received`, {
    method: "PATCH",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-tsg-integration-secret": secret,
    },
    body: JSON.stringify(input),
  });
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    throw new Error(`TSG FAX要約APIがJSON以外を返しました (HTTP ${response.status})`);
  }
  if (!response.ok) {
    throw new Error(`TSG FAX要約API ${response.status}: ${String(payload.error || "更新失敗").slice(0, 300)}`);
  }
  return payload;
}
