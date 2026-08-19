"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarRange,
  FileSpreadsheet,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  Store,
} from "lucide-react";
import { toast } from "sonner";

import { InventoryModeNav } from "@/components/wholesale/inventory-mode-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  currentInventoryFiscalYear,
  inventoryFiscalLabel,
  inventoryFiscalYearOptions,
} from "@/lib/inventory-fiscal";

type InventorySession = {
  id: string;
  fiscal_year: number;
  inventory_date: string;
  source_month: string;
  status: "draft" | "completed";
  source_sale_row_count: number;
  source_product_count: number;
  source_total_quantity: number | string;
  source_total_amount: number | string;
  generated_at: string;
  created_at: string;
};

type InventoryItem = {
  id: string;
  inventory_id: string;
  product_id: string;
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
  sort_order: number;
};

export default function WholesaleOtherStoresInventoryPage() {
  const noteSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [inventory, setInventory] = useState<InventorySession | null>(null);
  const [histories, setHistories] = useState<InventorySession[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState(currentInventoryFiscalYear());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [savingNotes, setSavingNotes] = useState<Record<string, boolean>>({});

  const fiscalYears = useMemo(
    () => inventoryFiscalYearOptions(histories.map((history) => history.fiscal_year)),
    [histories],
  );
  const filteredItems = useMemo(() => {
    const keyword = normalizeSearch(search);
    if (!keyword) return items;
    return items.filter((item) => (
      normalizeSearch(`${item.product_code} ${item.product_name} ${item.note}`).includes(keyword)
    ));
  }, [items, search]);
  const inventoryQuantity = useMemo(
    () => items.reduce((sum, item) => sum + numberValue(item.inventory_quantity), 0),
    [items],
  );
  const inventoryValue = useMemo(
    () => items.reduce((sum, item) => sum + numberValue(item.inventory_value), 0),
    [items],
  );

  useEffect(() => {
    loadInventory(currentInventoryFiscalYear());
    return () => {
      Object.values(noteSaveTimers.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const loadInventory = async (fiscalYear: number) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/wholesale/inventory/other-stores?fiscalYear=${encodeURIComponent(fiscalYear)}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "他社分の決算棚卸し取得に失敗しました");
      }
      setSelectedFiscalYear(fiscalYear);
      setInventory(data.inventory || null);
      setItems(data.items || []);
      setHistories(data.histories || []);
    } catch (error: any) {
      toast.error(error.message || "他社分の決算棚卸し取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const generateInventory = async (action: "create" | "refresh") => {
    if (
      action === "refresh"
      && !window.confirm(
        `${selectedFiscalYear}年7月の最新売上で再集計します。備考は残ります。よろしいですか？`,
      )
    ) {
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch("/api/wholesale/inventory/other-stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, fiscalYear: selectedFiscalYear }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "他社分の決算棚卸し作成に失敗しました");
      }
      setInventory(data.inventory);
      setItems(data.items || []);
      await reloadHistories(data.inventory.id);
      toast.success(action === "refresh" ? "7月実績から更新しました" : "他社分の棚卸しを作成しました");
    } catch (error: any) {
      toast.error(error.message || "他社分の決算棚卸し作成に失敗しました");
    } finally {
      setGenerating(false);
    }
  };

  const reloadHistories = async (id: string) => {
    const response = await fetch(
      `/api/wholesale/inventory/other-stores?id=${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (response.ok && data.success) setHistories(data.histories || []);
  };

  const updateNote = (id: string, note: string) => {
    setItems((current) => current.map((item) => (
      item.id === id ? { ...item, note } : item
    )));
    const currentTimer = noteSaveTimers.current[id];
    if (currentTimer) clearTimeout(currentTimer);
    noteSaveTimers.current[id] = setTimeout(() => {
      delete noteSaveTimers.current[id];
      saveNote(id, note);
    }, 450);
  };

  const saveNote = async (id: string, note: string) => {
    setSavingNotes((current) => ({ ...current, [id]: true }));
    try {
      const response = await fetch("/api/wholesale/inventory/other-stores/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, note }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "備考の保存に失敗しました");
      }
    } catch (error: any) {
      toast.error(error.message || "備考の保存に失敗しました");
    } finally {
      setSavingNotes((current) => ({ ...current, [id]: false }));
    }
  };

  const downloadExcel = async () => {
    if (!inventory) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const rows: (string | number)[][] = [
        ["卸販売 決算棚卸し（他社）"],
        ["決算年度", `${inventory.fiscal_year}年度`],
        ["対象期間", inventoryFiscalLabel(inventory.fiscal_year)],
        ["集計対象", `${inventory.fiscal_year}年7月の通常卸実績`],
        ["集計日時", formatDateTime(inventory.generated_at)],
        [],
        [
          "商品コード",
          "商品名",
          "7月販売数",
          "7月売上高",
          "7月平均販売単価",
          "他社在庫数",
          "原価率",
          "原価単価",
          "棚卸原価",
          "備考",
        ],
        ...items.map((item) => [
          item.product_code,
          item.product_name,
          numberValue(item.sold_quantity),
          numberValue(item.sales_amount),
          numberValue(item.average_selling_price),
          numberValue(item.inventory_quantity),
          numberValue(item.cost_rate),
          numberValue(item.cost_unit),
          numberValue(item.inventory_value),
          item.note,
        ]),
        [],
        [
          "",
          "合計",
          numberValue(inventory.source_total_quantity),
          numberValue(inventory.source_total_amount),
          "",
          inventoryQuantity,
          "",
          "",
          inventoryValue,
          "",
        ],
      ];
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      sheet["!cols"] = [
        { wch: 16 },
        { wch: 34 },
        { wch: 13 },
        { wch: 15 },
        { wch: 18 },
        { wch: 14 },
        { wch: 10 },
        { wch: 14 },
        { wch: 16 },
        { wch: 28 },
      ];
      sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }];
      applyExcelFormats(sheet, items.length);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "他社");
      XLSX.writeFile(
        workbook,
        `卸販売_決算棚卸し_他社_${inventory.fiscal_year}年度.xlsx`,
      );
      toast.success("Excelを出力しました");
    } catch (error: any) {
      toast.error(error.message || "Excel出力に失敗しました");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button asChild size="icon" variant="ghost" title="卸販売管理へ戻る" className="h-10 w-10 shrink-0">
              <a href="/wholesale/dashboard"><ArrowLeft className="h-5 w-5" /></a>
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold md:text-xl">卸販売 決算棚卸し（他社）</h1>
              <div className="truncate text-xs text-slate-500">
                {inventoryFiscalLabel(selectedFiscalYear)}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {inventory && (
              <>
                <Button
                  asChild
                  size="icon"
                  variant="outline"
                  className="h-10 w-10"
                  title="印刷画面を開く"
                >
                  <a
                    href={`/wholesale/inventory/other-stores/print?id=${encodeURIComponent(inventory.id)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Printer className="h-4 w-4" />
                  </a>
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-10 w-10"
                  title="Excel出力"
                  onClick={downloadExcel}
                  disabled={exporting}
                >
                  {exporting
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <FileSpreadsheet className="h-4 w-4" />}
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-3 px-3 py-3 pb-24 md:px-6 md:py-5">
        <InventoryModeNav current="partner" />

        <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between md:p-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700">
              <Store className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="font-bold">{selectedFiscalYear}年7月の通常卸実績</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">
                商品別販売数の3分の1、実売単価の加重平均×70%で計算
              </div>
              {inventory && (
                <div className="text-xs text-slate-400">
                  保存 {formatDateTime(inventory.generated_at)} / OEM除外
                </div>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <label className="relative min-w-0 flex-1 md:w-64">
              <CalendarRange className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                aria-label="決算年度"
                value={selectedFiscalYear}
                onChange={(event) => loadInventory(Number(event.target.value))}
                className="h-10 w-full appearance-none rounded-md border border-slate-200 bg-white pl-9 pr-8 text-sm font-semibold"
              >
                {fiscalYears.map((year) => (
                  <option key={year} value={year}>{year}年度</option>
                ))}
              </select>
            </label>
            <Button
              className="h-10 shrink-0 gap-1.5 bg-emerald-600 px-3 hover:bg-emerald-700"
              onClick={() => generateInventory(inventory ? "refresh" : "create")}
              disabled={generating}
            >
              {generating
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <RefreshCw className="h-4 w-4" />}
              {inventory ? "7月実績から更新" : "作成"}
            </Button>
          </div>
        </section>

        {loading ? (
          <div className="grid min-h-72 place-items-center text-sm font-semibold text-slate-500">
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              読み込み中
            </div>
          </div>
        ) : inventory ? (
          <>
            <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 shadow-sm md:grid-cols-4">
              <SummaryValue label="対象商品" value={`${items.length.toLocaleString()}品目`} />
              <SummaryValue
                label="7月販売数"
                value={formatQuantity(numberValue(inventory.source_total_quantity))}
                sub={`${inventory.source_sale_row_count.toLocaleString()}明細`}
              />
              <SummaryValue label="他社在庫数" value={formatQuantity(inventoryQuantity)} />
              <SummaryValue label="棚卸原価" value={formatYen(inventoryValue)} tone="green" />
            </section>

            <section className="sticky top-[65px] z-20 border-y border-slate-200 bg-slate-100 py-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="商品名・商品コードを検索"
                  className="h-11 bg-white pl-9"
                />
              </div>
            </section>

            <div className="hidden grid-cols-[minmax(220px,1fr)_100px_110px_125px_110px_125px_minmax(180px,240px)] gap-3 px-4 text-xs font-bold text-slate-500 md:grid">
              <span>商品</span>
              <span className="text-right">7月販売数</span>
              <span className="text-right">他社在庫数</span>
              <span className="text-right">平均販売単価</span>
              <span className="text-right">原価単価</span>
              <span className="text-right">棚卸原価</span>
              <span>備考</span>
            </div>

            <div className="space-y-2">
              {filteredItems.map((item) => (
                <InventoryItemRow
                  key={item.id}
                  item={item}
                  saving={Boolean(savingNotes[item.id])}
                  onNoteChange={(note) => updateNote(item.id, note)}
                />
              ))}
              {!filteredItems.length && (
                <div className="rounded-lg border border-slate-200 bg-white py-16 text-center text-sm text-slate-500">
                  該当する商品はありません
                </div>
              )}
            </div>
          </>
        ) : (
          <section className="grid min-h-80 place-items-center rounded-lg border border-slate-200 bg-white px-6 text-center shadow-sm">
            <div>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-slate-900 text-white">
                <Store className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-bold">{selectedFiscalYear}年度のデータは未作成です</h2>
              <p className="mt-2 text-sm text-slate-500">
                {selectedFiscalYear}年7月の通常卸実績から作成します。
              </p>
              <Button
                className="mt-5 h-11 gap-2 bg-emerald-600 px-5 hover:bg-emerald-700"
                onClick={() => generateInventory("create")}
                disabled={generating}
              >
                {generating
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <RefreshCw className="h-4 w-4" />}
                作成
              </Button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function InventoryItemRow({
  item,
  saving,
  onNoteChange,
}: {
  item: InventoryItem;
  saving: boolean;
  onNoteChange: (note: string) => void;
}) {
  return (
    <article className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-[minmax(220px,1fr)_100px_110px_125px_110px_125px_minmax(180px,240px)] md:items-center md:px-4">
      <div className="col-span-2 min-w-0 md:col-span-1">
        <div className="truncate text-sm font-bold">{item.product_name}</div>
        {item.product_code && (
          <div className="mt-0.5 truncate text-xs text-slate-400">{item.product_code}</div>
        )}
      </div>
      <Metric label="7月販売数" value={formatQuantity(numberValue(item.sold_quantity))} />
      <Metric label="他社在庫数" value={formatQuantity(numberValue(item.inventory_quantity))} strong />
            <Metric label="平均販売単価" value={formatYen(numberValue(item.average_selling_price))} />
      <Metric
        label={`原価単価 ${Math.round(numberValue(item.cost_rate) * 100)}%`}
        value={formatYen(numberValue(item.cost_unit))}
      />
      <Metric label="棚卸原価" value={formatYen(numberValue(item.inventory_value))} strong tone="green" />
      <label className="relative col-span-2 md:col-span-1">
        <span className="mb-1 block text-[11px] font-semibold text-slate-400 md:sr-only">備考</span>
        <Input
          value={item.note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="備考"
          className="h-10 pr-8 text-sm"
        />
        {saving && (
          <Loader2 className="absolute bottom-3 right-3 h-3.5 w-3.5 animate-spin text-slate-400" />
        )}
      </label>
    </article>
  );
}

function Metric({
  label,
  value,
  strong = false,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "green";
}) {
  return (
    <div className="min-w-0 text-right">
      <div className="text-[11px] font-semibold text-slate-400 md:hidden">{label}</div>
      <div className={`truncate tabular-nums ${strong ? "font-bold" : "font-semibold"} ${
        tone === "green" ? "text-emerald-700" : "text-slate-800"
      }`}>
        {value}
      </div>
    </div>
  );
}

function SummaryValue({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "green";
}) {
  return (
    <div className="min-w-0 bg-white p-3 md:p-4">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={`mt-1 truncate text-lg font-bold tabular-nums md:text-xl ${
        tone === "green" ? "text-emerald-700" : "text-slate-900"
      }`}>
        {value}
      </div>
      {sub && <div className="mt-1 truncate text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function applyExcelFormats(sheet: any, itemCount: number) {
  const firstDataRow = 8;
  const lastDataRow = firstDataRow + itemCount - 1;
  for (let row = firstDataRow; row <= lastDataRow; row += 1) {
    for (const column of ["C", "F"]) {
      if (sheet[`${column}${row}`]) sheet[`${column}${row}`].z = "#,##0";
    }
    for (const column of ["D", "E", "H", "I"]) {
      if (sheet[`${column}${row}`]) sheet[`${column}${row}`].z = "¥#,##0";
    }
    if (sheet[`G${row}`]) sheet[`G${row}`].z = "0%";
  }
}

function normalizeSearch(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ja").replace(/\s+/g, "");
}

function numberValue(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("ja-JP", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatYen(value: number, fractionDigits = 0) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function formatDateTime(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
