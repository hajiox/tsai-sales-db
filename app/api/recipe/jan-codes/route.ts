import { randomUUID } from "node:crypto";
import { requireRecipeAdminRequest } from "@/lib/recipe-request-auth";
import { createDataAccessAdminClient, readDataAccessBody, RPC_ERRORS } from "@/lib/data-access/server";
import { validateJanValues } from "@/lib/data-access/jan-contracts";
import { DataAccessError } from "@/lib/data-access/contracts";
import { NextResponse } from "next/server";
export async function POST(request: Request) {
 const authError = await requireRecipeAdminRequest(request);
 if (authError) return authError;
 try {
  const body = await readDataAccessBody(request);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["product_name", "category", "price_excl_tax", "ingredients", "memo", "idempotencyKey"].includes(key))) throw new DataAccessError("INVALID_INPUT", "指定された値を確認してください");
  const { idempotencyKey = randomUUID(), ...values } = body;
  if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_.:-]{8,128}$/.test(idempotencyKey)) throw new DataAccessError("INVALID_INPUT", "実行キーを確認してください");
  const payload = validateJanValues({ category: "物品", ...values, product_name: values.product_name || "新規登録商品" }, true);
  const { data, error } = await createDataAccessAdminClient().rpc("tsa_jan_issue_admin_v1", { p_payload: payload, p_idempotency_key: idempotencyKey });
  if (error) {
   const code = /^DA_([A-Z_]+)$/.exec(error.message || "")?.[1];
   if (code === "EXHAUSTED") throw new DataAccessError(code, "この区分のJANコード発行枠を使い切っています", 409);
   if (code && RPC_ERRORS[code]) throw new DataAccessError(code, RPC_ERRORS[code][1], RPC_ERRORS[code][0]);
   throw new DataAccessError("UNAVAILABLE", "JANコードを発行できませんでした", 503);
  }
  return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
 } catch (cause) {
  const error = cause instanceof DataAccessError ? cause : new DataAccessError("INVALID_INPUT", "指定された値を確認してください");
  return NextResponse.json({ error: error.message }, { status: error.status });
 }
}
