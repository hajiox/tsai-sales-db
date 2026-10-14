import { createHash } from "node:crypto";
import { CHAR_SIU_MATERIALS, CHAR_SIU_OUTPUTS, normalizeCharSiuDate } from "@/lib/char-siu-production";

export const STAFF_PHOTO_BYTES = 3 * 1024 * 1024;
export const STAFF_REQUEST_BYTES = Math.floor(4.25 * 1024 * 1024);
export const STAFF_PHOTO_BUCKET = "char-siu-production-photos";
export const STAFF_ERRORS = {
  INVALID_INPUT: [400, "入力項目・日付・数量を確認してください"],
  UNAUTHORIZED: [401, "製造入力の接続認証が必要です"],
  FORBIDDEN: [403, "この端末または担当者は製造入力を利用できません"],
  NOT_FOUND: [404, "製造入力が見つかりません"],
  REVISION_CONFLICT: [409, "ほかの保存で内容が更新されました。最新の入力を確認してください"],
  IDEMPOTENCY_CONFLICT: [409, "同じ操作番号で異なる内容は保存できません"],
  COMPLETED: [409, "正式登録済みです。修正は管理者へ依頼してください"],
  NOT_READY: [409, "工程入力または管理者の単価確認が完了していません"],
  IN_PROGRESS: [409, "写真を処理中です。処理結果を確認してから操作してください"],
  UPLOAD_FAILED: [409, "写真の保存に失敗しました。最新の入力を確認してから写真を選び直してください"],
  UNAVAILABLE: [503, "処理を確定できません。同じ操作番号で状態を確認してください"],
} as const;
export type StaffErrorCode = keyof typeof STAFF_ERRORS;
export class CharSiuStaffError extends Error {
  constructor(public code: StaffErrorCode) { super(STAFF_ERRORS[code][1]); }
  get status() { return STAFF_ERRORS[this.code][0]; }
}
export type StaffActor = { deviceId: string; operatorName: string };
export type StaffInput = {
  productionDate: string; packagingDate: string | null;
  cookingWorkerCount: number | null; cookingWorkHours: number | null;
  packagingWorkerCount: number | null; packagingWorkHours: number | null;
  materials: Array<{ key: string; usageAmount: number | null }>;
  outputs: Array<{ key: string; quantity: number | null }>;
  notes: string;
};
const uuidPattern = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export function staffUuid(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new CharSiuStaffError("INVALID_INPUT");
  return value.toLowerCase();
}
export function staffObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new CharSiuStaffError("INVALID_INPUT");
  return value as Record<string, unknown>;
}
export function staffRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 2147483646) throw new CharSiuStaffError("INVALID_INPUT");
  return value;
}
export function staffActor(request: Request): StaffActor {
  const deviceId = request.headers.get("x-docscanner-device-id") || "";
  let operatorName = "";
  try { operatorName = decodeURIComponent(request.headers.get("x-docscanner-operator-name") || "").trim().normalize("NFC"); } catch { throw new CharSiuStaffError("FORBIDDEN"); }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,99}$/.test(deviceId) || operatorName.length < 1 || operatorName.length > 80 || /[\u0000-\u001f\u007f]/.test(operatorName)) throw new CharSiuStaffError("FORBIDDEN");
  return { deviceId, operatorName };
}
export function staffTokenHash(request: Request): string {
  const token = /^Bearer (tsa_csp_[A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") || "")?.[1];
  if (!token) throw new CharSiuStaffError("UNAUTHORIZED");
  return createHash("sha256").update(token).digest("hex");
}
export function staffRequestHash(value: unknown): string {
  const canonical = (item: unknown): string => {
    if (Array.isArray(item)) return `[${item.map(canonical).join(",")}]`;
    if (item && typeof item === "object") return `{${Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
    return JSON.stringify(item);
  };
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function optionalNumber(value: unknown, integer: boolean, positive: boolean, maximum: number): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value > maximum || (integer && !Number.isInteger(value)) || (positive ? value <= 0 : value < 0)) throw new CharSiuStaffError("INVALID_INPUT");
  return value;
}
export function parseStaffInput(value: unknown, complete = false): StaffInput {
  const raw = staffObject(value, ["productionDate", "packagingDate", "cookingWorkerCount", "cookingWorkHours", "packagingWorkerCount", "packagingWorkHours", "materials", "outputs", "notes"]);
  const productionDate = normalizeCharSiuDate(raw.productionDate);
  const packagingDate = raw.packagingDate == null ? null : normalizeCharSiuDate(raw.packagingDate);
  if (!productionDate || (raw.packagingDate != null && !packagingDate) || (packagingDate && packagingDate < productionDate)) throw new CharSiuStaffError("INVALID_INPUT");
  const values = (input: unknown, definitions: Array<{ key: string }>, field: "usageAmount" | "quantity") => {
    if (input !== undefined && !Array.isArray(input)) throw new CharSiuStaffError("INVALID_INPUT");
    const entries = (input || []) as unknown[];
    if (entries.length > definitions.length) throw new CharSiuStaffError("INVALID_INPUT");
    const map = new Map<string, number | null>();
    for (const entry of entries) {
      const row = staffObject(entry, ["key", field]);
      if (typeof row.key !== "string" || !definitions.some(definition => definition.key === row.key) || map.has(row.key)) throw new CharSiuStaffError("INVALID_INPUT");
      map.set(row.key, optionalNumber(row[field], field === "quantity", false, 1_000_000_000));
    }
    return definitions.map(definition => ({ key: definition.key, [field]: map.get(definition.key) ?? null }));
  };
  if (raw.notes !== undefined && (typeof raw.notes !== "string" || raw.notes.length > 2000 || raw.notes.includes("\0"))) throw new CharSiuStaffError("INVALID_INPUT");
  const input: StaffInput = {
    productionDate, packagingDate,
    cookingWorkerCount: optionalNumber(raw.cookingWorkerCount, true, true, 1000),
    cookingWorkHours: optionalNumber(raw.cookingWorkHours, false, true, 10000),
    packagingWorkerCount: optionalNumber(raw.packagingWorkerCount, true, true, 1000),
    packagingWorkHours: optionalNumber(raw.packagingWorkHours, false, true, 10000),
    materials: values(raw.materials, CHAR_SIU_MATERIALS, "usageAmount") as StaffInput["materials"],
    outputs: values(raw.outputs, CHAR_SIU_OUTPUTS, "quantity") as StaffInput["outputs"],
    notes: String(raw.notes || "").trim(),
  };
  if (complete && (!input.packagingDate || [input.cookingWorkerCount, input.cookingWorkHours, input.packagingWorkerCount, input.packagingWorkHours].some(number => number === null)
    || !input.materials.some(row => (row.usageAmount ?? 0) > 0) || !input.outputs.some(row => (row.quantity ?? 0) > 0))) throw new CharSiuStaffError("NOT_READY");
  return input;
}
export function safeStaffDraft(row: Record<string, any>, photos: Array<Record<string, any>> = []) {
  if (!row || !["draft", "needs_review", "completed"].includes(row.status)) throw new CharSiuStaffError("UNAVAILABLE");
  return {
    id: row.id, revision: row.revision, status: row.status, input: parseStaffInput(row.input),
    deviceId: row.device_id, operatorName: row.operator_name, createdAt: row.created_at, updatedAt: row.updated_at,
    submittedAt: row.submitted_at ?? null, completedAt: row.completed_at ?? null, runId: row.run_id ?? null,
    photos: photos.map(photo => ({ id: photo.id, fileName: photo.file_name, mimeType: photo.mime_type, size: photo.size_bytes, scanStatus: photo.scan_status || photo.status })),
  };
}
export function staffDefinitions(outputs = CHAR_SIU_OUTPUTS) {
  return { materials: CHAR_SIU_MATERIALS.map(({ key, name, unit }) => ({ key, label: name, unit })), outputs: outputs.map(({ key, name, defaultUnitWeightG }) => ({ key, label: name, unit: "個", unitWeightG: defaultUnitWeightG })) };
}
export async function readStaffJson(request: Request, maximum = 64 * 1024): Promise<unknown> {
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) throw new CharSiuStaffError("INVALID_INPUT");
  const reader = request.body?.getReader();
  if (!reader) throw new CharSiuStaffError("INVALID_INPUT");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > maximum) { await reader.cancel(); throw new CharSiuStaffError("INVALID_INPUT"); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new CharSiuStaffError("INVALID_INPUT"); }
}
