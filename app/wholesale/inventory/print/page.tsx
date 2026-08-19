"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { inventoryFiscalLabel } from "@/lib/inventory-fiscal";
import {
  normalizeWholesaleInventoryTaxRate,
  retailPriceInclTaxFromExcluded,
  type WholesaleInventoryTaxRate,
} from "@/lib/wholesale-inventory-price";

type InventorySession = {
  id: string;
  fiscal_year: number;
  inventory_date: string;
  source_file_name: string | null;
  source_row_count: number;
  set_row_count: number;
  imported_at: string | null;
};

type InventoryItem = {
  id: string;
  product_name: string;
  retail_price_excl_tax: number | null;
  wholesale_price: number | null;
  tax_rate: WholesaleInventoryTaxRate;
  quantity: number | null;
  review_status: "confirmed" | "needs_review" | "excluded";
  note: string;
};

export default function WholesaleInventoryPrintPage() {
  const [inventory, setInventory] = useState<InventorySession | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    const query = id ? `?id=${encodeURIComponent(id)}` : "";

    fetch(`/api/wholesale/inventory${query}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "卸決算棚卸しの取得に失敗しました");
        }
        setInventory(data.inventory || null);
        setItems((data.items || []).map(normalizeItem));
      })
      .catch((reason: Error) => {
        setError(reason.message || "卸決算棚卸しの取得に失敗しました");
      })
      .finally(() => setLoading(false));
  }, []);

  const activeItems = useMemo(
    () => items.filter((item) => item.review_status !== "excluded"),
    [items],
  );
  const confirmedItems = useMemo(
    () => activeItems.filter((item) => item.review_status === "confirmed"),
    [activeItems],
  );
  const confirmedValue = useMemo(() => inventoryValue(confirmedItems), [confirmedItems]);
  const totalValue = useMemo(() => inventoryValue(activeItems), [activeItems]);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white px-3 py-3 shadow-sm md:px-6">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
          <Button asChild size="sm" variant="ghost" className="gap-2">
            <a href="/wholesale/inventory">
              <ArrowLeft className="h-4 w-4" />
              棚卸しへ戻る
            </a>
          </Button>
          <Button
            className="gap-2 bg-slate-900 hover:bg-slate-800"
            onClick={() => window.print()}
            disabled={!inventory || loading}
          >
            <Printer className="h-4 w-4" />
            印刷する
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] p-3 md:p-6 print:max-w-none print:p-0">
        {loading ? (
          <div className="grid min-h-80 place-items-center rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
              <Loader2 className="h-5 w-5 animate-spin" />
              印刷データを読み込み中
            </div>
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-white p-8 text-center text-sm font-semibold text-red-700">
            {error}
          </div>
        ) : !inventory ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
            印刷できる棚卸しデータがありません。
          </div>
        ) : (
          <article className="print-sheet overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-sm print:overflow-visible print:rounded-none print:border-0 print:p-0 print:shadow-none">
            <header className="border-b-2 border-slate-950 pb-3">
              <div className="flex items-end justify-between gap-5">
                <div>
                  <h1 className="text-2xl font-bold">卸販売 決算棚卸し（倉庫）表</h1>
                  <p className="mt-1 text-sm text-slate-600">
                    {inventoryFiscalLabel(inventory.fiscal_year)} / 棚卸日 {formatDate(inventory.inventory_date)}
                  </p>
                </div>
                <div className="text-right text-xs leading-5 text-slate-600">
                  <div>株式会社テクニカルスタッフ</div>
                  <div>出力日 {formatDate(new Date().toISOString())}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-px overflow-hidden border border-slate-300 bg-slate-300">
                <SummaryCell label="対象品目" value={`${activeItems.length.toLocaleString()}品目`} />
                <SummaryCell label="確認済み" value={`${confirmedItems.length.toLocaleString()}品目`} />
                <SummaryCell label="確定原価合計" value={formatYen(confirmedValue)} />
                <SummaryCell label="要確認込み原価" value={formatYen(totalValue)} />
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-x-5 gap-y-1 text-[11px] text-slate-500">
                <span>原価は販売価格（税別）の70%</span>
                <span>除外品を除く / セット除外 {inventory.set_row_count.toLocaleString()}件</span>
                {inventory.source_file_name && <span>取込元 {inventory.source_file_name}</span>}
              </div>
            </header>

            <div className="mt-4 overflow-x-auto print:overflow-visible">
              <table className="w-full table-fixed border-collapse text-[11px]">
                <colgroup>
                  <col className="w-[4%]" />
                  <col className="w-[30%]" />
                  <col className="w-[6%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                  <col className="w-[8%]" />
                  <col className="w-[11%]" />
                  <col className="w-[11%]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-100">
                    <PrintHeader align="center">No.</PrintHeader>
                    <PrintHeader>商品名</PrintHeader>
                    <PrintHeader align="center">税率</PrintHeader>
                    <PrintHeader align="right">販売価格<br />税別</PrintHeader>
                    <PrintHeader align="right">販売価格<br />税込</PrintHeader>
                    <PrintHeader align="right">原価<br />税別・7掛</PrintHeader>
                    <PrintHeader align="right">在庫数</PrintHeader>
                    <PrintHeader align="right">棚卸原価</PrintHeader>
                    <PrintHeader>備考・状態</PrintHeader>
                  </tr>
                </thead>
                <tbody>
                  {activeItems.map((item, index) => {
                    const stockValue = item.wholesale_price !== null && item.quantity !== null
                      ? inventoryScaledValue(item.wholesale_price, item.quantity) / 100_000
                      : null;
                    return (
                      <tr key={item.id} className="break-inside-avoid">
                        <PrintCell align="center">{index + 1}</PrintCell>
                        <PrintCell strong>{item.product_name}</PrintCell>
                        <PrintCell align="center">{item.tax_rate}%</PrintCell>
                        <PrintCell align="right">{formatYen(item.retail_price_excl_tax)}</PrintCell>
                        <PrintCell align="right">
                          {formatYen(retailPriceInclTaxFromExcluded(item.retail_price_excl_tax, item.tax_rate))}
                        </PrintCell>
                        <PrintCell align="right">{formatYen(item.wholesale_price)}</PrintCell>
                        <PrintCell align="right">{formatQuantity(item.quantity)}</PrintCell>
                        <PrintCell align="right" strong>{formatYen(stockValue)}</PrintCell>
                        <PrintCell>
                          <div>{item.note || ""}</div>
                          {item.review_status === "needs_review" && (
                            <div className="mt-0.5 font-bold text-amber-700 print:text-black">要確認</div>
                          )}
                        </PrintCell>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold">
                    <td colSpan={7} className="border border-slate-400 px-2 py-2 text-right">
                      原価合計（要確認を含む）
                    </td>
                    <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">
                      {formatYen(totalValue)}
                    </td>
                    <td className="border border-slate-400 px-2 py-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </article>
        )}
      </main>

      <style jsx global>{`
        @page {
          size: A4 landscape;
          margin: 9mm;
        }
        @media print {
          html,
          body {
            background: #fff !important;
          }
          .no-print {
            display: none !important;
          }
          thead {
            display: table-header-group;
          }
          tfoot {
            display: table-row-group;
          }
          tr {
            break-inside: avoid;
          }
          .print-sheet {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-3 py-2 text-center">
      <div className="text-[10px] font-semibold text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}

function PrintHeader({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
}) {
  return (
    <th className={`border border-slate-400 px-2 py-1.5 font-bold ${alignClass(align)}`}>
      {children}
    </th>
  );
}

function PrintCell({
  children,
  align = "left",
  strong = false,
}: {
  children: React.ReactNode;
  align?: "left" | "center" | "right";
  strong?: boolean;
}) {
  return (
    <td className={`border border-slate-300 px-2 py-1.5 align-top leading-4 tabular-nums ${alignClass(align)} ${strong ? "font-semibold" : ""}`}>
      {children}
    </td>
  );
}

function alignClass(align: "left" | "center" | "right") {
  return align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
}

function normalizeItem(value: any): InventoryItem {
  return {
    id: String(value.id || ""),
    product_name: String(value.product_name || ""),
    retail_price_excl_tax: nullableNumber(value.retail_price_excl_tax),
    wholesale_price: nullableNumber(value.wholesale_price),
    tax_rate: normalizeWholesaleInventoryTaxRate(value.tax_rate),
    quantity: nullableNumber(value.quantity),
    review_status: value.review_status === "excluded"
      ? "excluded"
      : value.review_status === "needs_review"
        ? "needs_review"
        : "confirmed",
    note: String(value.note || ""),
  };
}

function inventoryValue(items: InventoryItem[]) {
  return items.reduce(
    (sum, item) => sum + inventoryScaledValue(item.wholesale_price || 0, item.quantity || 0),
    0,
  ) / 100_000;
}

function inventoryScaledValue(cost: number, quantity: number) {
  return Math.round(cost * 100) * Math.round(quantity * 1000);
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function formatYen(value: unknown) {
  const number = nullableNumber(value);
  if (number === null) return "-";
  return `¥${number.toLocaleString("ja-JP", {
    minimumFractionDigits: Number.isInteger(number) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQuantity(value: unknown) {
  const number = nullableNumber(value);
  if (number === null) return "-";
  return number.toLocaleString("ja-JP", { maximumFractionDigits: 3 });
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
