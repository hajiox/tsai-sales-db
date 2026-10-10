import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { DataAccessError } from "@/lib/data-access/contracts";
import { validateJanInput } from "@/lib/data-access/jan-contracts";
import { isValidJAN, renderJANEPS, renderJANSVG } from "@/lib/jan-barcode";
import { createDataAccessAdminClient, tokenHashFromRequest, readDataAccessBody, RPC_ERRORS } from "@/lib/data-access/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
export async function POST(request: Request) {
 const requestId = randomUUID();
 try {
  const tokenHash = tokenHashFromRequest(request);
  const { action, payload } = validateJanInput(await readDataAccessBody(request));
  const { data, error } = await createDataAccessAdminClient().rpc("tsa_jan_access_v1", { p_token_hash: tokenHash, p_action: action, p_payload: payload });
  if (error) {
   const code = /^DA_([A-Z_]+)$/.exec(error.message || "")?.[1];
   if (code === "EXHAUSTED") throw new DataAccessError(code, "この区分のJANコード発行枠を使い切っています", 409);
   if (code && RPC_ERRORS[code]) throw new DataAccessError(code, RPC_ERRORS[code][1], RPC_ERRORS[code][0]);
   console.error("jan_data_access_failed", { requestId, action, code: error.code });
   throw new DataAccessError("UNAVAILABLE", "JANコードを操作できませんでした", 503);
  }
  if (action === "export") {
   if (!isValidJAN(data.janCode)) throw new DataAccessError("INVALID_INPUT", "登録JANコードの桁数・チェックデジットを確認してください");
   const format = data.format;
   const content = format === "eps" ? renderJANEPS(data.janCode) : format === "png" ? (await sharp(Buffer.from(renderJANSVG(data.janCode))).resize({ width: 840 }).png().toBuffer()).toString("base64") : renderJANSVG(data.janCode);
   data.file = { filename: `barcode_${data.janCode}.${format}`, mimeType: format === "png" ? "image/png" : format === "eps" ? "application/postscript" : "image/svg+xml", encoding: format === "png" ? "base64" : "utf8", content };
  }
  return Response.json({ ok: true, data, requestId }, { headers });
 } catch (cause) {
  const error = cause instanceof DataAccessError ? cause : new DataAccessError("UNAVAILABLE", "JANコードを操作できませんでした", 503);
  return Response.json({ ok: false, error: { code: error.code, message: error.message }, requestId }, { status: error.status, headers });
 }
}
