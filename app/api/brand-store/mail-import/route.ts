import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  BrandStoreMailReviewError,
  isBrandStoreMailAuthorized,
  parseBrandStoreMail,
  prepareBrandStoreSales,
  MAX_BRAND_STORE_ATTACHMENT_BYTES,
} from "@/lib/brand-store-mail-import";
import type { BrandStoreProduct, BrandStoreAlias, BrandStoreSalesRow } from "@/lib/brand-store-mail-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  if (!isBrandStoreMailAuthorized(request)) return NextResponse.json({ success: false, error: "連携認証に失敗しました" }, { status: 401 });
  try {
    const maxBody = Math.ceil(MAX_BRAND_STORE_ATTACHMENT_BYTES / 3) * 4 + 6000;
    const declaredLength = Number(request.headers.get("content-length") || 0);
    if (declaredLength > maxBody) throw new BrandStoreMailReviewError("invalid_attachment", "添付が大きすぎます");
    const raw = await request.text();
    if (Buffer.byteLength(raw) > maxBody) throw new BrandStoreMailReviewError("invalid_attachment", "添付が大きすぎます");
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new BrandStoreMailReviewError("invalid_request", "取り込み内容が不正です"); }
    const parsed = parseBrandStoreMail(body);
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: saved, error: historyError } = await supabase.from("brand_store_mail_imports").select("content_sha256,sales_rows,unmatched_product_count").eq("report_month", `${parsed.input.reportMonth}-01`).maybeSingle();
    if (historyError) throw new Error("brand_store_mail_history_read_failed");
    const products: BrandStoreProduct[] = [];
    const aliases: BrandStoreAlias[] = [];
    if (!saved) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("product_master").select("product_id,product_name,barcode").order("id").range(from, from + 999);
      if (error) throw new Error("product_master_read_failed");
      products.push(...(data || []));
      if (!data || data.length < 1000) break;
      if (products.length > 50000) throw new Error("product_master_too_large");
    }
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("product_name_aliases").select("product_id,alias_name").order("id").range(from, from + 999);
      if (error) throw new Error("product_alias_read_failed");
      aliases.push(...(data || []));
      if (!data || data.length < 1000) break;
      if (aliases.length > 50000) throw new Error("product_alias_too_large");
    }
    }
    // Replayed source files retain the verified original mapping even if a
    // product master changes later. The RPC still checks the live full dataset.
    const prepared = saved?.content_sha256 === parsed.contentSha256
      ? { salesRows: saved.sales_rows as BrandStoreSalesRow[], unmatchedProductCount: Number(saved.unmatched_product_count) }
      : prepareBrandStoreSales(parsed, products, aliases);
    const { data, error } = await supabase.rpc("import_brand_store_mail", {
      p_input: { ...parsed.input, sender: parsed.input.sender.toLowerCase(), contentBase64: undefined, salesRows: prepared.salesRows, sourceRows: parsed.sourceRows, contentSha256: parsed.contentSha256, sourceRowCount: parsed.sourceRowCount, totalSales: parsed.totalSales, totalQuantity: parsed.totalQuantity, totalGrossProfit: parsed.totalGrossProfit, totalCostAmount: parsed.totalCostAmount, unmatchedProductCount: prepared.unmatchedProductCount },
    });
    if (error) {
      const code = error.message.match(/ABC_REVIEW:([a-z_]+)/)?.[1];
      if (code) return NextResponse.json({ success: false, status: "needs_review", reasonCode: code, error: "同じ月のデータまたは保存内容に違いがあります。確認が必要です" }, { status: 409 });
      throw new Error("brand_store_mail_save_failed");
    }
    if (!data?.success || !data.importId || data.sourceMessageId !== parsed.input.sourceMessageId || data.attachmentSha256 !== parsed.input.attachmentSha256 || data.reportMonth !== parsed.input.reportMonth || data.sourceRowCount !== parsed.sourceRowCount || data.rowCount !== prepared.salesRows.length || data.totalSales !== parsed.totalSales || data.totalQuantity !== parsed.totalQuantity || data.totalGrossProfit !== parsed.totalGrossProfit || data.totalCostAmount !== parsed.totalCostAmount) throw new Error("brand_store_mail_receipt_invalid");
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof BrandStoreMailReviewError) return NextResponse.json({ success: false, status: "needs_review", reasonCode: error.code, error: error.message }, { status: 422 });
    console.error("brand store mail import failed", { type: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ success: false, status: "retryable_error", error: "取り込みを完了できませんでした。返信は保留しています" }, { status: 500 });
  }
}
