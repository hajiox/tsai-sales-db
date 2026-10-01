import type { SupabaseClient } from "@supabase/supabase-js";
import { getBulkProductUnitPrices } from "@/lib/unitPriceHelper";
import { actualSalesAmount } from "./csv-import";
import type { WebSalesChannel } from "./types";

type ConfirmationRow = {
  productId: string;
  title: string;
  quantity: number;
  amount: number;
  saleDate: string;
  reportMonth: string;
};

export function normalizeManualSalesConfirmation(channel: WebSalesChannel, body: Record<string, unknown>): ConfirmationRow[] {
  const input = channel === "tiktok" ? body.items : [
    ...(Array.isArray(body.matchedProducts) ? body.matchedProducts : []),
    ...(Array.isArray(body.newMappings) ? body.newMappings : []),
  ];
  if (!Array.isArray(input) || input.length === 0) throw new Error("確定する商品データが必要です。空の月次帳票の登録はこの画面では行えません");
  const rows = input.map((raw: Record<string, any>) => {
    const productId = String(raw.productId || raw.productInfo?.id || "");
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(productId)) throw new Error("商品の紐付けを確認してください");
    const quantity = Number(raw.quantity ?? raw.count);
    if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error("販売個数が不正です");
    const date = String(channel === "tiktok" ? raw.saleDate : body.targetMonth || body.saleDate || "");
    if (!/^\d{4}-\d{2}(?:-\d{2})?$/.test(date) || Number(date.slice(5, 7)) < 1 || Number(date.slice(5, 7)) > 12) throw new Error("対象月が不正です");
    const saleDate = date.length === 7 ? `${date}-01` : date;
    const parsedDate = new Date(`${saleDate}T00:00:00Z`);
    if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== saleDate) throw new Error("売上日が不正です");
    const amount = actualSalesAmount(raw.amount);
    if (quantity === 0 && amount !== 0) throw new Error("販売個数0の商品の非0金額は売上補正として確認が必要です");
    return {
      productId, title: String(raw[`${channel}Title`] || raw.title || ""), quantity,
      amount, saleDate, reportMonth: `${saleDate.slice(0, 7)}-01`,
    };
  });
  if (new Set(rows.map(row => row.reportMonth)).size !== 1) {
    throw new Error("複数月の売上が混在しています。1か月分ずつ登録してください");
  }
  for (const [field, total] of [
    ["expectedQuantity", rows.reduce((sum, row) => sum + row.quantity, 0)],
    ["expectedAmount", rows.reduce((sum, row) => sum + row.amount, 0)],
  ] as const) {
    if (body[field] == null) continue;
    const expected = Number(body[field]);
    if (!Number.isFinite(expected) || Math.abs(expected - total) > 0.000001) {
      throw new Error("原本の販売個数または実売金額と登録対象が一致しません。未紐付け商品を確認してください");
    }
  }
  return rows;
}

export async function confirmManualWebSales(
  supabase: SupabaseClient,
  channel: WebSalesChannel,
  body: Record<string, unknown>,
) {
  // Validate all input and reconciliation before any mapping or sales writes.
  const rows = normalizeManualSalesConfirmation(channel, body);
  const months = new Map<string, Map<string, { quantity: number; amount: number }>>();
  for (const row of rows) {
    const products = months.get(row.reportMonth) || new Map();
    const current = products.get(row.productId) || { quantity: 0, amount: 0 };
    products.set(row.productId, { quantity: current.quantity + row.quantity, amount: current.amount + row.amount });
    months.set(row.reportMonth, products);
  }
  const unitPrices = await getBulkProductUnitPrices(supabase, [...new Set(rows.map(row => row.productId))]);
  for (const [month, products] of months) {
    const summary = [...products].map(([product_id, sale]) => ({
      product_id, ...sale,
      ...(unitPrices.get(product_id) || { unit_price: 0, unit_profit_rate: 0 }),
    }));
    const { error } = await supabase.rpc("replace_web_sales_channel_summary", {
      p_channel: channel, p_report_month: month, p_rows: summary,
    });
    if (error) throw new Error("月次売上を一括保存できませんでした");
  }

  let learnedMappings = 0;
  const newMappings = Array.isArray(body.newMappings) ? body.newMappings : [];
  if (channel !== "tiktok" && newMappings.length > 0) {
    const titleColumn = `${channel}_title`;
    const mappings = newMappings.map(row => ({ [titleColumn]: row[`${channel}Title`], product_id: row.productId }));
    const { error } = await supabase.from(`${channel}_product_mapping`).upsert(mappings, { onConflict: titleColumn });
    if (error) throw new Error("売上は保存済みですが、新しい商品紐付けを保存できませんでした");
    learnedMappings = mappings.length;
  }

  if (channel === "tiktok") {
    const daily = new Map<string, { tiktok_count: number; tiktok_amount: number }>();
    for (const row of rows) {
      const current = daily.get(row.saleDate) || { tiktok_count: 0, tiktok_amount: 0 };
      current.tiktok_count += row.quantity;
      current.tiktok_amount += row.amount;
      daily.set(row.saleDate, current);
    }
    if (daily.size > 0) {
      const { error } = await supabase.from("daily_sales_report")
        .upsert([...daily].map(([date, values]) => ({ date, ...values })), { onConflict: "date" });
      if (error) throw new Error("月次売上は保存済みですが、日別売上を保存できませんでした");
    }
  }
  const productCount = [...months.values()].reduce((sum, products) => sum + products.size, 0);
  return {
    success: true, message: "公式の商品実売金額と販売個数を保存しました",
    successCount: productCount, errorCount: 0, totalCount: productCount,
    learnedMappings, learnedCount: learnedMappings,
    quantityTotal: rows.reduce((sum, row) => sum + row.quantity, 0),
    amountTotal: rows.reduce((sum, row) => sum + row.amount, 0),
    summary: { totalItems: rows.length, uniqueProducts: productCount },
  };
}
