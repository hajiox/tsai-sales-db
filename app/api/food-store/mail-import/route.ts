import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { BrandStoreMailReviewError, isBrandStoreMailAuthorized, MAX_BRAND_STORE_ATTACHMENT_BYTES } from "@/lib/brand-store-mail-import";
import { FOOD_STORE_MAIL_DESTINATION, FOOD_STORE_MAIL_TABLE, parseFoodStoreMail, isFoodStoreMailReceipt } from "@/lib/food-store-mail-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  if (!isBrandStoreMailAuthorized(request)) return NextResponse.json({ success: false, error: "連携認証に失敗しました" }, { status: 401 });
  try {
    const maxBody = Math.ceil(MAX_BRAND_STORE_ATTACHMENT_BYTES / 3) * 4 + 6000;
    if (Number(request.headers.get("content-length") || 0) > maxBody) throw new BrandStoreMailReviewError("invalid_attachment", "添付が大きすぎます");
    const raw = await request.text();
    if (Buffer.byteLength(raw) > maxBody) throw new BrandStoreMailReviewError("invalid_attachment", "添付が大きすぎます");
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new BrandStoreMailReviewError("invalid_request", "取り込み内容が不正です"); }
    const parsed = parseFoodStoreMail(body);
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    // The RPC fixes the destination, resolves JAN categories, saves all rows and
    // verifies the live dataset within one transaction before issuing a receipt.
    const { data, error } = await supabase.rpc("import_food_store_mail", {
      p_input: { ...parsed.input, sender: parsed.input.sender.toLowerCase(), contentBase64: undefined,
        destination: FOOD_STORE_MAIL_DESTINATION, destinationTable: FOOD_STORE_MAIL_TABLE,
        salesRows: parsed.salesRows, sourceRows: parsed.sourceRows, contentSha256: parsed.contentSha256,
        sourceRowCount: parsed.sourceRowCount, totalSales: parsed.totalSales, totalQuantity: parsed.totalQuantity,
        totalGrossProfit: parsed.totalGrossProfit, totalCostAmount: parsed.totalCostAmount },
    });
    if (error) {
      const code = error.message.match(/ABC_REVIEW:([a-z_]+)/)?.[1];
      if (code) return NextResponse.json({ success: false, status: "needs_review", reasonCode: code, error: "同じ月のデータまたは保存内容に違いがあります。確認が必要です" }, { status: 409 });
      throw new Error("food_store_mail_save_failed");
    }
    if (!isFoodStoreMailReceipt(data, parsed)) throw new Error("food_store_mail_receipt_invalid");
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof BrandStoreMailReviewError) return NextResponse.json({ success: false, status: "needs_review", reasonCode: error.code, error: error.message }, { status: 422 });
    console.error("food store mail import failed", { type: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ success: false, status: "retryable_error", error: "取り込みを完了できませんでした。返信は保留しています" }, { status: 500 });
  }
}
