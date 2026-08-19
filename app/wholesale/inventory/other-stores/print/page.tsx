"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { inventoryFiscalLabel } from "@/lib/inventory-fiscal";

type InventorySession = {
  id: string;
  fiscal_year: number;
  inventory_date: string;
  source_month: string;
  source_sale_row_count: number;
  source_product_count: number;
  source_total_quantity: number | string;
  source_total_amount: number | string;
  generated_at: string;
};

type InventoryItem = {
  id: string;
  product_code: string;
  product_name: string;
  sold_quantity: number | string;
  sales_amount: number | string;
  average_selling_price: number | string;
  inventory_quantity: number | string;
  cost_rate: number | string;
  cost_unit: number | string;
  inventory_value: number | string;
  note: string;
};

export default function WholesaleOtherStoresInventoryPrintPage() {
  const [inventory, setInventory] = useState<InventorySession | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    const query = id ? `?id=${encodeURIComponent(id)}` : "";

    fetch(`/api/wholesale/inventory/other-stores${query}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || "他社分の決算棚卸し取得に失敗しました");
        }
        setInventory(data.inventory || null);
        setItems(data.items || []);
      })
      .catch((reason: Error) => {
        setError(reason.message || "他社分の決算棚卸し取得に失敗しました");
      })
      .finally(() => setLoading(false));
  }, []);

  const inventoryQuantity = useMemo(
    () => items.reduce((sum, item) => sum + numberValue(item.inventory_quantity), 0),
    [items],
  );
  const inventoryValue = useMemo(
    () => items.reduce((sum, item) => sum + numberValue(item.inventory_value), 0),
    [items],
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white px-3 py-3 shadow-sm md:px-6">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
          <Button asChild size="sm" variant="ghost" className="gap-2">
            <a href="/wholesale/inventory/other-stores">
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
                  <h1 className="text-2xl font-bold">卸販売 決算棚卸し（他社）表</h1>
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
                <SummaryCell label="対象商品" value={`${items.length.toLocaleString()}品目`} />
                <SummaryCell
                  label="7月販売数"
                  value={formatQuantity(numberValue(inventory.source_total_quantity))}
                />
                <SummaryCell label="他社在庫数" value={formatQuantity(inventoryQuantity)} />
                <SummaryCell label="棚卸原価" value={formatYen(inventoryValue)} />
              </div>
              <div className="mt-2 flex flex-wrap justify-between gap-x-5 gap-y-1 text-[11px] text-slate-500">
                <span>{inventory.fiscal_year}年7月の通常卸実績 / OEM除外</span>
                <span>販売数の3分の1 / 実売単価の加重平均×70%</span>
                <span>保存 {formatDateTime(inventory.generated_at)}</span>
              </div>
            </header>

            <div className="mt-4 overflow-x-auto print:overflow-visible">
              <table className="w-full table-fixed border-collapse text-[10px]">
                <colgroup>
                  <col className="w-[4%]" />
                  <col className="w-[11%]" />
                  <col className="w-[24%]" />
                  <col className="w-[8%]" />
                  <col className="w-[9%]" />
                  <col className="w-[11%]" />
                  <col className="w-[11%]" />
                  <col className="w-[11%]" />
                  <col className="w-[11%]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-100">
                    <PrintHeader align="center">No.</PrintHeader>
                    <PrintHeader>商品コード</PrintHeader>
                    <PrintHeader>商品名</PrintHeader>
                    <PrintHeader align="right">7月<br />販売数</PrintHeader>
                    <PrintHeader align="right">他社<br />在庫数</PrintHeader>
                    <PrintHeader align="right">平均<br />販売単価</PrintHeader>
                    <PrintHeader align="right">原価単価<br />70%</PrintHeader>
                    <PrintHeader align="right">棚卸原価</PrintHeader>
                    <PrintHeader>備考</PrintHeader>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id} className="break-inside-avoid">
                      <PrintCell align="center">{index + 1}</PrintCell>
                      <PrintCell>{item.product_code}</PrintCell>
                      <PrintCell strong>{item.product_name}</PrintCell>
                      <PrintCell align="right">{formatQuantity(numberValue(item.sold_quantity))}</PrintCell>
                      <PrintCell align="right" strong>
                        {formatQuantity(numberValue(item.inventory_quantity))}
                      </PrintCell>
                      <PrintCell align="right">
                        {formatYen(numberValue(item.average_selling_price))}
                      </PrintCell>
                      <PrintCell align="right">{formatYen(numberValue(item.cost_unit))}</PrintCell>
                      <PrintCell align="right" strong>
                        {formatYen(numberValue(item.inventory_value))}
                      </PrintCell>
                      <PrintCell>{item.note}</PrintCell>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 font-bold">
                    <td colSpan={4} className="border border-slate-400 px-2 py-2 text-right">
                      合計
                    </td>
                    <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">
                      {formatQuantity(inventoryQuantity)}
                    </td>
                    <td colSpan={2} className="border border-slate-400" />
                    <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">
                      {formatYen(inventoryValue)}
                    </td>
                    <td className="border border-slate-400" />
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

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQuantity(value: number) {
  return value.toLocaleString("ja-JP", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function formatYen(value: number, fractionDigits = 0) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
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

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
