import { parse } from "csv-parse/sync";
import { emptyProfit, money, round } from "./policy";
import type { SyncPeriod } from "./types";

function japaneseDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}-\d{2}T/.test(value) && /(Z|[+-]\d\d:\d\d)$/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return new Date(date.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
  }
  // No ambiguous US/EU dates are guessed.
  throw new Error("Amazon精算の計上日形式を確認できません。");
}

export function normalizeAmazonSettlements(documents: { id: string; text: string }[], period: SyncPeriod) {
  const data = emptyProfit("amazon", period);
  data.report_basis = "settlement";
  const warnings = new Set<string>(["Amazon自動生成精算の計上日で集計しました。未生成・繰越・保留残高と全月の網羅性は原本で確認してください。"]);
  const unknown = new Set<string>();
  let rowsInPeriod = 0;
  let payoutTotal = 0;
  let depositsInPeriod = 0;
  const seenDocuments = new Set<string>();
  const seenSettlements = new Set<string>();
  for (const document of documents) {
    if (seenDocuments.has(document.id)) continue;
    seenDocuments.add(document.id);
    const rows = parse(document.text.replace(/^\uFEFF/, ""), { columns: true, delimiter: "\t", skip_empty_lines: true, relax_column_count: false }) as Record<string, string>[];
    if (!rows.length || !("amount" in rows[0]) || !("amount-type" in rows[0])) throw new Error("Amazon Flat File V2精算レポートの形式ではありません。");
    if (!rows.some((row) => row.currency === "JPY")) throw new Error("Amazon精算レポートのJPY通貨を確認できません。");
    const settlementId = rows.find((row) => row["settlement-id"])?.["settlement-id"];
    if (!settlementId || seenSettlements.has(settlementId)) throw new Error("同一精算の複数版または精算ID欠落を確認してください。重複集計していません。");
    seenSettlements.add(settlementId);
    const deposit = rows.find((row) => row["deposit-date"] && row["total-amount"]);
    if (deposit) {
      try {
        const date = japaneseDate(deposit["deposit-date"]);
        if (date >= period.startDate && date <= period.endDate) { payoutTotal += money(deposit["total-amount"], "Amazon精算入金額"); depositsInPeriod++; }
      } catch { warnings.add("Amazon精算の入金日・入金額形式は原本で確認してください。入金集計に含めていません。"); }
    }
    for (const row of rows) {
      if (row.currency && row.currency !== "JPY") throw new Error("Amazon精算はJPYの日本アカウントだけを取り込めます。");
      if (!row.amount) continue; // Header total is a different settlement basis.
      const date = japaneseDate(row["posted-date-time"] || row["posted-date"] || "");
      if (date < period.startDate || date > period.endDate) continue;
      rowsInPeriod++;
      const amount = money(row.amount, "Amazon精算額");
      if (!amount) continue;
      const type = row["amount-type"] || "";
      const description = row["amount-description"] || "";
      const transaction = row["transaction-type"] || "";
      const text = `${type} ${description} ${transaction}`;
      if (/advertis|productads|広告/i.test(text)) { data.excluded_ad_costs += -amount; continue; }
      if (type === "ItemPrice" && ["Principal", "Tax", "Shipping", "ShippingTax", "GiftWrap", "Giftwrap", "GiftWrapTax", "GiftwrapTax"].includes(description)) {
        if (amount >= 0) data.gross_sales += amount; else data.refunds += -amount;
      } else if (type === "ItemFees") {
        // The report explicitly classifies these as item fees. Positive amounts
        // are reimbursements of deductions, not sales.
        if (amount >= 0) data.other_credits += amount;
        else if (/FBA.*(Fulfillment|WeightBased|PerUnit)|ShippingChargeback|ShippingHB/.test(description)) data.shipping_costs += -amount;
        else data.platform_fees += -amount;
      } else if (["Subscription", "SubscriptionFee"].includes(description)) {
        if (amount < 0) data.platform_fees += -amount; else data.other_credits += amount;
      } else if (/promotion|coupon|discount|points/i.test(text)) {
        // Flat File V2 does not expose who funded every promotion. Do not
        // relabel marketplace-funded benefits as seller deductions.
        unknown.add("割引・ポイント負担者");
      } else {
        unknown.add(`${type || "種類不明"}/${description || "明細不明"}`.slice(0, 100));
      }
    }
  }
  if (!rowsInPeriod) throw new Error("対象月のAmazon精算明細がありません。未生成または取得可能期間外を確認してください。");
  if (unknown.size) {
    data.coverage_level = "needs_review";
    warnings.add(`自動分類できない精算項目が${unknown.size}種類あります。精算原本で補完してください。`);
  }
  data.excluded_ad_costs = Math.max(0, data.excluded_ad_costs);
  data.net_payout = depositsInPeriod ? round(payoutTotal) : null;
  if (depositsInPeriod) warnings.add("入金額は入金日の月次合計です。計上日で集計した売上・控除とは期間が異なります。");
  for (const [key, value] of Object.entries(data)) if (typeof value === "number") (data as unknown as Record<string, unknown>)[key] = round(value);
  data.source_files = [...seenDocuments].map((id) => `official-api-amazon-settlement-${id}`);
  data.notes = [...warnings].join(" ");
  return { data, warnings: [...warnings], metadata: { settlementReportCount: seenDocuments.size, depositsInPeriod, rowsInPeriod, unknownTypes: [...unknown] } };
}
