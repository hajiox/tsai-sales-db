import { randomUUID } from "node:crypto";
import { DataAccessError } from "@/lib/data-access/contracts";
import { validateBusinessInput } from "@/lib/data-access/business-contracts";
import { createDataAccessAdminClient, tokenHashFromRequest, readDataAccessBody, RPC_ERRORS } from "@/lib/data-access/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const tokenHash = tokenHashFromRequest(request);
    const input = await readDataAccessBody(request);
    const { action, payload } = validateBusinessInput(input);
    const { data, error } = await createDataAccessAdminClient().rpc("tsa_business_access_v1", { p_token_hash: tokenHash, p_action: action, p_payload: payload });
    if (error) {
      const code = /^DA_([A-Z_]+)$/.exec(error.message || "")?.[1];
      if (code && RPC_ERRORS[code]) throw new DataAccessError(code, RPC_ERRORS[code][1], RPC_ERRORS[code][0]);
      console.error("business_data_access_failed", { requestId, action, code: error.code });
      throw new DataAccessError("UNAVAILABLE", "業務データを操作できませんでした", 503);
    }
    return Response.json({ ok: true, data, requestId }, { headers });
  } catch (cause) {
    const error = cause instanceof DataAccessError ? cause : new DataAccessError("UNAVAILABLE", "業務データを操作できませんでした", 503);
    return Response.json({ ok: false, error: { code: error.code, message: error.message }, requestId }, { status: error.status, headers });
  }
}
