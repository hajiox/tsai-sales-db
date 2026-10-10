import { randomUUID } from "node:crypto";
import { DataAccessError } from "@/lib/data-access/contracts";
import { validateRecipeItemsInput } from "@/lib/data-access/recipe-items-contracts";
import { createDataAccessAdminClient, tokenHashFromRequest, readDataAccessBody, RPC_ERRORS } from "@/lib/data-access/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const tokenHash = tokenHashFromRequest(request);
    const { action, payload } = validateRecipeItemsInput(await readDataAccessBody(request));
    const { data, error } = await createDataAccessAdminClient().rpc("tsa_recipe_items_replace_v1", { p_token_hash: tokenHash, p_action: action, p_payload: payload });
    if (error) {
      const code = /^DA_([A-Z_]+)$/.exec(error.message || "")?.[1];
      if (code && RPC_ERRORS[code]) throw new DataAccessError(code, RPC_ERRORS[code][1], RPC_ERRORS[code][0]);
      console.error("recipe_items_replacement_failed", { requestId, action, code: error.code });
      throw new DataAccessError("UNAVAILABLE", "配合行を操作できませんでした", 503);
    }
    return Response.json({ ok: true, data, requestId }, { headers });
  } catch (cause) {
    const error = cause instanceof DataAccessError ? cause : new DataAccessError("UNAVAILABLE", "配合行を操作できませんでした", 503);
    return Response.json({ ok: false, error: { code: error.code, message: error.message }, requestId }, { status: error.status, headers });
  }
}
