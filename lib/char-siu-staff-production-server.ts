import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { extractCharSiuDeliveryNote } from "@/lib/char-siu-delivery-note-ai";
import { normalizeDeliveryNoteItems, isCompleteDeliveryNoteScan } from "@/lib/char-siu-delivery-note";
import { prepareCharSiuProductionSources, charSiuProductionRunRecord, charSiuProductionRows, charSiuOutputDefinitions } from "@/lib/char-siu-production-service";
import { CharSiuStaffError, STAFF_ERRORS, STAFF_PHOTO_BUCKET, STAFF_PHOTO_BYTES, STAFF_REQUEST_BYTES,
  parseStaffInput, readStaffJson, safeStaffDraft, staffActor, staffDefinitions, staffObject, staffRequestHash, staffRevision, staffTokenHash, staffUuid,
  type StaffActor, type StaffErrorCode } from "@/lib/char-siu-staff-production";

type Db = SupabaseClient<any, "public">;
type Row = Record<string, any>;
function dbClient(): Db {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new CharSiuStaffError("UNAVAILABLE");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
function response(data: unknown, status = 200) { return Response.json(data, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
export async function staffResponse(work: () => Promise<Response>): Promise<Response> {
  try { return await work(); } catch (cause) {
    const error = cause instanceof CharSiuStaffError ? cause : new CharSiuStaffError("UNAVAILABLE");
    return response({ success: false, code: error.code, error: error.message }, error.status);
  }
}
async function rpc(db: Db, name: string, args: Record<string, unknown>): Promise<Row> {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    const code = /^CSP_([A-Z_]+)$/.exec(error.message || "")?.[1];
    throw new CharSiuStaffError(code && Object.hasOwn(STAFF_ERRORS, code) ? code as StaffErrorCode : "UNAVAILABLE");
  }
  if (!data || typeof data !== "object" || !data.draft || !Array.isArray(data.photos)) throw new CharSiuStaffError("UNAVAILABLE");
  return data;
}
async function authenticate(db: Db, request: Request) {
  const hash = staffTokenHash(request); const actor = staffActor(request);
  const { data, error } = await db.from("char_siu_staff_connections").select("id,label,enabled,revoked_at,expires_at,allowed_device_ids,allowed_operator_names").eq("token_hash", hash).maybeSingle();
  if (error) throw new CharSiuStaffError("UNAVAILABLE");
  if (!data || data.enabled !== true || data.revoked_at || (data.expires_at && Date.parse(data.expires_at) <= Date.now())) throw new CharSiuStaffError("UNAUTHORIZED");
  if ((data.allowed_device_ids !== null && (!Array.isArray(data.allowed_device_ids) || !data.allowed_device_ids.includes(actor.deviceId)))
    || (data.allowed_operator_names !== null && (!Array.isArray(data.allowed_operator_names) || !data.allowed_operator_names.includes(actor.operatorName)))) throw new CharSiuStaffError("FORBIDDEN");
  return { connection: data, actor };
}
async function manager(request: Request, mutation = false): Promise<string> {
  const session = await getServerSession(authOptions);
  const actor = session?.user?.email?.trim().toLowerCase();
  if (actor !== "aizubrandhall@gmail.com") throw new CharSiuStaffError("UNAUTHORIZED");
  if (mutation && request.headers.get("origin") !== new URL(request.url).origin) throw new CharSiuStaffError("FORBIDDEN");
  return actor;
}
async function photoRows(db: Db, ids: string[]): Promise<Row[]> {
  if (!ids.length) return [];
  const { data, error } = await db.from("char_siu_staff_photos").select("id,draft_id,scan_id,file_name,mime_type,size_bytes,status,created_at").in("draft_id", ids).order("created_at", { ascending: true });
  if (error) throw new CharSiuStaffError("UNAVAILABLE");
  const photos: Row[] = data || [];
  const scanIds = [...new Set(photos.map(photo => photo.scan_id).filter(Boolean))];
  if (scanIds.length) {
    const scans = await db.from("char_siu_delivery_note_scans").select("id,status").in("id", scanIds);
    if (scans.error) throw new CharSiuStaffError("UNAVAILABLE");
    for (const photo of photos) photo.scan_status = scans.data?.find(scan => scan.id === photo.scan_id)?.status || photo.status;
  }
  return photos;
}
async function findDraft(db: Db, id: string, connectionId?: string): Promise<Row> {
  let query = db.from("char_siu_staff_drafts").select("*").eq("id", id);
  if (connectionId) query = query.eq("connection_id", connectionId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new CharSiuStaffError("UNAVAILABLE");
  if (!data) throw new CharSiuStaffError("NOT_FOUND");
  return data;
}
function safeManagerDraft(row: Row, photos: Row[], label: string) {
  const safe = safeStaffDraft(row, photos);
  return { ...safe, connectionId: row.connection_id, connectionLabel: label, scanId: row.scan_id ?? null,
    photos: safe.photos.map(photo => ({ ...photo, url: `/api/recipe/char-siu-production/staff-drafts/${row.id}/photos/${photo.id}` })) };
}
function actorArgs(connection: Row, actor: StaffActor) { return { p_connection_id: connection.id, p_device_id: actor.deviceId, p_operator_name: actor.operatorName }; }
async function staffConfig(db: Db) {
  const { data, error } = await db.from("char_siu_production_settings").select("block_unit_weight_g,lard_unit_weight_g,minced_chashu_unit_weight_g").eq("id", 1).single();
  if (error || !data) throw new CharSiuStaffError("UNAVAILABLE");
  return staffDefinitions(charSiuOutputDefinitions(data));
}

export async function staffGet(request: Request): Promise<Response> {
  return staffResponse(async () => {
    const db = dbClient(); const { connection } = await authenticate(db, request);
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some(key => key !== "draftId")) throw new CharSiuStaffError("INVALID_INPUT");
    const id = url.searchParams.get("draftId");
    if (id) {
      const draft = await findDraft(db, staffUuid(id), connection.id);
      return response({ success: true, config: await staffConfig(db), draft: safeStaffDraft(draft, await photoRows(db, [draft.id])) });
    }
    const { data, error } = await db.from("char_siu_staff_drafts").select("*").eq("connection_id", connection.id).order("updated_at", { ascending: false }).limit(100);
    if (error) throw new CharSiuStaffError("UNAVAILABLE");
    const drafts = data || []; const photos = await photoRows(db, drafts.map(draft => draft.id));
    return response({ success: true, config: await staffConfig(db), drafts: drafts.map(draft => safeStaffDraft(draft, photos.filter(photo => photo.draft_id === draft.id))) });
  });
}
export async function staffPost(request: Request): Promise<Response> {
  return staffResponse(async () => {
    const db = dbClient(); const { connection, actor } = await authenticate(db, request);
    const raw = staffObject(await readStaffJson(request), ["action", "draftId", "expectedRevision", "clientOperationId", "input"]);
    if (raw.action !== "saveDraft" && raw.action !== "submit") throw new CharSiuStaffError("INVALID_INPUT");
    const draftId = raw.draftId === undefined ? null : staffUuid(raw.draftId);
    const revision = staffRevision(raw.expectedRevision); const operation = staffUuid(raw.clientOperationId);
    if ((!draftId && (raw.action !== "saveDraft" || revision !== 0)) || (raw.action === "submit" && raw.input !== undefined)) throw new CharSiuStaffError("INVALID_INPUT");
    const input = raw.action === "saveDraft" ? parseStaffInput(raw.input) : null;
    const hash = staffRequestHash({ actor, action: raw.action, draftId, expectedRevision: revision, input });
    const result = await rpc(db, "char_siu_staff_apply", { ...actorArgs(connection, actor), p_action: raw.action, p_client_operation_id: operation,
      p_expected_revision: revision, p_draft_id: draftId, p_request_hash: hash, p_input: input, p_photos: [] });
    return response({ success: true, draft: safeStaffDraft(result.draft, result.photos) });
  });
}
type PreparedPhoto = { fileName: string; mimeType: string; size: number; sha256: string; bytes: Buffer };
function staffPhotoResponse(result: Row, operation: string): Response {
  const draft = safeStaffDraft(result.draft, result.photos);
  if (result.errorCode === "UPLOAD_FAILED") return response({ success: false, code: "UPLOAD_FAILED", error: STAFF_ERRORS.UPLOAD_FAILED[1], draft }, 409);
  return response({ success: true, ...(result.processing ? { processing: true, clientOperationId: operation } : {}), draft }, result.processing ? 202 : 200);
}
function parsePhotos(value: unknown): PreparedPhoto[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) throw new CharSiuStaffError("INVALID_INPUT");
  let total = 0;
  return value.map(entry => {
    const row = staffObject(entry, ["fileName", "mimeType", "base64"]);
    if (typeof row.fileName !== "string" || !row.fileName.trim() || row.fileName.length > 160 || /[\u0000-\u001f\u007f/\\]/.test(row.fileName)
      || typeof row.mimeType !== "string" || !["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(row.mimeType)
      || typeof row.base64 !== "string" || row.base64.length > STAFF_REQUEST_BYTES || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(row.base64)) throw new CharSiuStaffError("INVALID_INPUT");
    const bytes = Buffer.from(row.base64, "base64");
    if (bytes.toString("base64") !== row.base64) throw new CharSiuStaffError("INVALID_INPUT");
    total += bytes.byteLength;
    if (!bytes.length || total > STAFF_PHOTO_BYTES) throw new CharSiuStaffError("INVALID_INPUT");
    const actual = row.mimeType === "image/jpeg" ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      : row.mimeType === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : row.mimeType === "image/webp" ? bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP"
      : bytes.subarray(4, 8).toString() === "ftyp" && ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(bytes.subarray(8, 12).toString());
    if (!actual) throw new CharSiuStaffError("INVALID_INPUT");
    return { fileName: row.fileName.trim(), mimeType: row.mimeType, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
  });
}
export async function staffPhotos(request: Request): Promise<Response> {
  return staffResponse(async () => {
    const db = dbClient(); const { connection, actor } = await authenticate(db, request);
    const raw = staffObject(await readStaffJson(request, STAFF_REQUEST_BYTES), ["draftId", "expectedRevision", "clientOperationId", "files"]);
    const draftId = staffUuid(raw.draftId); const revision = staffRevision(raw.expectedRevision); const operation = staffUuid(raw.clientOperationId);
    const files = parsePhotos(raw.files); const metadata = files.map(({ bytes: _bytes, ...file }) => file);
    const hash = staffRequestHash({ actor, action: "reservePhotos", draftId, expectedRevision: revision, files: metadata });
    const reserved = await rpc(db, "char_siu_staff_apply", { ...actorArgs(connection, actor), p_action: "reservePhotos", p_client_operation_id: operation,
      p_expected_revision: revision, p_draft_id: draftId, p_request_hash: hash, p_input: null, p_photos: metadata });
    if (!reserved.claimed) return staffPhotoResponse(reserved, operation);
    let errorCode: string | null = null; let extracted: unknown[] = []; let documentDate: string | null = null;
    try {
      for (let index = 0; index < files.length; index++) {
        const photo = reserved.photos[index]; const file = files[index];
        if (!photo || photo.sha256 !== file.sha256 || typeof photo.storage_path !== "string" || !photo.storage_path.startsWith(`${connection.id}/${draftId}/`) || /\.\.|\\/.test(photo.storage_path)) throw new Error("Invalid reserved photo");
        const uploaded = await db.storage.from(STAFF_PHOTO_BUCKET).upload(photo.storage_path, new Uint8Array(file.bytes), { contentType: file.mimeType, upsert: false });
        if (uploaded.error) throw new Error("Upload failed");
      }
    } catch { errorCode = "UPLOAD_FAILED"; }
    if (!errorCode) {
      try {
        const result = await extractCharSiuDeliveryNote(files.map(file => new File([new Uint8Array(file.bytes)], file.fileName, { type: file.mimeType })));
        extracted = result.items; documentDate = result.documentDate;
      } catch { errorCode = "AI_REVIEW_REQUIRED"; }
    }
    const finished = await rpc(db, "char_siu_staff_finish_photos", { ...actorArgs(connection, actor), p_operation_id: reserved.operationId,
      p_expected_revision: reserved.draft.revision, p_scan_id: reserved.scanId, p_extracted_items: extracted, p_document_date: documentDate, p_error_code: errorCode });
    return staffPhotoResponse(finished, operation);
  });
}
export async function managerDraftsGet(request: Request): Promise<Response> {
  return staffResponse(async () => {
    await manager(request); const db = dbClient();
    const { data, error } = await db.from("char_siu_staff_drafts").select("*").order("updated_at", { ascending: false }).limit(100);
    if (error) throw new CharSiuStaffError("UNAVAILABLE");
    const drafts = data || []; const photos = await photoRows(db, drafts.map(draft => draft.id));
    const ids = [...new Set(drafts.map(draft => draft.connection_id))];
    const connections = ids.length ? await db.from("char_siu_staff_connections").select("id,label").in("id", ids) : { data: [], error: null };
    if (connections.error) throw new CharSiuStaffError("UNAVAILABLE");
    return response({ success: true, drafts: drafts.map(draft => safeManagerDraft(draft, photos.filter(photo => photo.draft_id === draft.id), connections.data?.find(connection => connection.id === draft.connection_id)?.label || "DocScanner")) });
  });
}
export async function managerDraftsPost(request: Request): Promise<Response> {
  return staffResponse(async () => {
    const actor = await manager(request, true); const db = dbClient();
    const raw = staffObject(await readStaffJson(request), ["action", "draftId", "expectedRevision", "deliveryNoteScanId", "clientOperationId"]);
    if (raw.action !== "finalize") throw new CharSiuStaffError("INVALID_INPUT");
    const draftId = staffUuid(raw.draftId); const scanId = staffUuid(raw.deliveryNoteScanId); const revision = staffRevision(raw.expectedRevision); const operation = staffUuid(raw.clientOperationId);
    const hash = staffRequestHash({ actor, action: "finalize", draftId, expectedRevision: revision, deliveryNoteScanId: scanId });
    const draft = await findDraft(db, draftId);
    // Return an already-recorded exact action before checking current inputs or volatile prices.
    const prior = await db.from("char_siu_staff_operations").select("action,request_hash,state,result").eq("connection_id", draft.connection_id).eq("client_operation_id", operation).maybeSingle();
    if (prior.error) throw new CharSiuStaffError("UNAVAILABLE");
    if (prior.data) {
      if (prior.data.action !== "finalize" || prior.data.request_hash !== hash) throw new CharSiuStaffError("IDEMPOTENCY_CONFLICT");
      if (prior.data.state !== "completed" || !prior.data.result?.draft) throw new CharSiuStaffError("IN_PROGRESS");
      const saved = prior.data.result;
      return response({ success: true, draft: safeManagerDraft(saved.draft, saved.photos || [], "DocScanner") });
    }
    if (draft.status === "completed") throw new CharSiuStaffError("COMPLETED");
    if (draft.revision !== revision) throw new CharSiuStaffError("REVISION_CONFLICT");
    if (draft.pending_operation_id) throw new CharSiuStaffError("IN_PROGRESS");
    if (draft.status !== "needs_review") throw new CharSiuStaffError("NOT_READY");
    const input = parseStaffInput(draft.input, true);
    const scanResult = await db.from("char_siu_delivery_note_scans").select("id,status,target_production_date,extracted_items,used_run_id,updated_at,reviewed_at").eq("id", scanId).maybeSingle();
    if (scanResult.error) throw new CharSiuStaffError("UNAVAILABLE");
    const scan = scanResult.data; const items = normalizeDeliveryNoteItems(scan?.extracted_items);
    if (!scan || scan.status !== "ready" || !scan.reviewed_at || scan.used_run_id || scan.target_production_date !== input.productionDate || !isCompleteDeliveryNoteScan(items)) throw new CharSiuStaffError("NOT_READY");
    const settings = await db.from("char_siu_production_settings").select("*").eq("id", 1).single();
    if (settings.error || !settings.data) throw new CharSiuStaffError("UNAVAILABLE");
    const stages = { cookingWorkerCount: input.cookingWorkerCount!, cookingWorkHours: input.cookingWorkHours!, packagingWorkerCount: input.packagingWorkerCount!, packagingWorkHours: input.packagingWorkHours! };
    let prepared: Awaited<ReturnType<typeof prepareCharSiuProductionSources>>;
    try { prepared = await prepareCharSiuProductionSources(db, { productionDate: input.productionDate, workerCount: stages.cookingWorkerCount, workHours: stages.cookingWorkHours,
      stages, usageByKey: Object.fromEntries(input.materials.map(row => [row.key, row.usageAmount ?? 0])), quantityByKey: Object.fromEntries(input.outputs.map(row => [row.key, row.quantity ?? 0])),
      deliveryItems: items, deliveryNoteScanId: scan.id }, settings.data, actor, false); } catch { throw new CharSiuStaffError("NOT_READY"); }
    const runId = randomUUID();
    const run = { id: runId, ...charSiuProductionRunRecord({ productionDate: input.productionDate, packagingDate: input.packagingDate }, input.notes, prepared.calculation, `docscanner:${draft.connection_id}`, prepared.labor) };
    const rows = charSiuProductionRows(runId, prepared.calculation, [], [], prepared.materialSources);
    const result = await rpc(db, "char_siu_staff_finalize", { p_draft_id: draftId, p_expected_revision: revision, p_client_operation_id: operation, p_request_hash: hash,
      p_manager_actor: actor, p_scan_id: scan.id, p_scan_updated_at: scan.updated_at, p_scan_extracted_items: scan.extracted_items,
      p_run: run, p_materials: rows.materialRows, p_outputs: rows.outputRows });
    return response({ success: true, draft: safeManagerDraft(result.draft, result.photos, "DocScanner") });
  });
}
export async function managerPhoto(request: Request, draftId: string, photoId: string): Promise<Response> {
  return staffResponse(async () => {
    await manager(request); const db = dbClient(); const draft = await findDraft(db, staffUuid(draftId));
    const found = await db.from("char_siu_staff_photos").select("storage_path,mime_type").eq("id", staffUuid(photoId)).eq("draft_id", draft.id).maybeSingle();
    if (found.error) throw new CharSiuStaffError("UNAVAILABLE");
    if (!found.data) throw new CharSiuStaffError("NOT_FOUND");
    const storagePath = found.data.storage_path;
    if (typeof storagePath !== "string" || !storagePath.startsWith(`${draft.connection_id}/${draft.id}/`) || /\.\.|\\/.test(storagePath)) throw new CharSiuStaffError("UNAVAILABLE");
    const downloaded = await db.storage.from(STAFF_PHOTO_BUCKET).download(storagePath);
    if (downloaded.error || !downloaded.data) throw new CharSiuStaffError("NOT_FOUND");
    return new Response(downloaded.data, { headers: { "content-type": found.data.mime_type, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-disposition": "inline" } });
  });
}
