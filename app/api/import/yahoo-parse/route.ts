import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { findBestMatchSimplified } from "@/lib/csvHelpers";
import { parseReportedWebSalesCsv } from "@/lib/web-sales-automation/csv-import";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })(),
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })(),
);

export async function POST(request: NextRequest) {
  try {
    const { csvData } = await request.json();
    const csvText = String(csvData || "");
    if (!csvText) return NextResponse.json({ success: false, ok: false, error: "CSVデータがありません" }, { status: 400 });
    const rows = parseReportedWebSalesCsv("yahoo", csvText);
    const [{ data: products, error: productError }, { data: learns, error: learnError }] = await Promise.all([
      supabase.from("products").select("*").eq("is_hidden", false),
      supabase.from("yahoo_product_mapping").select("yahoo_title,product_id"),
    ]);
    if (productError) throw new Error("商品マスターの取得に失敗しました");
    if (learnError) throw new Error("商品紐付けの取得に失敗しました");
    const matchedProductIds = new Set<string>();
    const matchedProducts: Array<Record<string, any>> = [];
    const unmatchedProducts: Array<Record<string, any>> = [];
    for (const row of rows) {
      const result = findBestMatchSimplified(row.name, products || [], learns || [], matchedProductIds, "yahoo");
      const source = { yahooTitle: row.name, quantity: row.quantity, amount: row.amount };
      if (result) {
        matchedProducts.push({
          ...source, productInfo: result.product, productId: result.product.id,
          productName: result.product.name, matchType: result.matchType,
          isLearned: result.matchType === "learned",
        });
      } else {
        unmatchedProducts.push(source);
      }
    }
    const matchedQuantity = matchedProducts.reduce((sum, row) => sum + row.quantity, 0);
    const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
    const summary = {
      totalProducts: rows.length, totalQuantity, processableQuantity: matchedQuantity,
      totalAmount: rows.reduce((sum, row) => sum + row.amount, 0),
      processableAmount: matchedProducts.reduce((sum, row) => sum + row.amount, 0),
      matchedCount: matchedProducts.length, unmatchedCount: unmatchedProducts.length,
      learnedMatchCount: matchedProducts.filter(row => row.isLearned).length,
      blankTitleInfo: { count: 0, quantity: 0 },
      csvTotalQty: totalQuantity, matchedQty: matchedQuantity,
      unmatchedQty: totalQuantity - matchedQuantity,
    };
    return NextResponse.json({
      success: true, ok: true, summary, matchedProducts, unmatchedProducts,
      matched: matchedProducts.map(row => ({ ...row, qty: row.quantity })),
      unmatched: unmatchedProducts.map(row => ({ ...row, qty: row.quantity })),
    });
  } catch (error) {
    return NextResponse.json({ success: false, ok: false, error: error instanceof Error ? error.message : "CSVの解析に失敗しました" }, { status: 400 });
  }
}
