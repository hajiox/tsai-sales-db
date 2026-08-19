"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  AlertTriangle,
  CalendarRange,
  Check,
  Download,
  FileSpreadsheet,
  Loader2,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { InventoryQrCode } from "@/components/brand-store/InventoryQrDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  currentInventoryFiscalYear,
  inventoryFiscalLabel,
  inventoryFiscalYearOptions,
} from "@/lib/inventory-fiscal";
import {
  type BrandStoreTaxRate,
  normalizeBrandStoreTaxRate,
  taxIncludedYen,
} from "@/lib/brand-store-tax";
import { brandStoreInventoryPrice } from "@/lib/brand-store-inventory-price";

type InventorySession = {
  id: string;
  fiscal_year: number;
  inventory_date: string;
  source_start_month: string;
  source_end_month: string;
  status: "draft" | "completed";
  created_at: string;
};

type InventoryItem = {
  id: string;
  inventory_id: string;
  product_name: string;
  selling_price: number | null;
  wholesale_price: number | null;
  tax_rate: BrandStoreTaxRate;
  quantity: number | null;
  note: string;
  annual_quantity_sold: number;
  last_sold_month: string | null;
  sort_order: number;
  is_manual: boolean;
};

type ItemFilter = "incomplete" | "completed" | "all";
type SaveState = "editing" | "saving" | "saved" | "error";

type MasterImportStatus = {
  lastImport: {
    imported_at: string;
    file_name: string;
    row_count: number;
    synced_item_count: number;
  } | null;
  nextDueAt: string | null;
  alert: boolean;
};

export default function BrandStoreInventoryPage() {
  const [inventory, setInventory] = useState<InventorySession | null>(null);
  const [histories, setHistories] = useState<InventorySession[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState(currentInventoryFiscalYear());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ItemFilter>("incomplete");
  const [visibleCount, setVisibleCount] = useState(80);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualSellingPrice, setManualSellingPrice] = useState("");
  const [manualTaxRate, setManualTaxRate] = useState<BrandStoreTaxRate>(8);
  const [addingManual, setAddingManual] = useState(false);
  const [masterStatus, setMasterStatus] = useState<MasterImportStatus | null>(null);
  const [masterDialogOpen, setMasterDialogOpen] = useState(false);
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [importingMaster, setImportingMaster] = useState(false);

  useEffect(() => {
    loadInventory();
    loadMasterStatus();
  }, []);

  useEffect(() => {
    setVisibleCount(80);
  }, [search, filter]);

  const completedCount = useMemo(
    () => items.filter((item) => isCompletedForView(item, saveStates[item.id])).length,
    [items, saveStates],
  );
  const inventoryValue = useMemo(
    () => items.reduce((sum, item) => sum + (item.wholesale_price ?? 0) * (item.quantity ?? 0), 0),
    [items],
  );
  const inventoryTaxIncludedValue = useMemo(
    () => items.reduce(
      (sum, item) => sum + (taxIncludedYen(item.wholesale_price, item.tax_rate) ?? 0) * (item.quantity ?? 0),
      0,
    ),
    [items],
  );
  const retailValue = useMemo(
    () => items.reduce((sum, item) => sum + (item.selling_price ?? 0) * (item.quantity ?? 0), 0),
    [items],
  );
  const filteredItems = useMemo(() => {
    const keyword = normalizeSearch(search);
    return items
      .filter((item) => {
        const completed = isCompletedForView(item, saveStates[item.id]);
        const matchesFilter = filter === "all" || (filter === "completed" ? completed : !completed);
        const matchesSearch = !keyword || normalizeSearch(`${item.product_name} ${item.note}`).includes(keyword);
        return matchesFilter && matchesSearch;
      })
      .sort((a, b) => (
        a.tax_rate - b.tax_rate
        || a.sort_order - b.sort_order
        || a.product_name.localeCompare(b.product_name, "ja")
      ));
  }, [items, filter, search, saveStates]);
  const fiscalYearOptions = useMemo(
    () => inventoryFiscalYearOptions(histories.map((history) => history.fiscal_year)),
    [histories],
  );

  const loadInventory = async (id?: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/brand-store/inventory${id ? `?id=${encodeURIComponent(id)}` : ""}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "棚卸し表の取得に失敗しました");
      setInventory(data.inventory || null);
      setHistories(data.histories || []);
      setItems((data.items || []).map(normalizeItem));
    } catch (error: any) {
      toast.error(error.message || "棚卸し表の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const loadMasterStatus = async () => {
    try {
      const response = await fetch("/api/brand-store/import-masters", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "商品マスターの更新状況を取得できませんでした");
      setMasterStatus({
        lastImport: data.lastImport || null,
        nextDueAt: data.nextDueAt || null,
        alert: Boolean(data.alert),
      });
    } catch (error: any) {
      console.error(error);
      setMasterStatus({ lastImport: null, nextDueAt: null, alert: true });
    }
  };

  const importProductMaster = async () => {
    if (!masterFile) {
      toast.error("商品マスターCSVを選択してください");
      return;
    }
    setImportingMaster(true);
    try {
      const formData = new FormData();
      formData.append("productMaster", masterFile);
      const response = await fetch("/api/brand-store/import-masters", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "商品マスターの読み込みに失敗しました");

      setMasterStatus({
        lastImport: data.lastImport || null,
        nextDueAt: data.nextDueAt || null,
        alert: Boolean(data.alert),
      });
      setMasterDialogOpen(false);
      setMasterFile(null);
      await loadInventory(inventory?.id);
      toast.success(
        `商品マスター${Number(data.rowCount || 0).toLocaleString()}件を更新し、現在年度の${Number(data.syncedItemCount || 0).toLocaleString()}商品へ反映しました`,
      );
      if (Number(data.variantPriceConflictCount || 0) > 0) {
        toast.info(`価格が異なるバリエーション商品が${Number(data.variantPriceConflictCount).toLocaleString()}件あります。代表価格には最も多い価格を使用しました`);
      }
    } catch (error: any) {
      toast.error(error.message || "商品マスターの読み込みに失敗しました");
    } finally {
      setImportingMaster(false);
    }
  };

  const generateInventory = async () => {
    setGenerating(true);
    try {
      const response = await fetch("/api/brand-store/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          inventoryDate: todayInputValue(),
          fiscalYear: selectedFiscalYear,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "棚卸し表の作成に失敗しました");
      setInventory(data.inventory);
      setItems((data.items || []).map(normalizeItem));
      setFilter("incomplete");
      setSaveStates({});
      setCreateDialogOpen(false);
      await refreshHistories(data.inventory.id);
      toast.success(data.existing
        ? `${selectedFiscalYear}年度の保存済み棚卸し表を開きました`
        : `${selectedFiscalYear}年度を${Number(data.generatedCount || 0).toLocaleString()}商品で作成しました`);
    } catch (error: any) {
      toast.error(error.message || "棚卸し表の作成に失敗しました");
    } finally {
      setGenerating(false);
    }
  };

  const openCreateDialog = () => {
    setSelectedFiscalYear(currentInventoryFiscalYear());
    setCreateDialogOpen(true);
  };

  const refreshHistories = async (selectedId: string) => {
    const response = await fetch(`/api/brand-store/inventory?id=${encodeURIComponent(selectedId)}`, { cache: "no-store" });
    const data = await response.json();
    if (response.ok && data.success) setHistories(data.histories || []);
  };

  const updateItemLocal = (id: string, updates: Partial<InventoryItem>, markEditing = false) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...updates } : item)));
    if (markEditing) setSaveStates((current) => ({ ...current, [id]: "editing" }));
  };

  const saveItem = async (id: string, updates: Record<string, unknown>) => {
    setSaveStates((current) => ({ ...current, [id]: "saving" }));
    try {
      const response = await fetch("/api/brand-store/inventory/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "保存に失敗しました");
      const savedItem = normalizeItem(data.item);
      const savedFields: Partial<InventoryItem> = {};
      if (Object.prototype.hasOwnProperty.call(updates, "productName")) savedFields.product_name = savedItem.product_name;
      if (Object.prototype.hasOwnProperty.call(updates, "sellingPrice")) {
        savedFields.selling_price = savedItem.selling_price;
        savedFields.wholesale_price = savedItem.wholesale_price;
      }
      if (Object.prototype.hasOwnProperty.call(updates, "taxRate")) savedFields.tax_rate = savedItem.tax_rate;
      if (Object.prototype.hasOwnProperty.call(updates, "quantity")) savedFields.quantity = savedItem.quantity;
      if (Object.prototype.hasOwnProperty.call(updates, "note")) savedFields.note = savedItem.note;
      updateItemLocal(id, savedFields);
      setSaveStates((current) => ({ ...current, [id]: "saved" }));
    } catch (error: any) {
      setSaveStates((current) => ({ ...current, [id]: "error" }));
      toast.error(error.message || "保存に失敗しました");
    }
  };

  const addManualItem = async () => {
    if (!inventory || !manualName.trim()) {
      toast.error("商品名を入力してください");
      return;
    }
    const sellingPrice = nullableNumber(manualSellingPrice);
    if (sellingPrice === null) {
      toast.error("販売価格を入力してください");
      return;
    }
    setAddingManual(true);
    try {
      const response = await fetch("/api/brand-store/inventory/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryId: inventory.id,
          productName: manualName,
          sellingPrice,
          taxRate: manualTaxRate,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "商品の追加に失敗しました");
      setItems((current) => [normalizeItem(data.item), ...current]);
      setManualName("");
      setManualSellingPrice("");
      setManualTaxRate(8);
      setManualDialogOpen(false);
      setFilter("incomplete");
      toast.success("商品を追加しました");
    } catch (error: any) {
      toast.error(error.message || "商品の追加に失敗しました");
    } finally {
      setAddingManual(false);
    }
  };

  const deleteItem = async (item: InventoryItem) => {
    if (!confirm(`${item.product_name} を棚卸し表から削除しますか？`)) return;
    try {
      const response = await fetch("/api/brand-store/inventory/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "削除に失敗しました");
      setItems((current) => current.filter((row) => row.id !== item.id));
      toast.success("商品を削除しました");
    } catch (error: any) {
      toast.error(error.message || "削除に失敗しました");
    }
  };

  const downloadCsv = () => {
    if (!inventory) return;
    const rows = [
      ["商品名", "販売価格（税別）", "税区分", "税率", "棚卸単価（税別・7掛）", "税込単価", "個数", "棚卸原価（税別）", "棚卸原価（税込）", "備考"],
      ...items.map((item) => [
        item.product_name,
        item.selling_price ?? "",
        item.tax_rate === 8 ? "食品" : "標準",
        `${item.tax_rate}%`,
        item.wholesale_price ?? "",
        taxIncludedYen(item.wholesale_price, item.tax_rate) ?? "",
        item.quantity ?? "",
        item.wholesale_price !== null && item.quantity !== null ? item.wholesale_price * item.quantity : "",
        item.wholesale_price !== null && item.quantity !== null
          ? (taxIncludedYen(item.wholesale_price, item.tax_rate) ?? 0) * item.quantity
          : "",
        item.note,
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ブランド館_決算棚卸し_${inventory.fiscal_year}年度_${inventory.inventory_date}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 text-slate-600">
        <div className="flex items-center gap-2 text-sm font-semibold"><Loader2 className="h-5 w-5 animate-spin" />棚卸し表を読み込み中</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button asChild size="icon" variant="ghost" title="店舗分析へ戻る" className="h-10 w-10 shrink-0">
              <a href="/brand-store-analysis"><ArrowLeft className="h-5 w-5" /></a>
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold md:text-xl">決算棚卸し</h1>
              <div className="truncate text-xs text-slate-500">
                {inventory ? `${inventory.fiscal_year}年度 / ${formatMonth(inventory.source_start_month)}〜${formatMonth(inventory.source_end_month)}` : "ブランド館店舗"}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <InventoryQrCode className="h-16 w-16 sm:h-20 sm:w-20" />
            <Button
              size="icon"
              variant="outline"
              className="h-10 w-10"
              title="Airレジ商品マスターを読み込む"
              onClick={() => setMasterDialogOpen(true)}
            >
              <FileSpreadsheet className="h-4 w-4" />
            </Button>
            {inventory && (
              <Button size="icon" variant="outline" className="h-10 w-10" title="CSV出力" onClick={downloadCsv}>
                <Download className="h-4 w-4" />
              </Button>
            )}
            <Button className="h-10 gap-1.5 bg-slate-900 px-3 hover:bg-slate-800" onClick={openCreateDialog} disabled={generating}>
              <CalendarRange className="h-4 w-4" />
              <span className="hidden sm:inline">年度表作成</span>
            </Button>
          </div>
        </div>
      </header>

      {masterStatus?.alert && (
        <div className="mx-auto max-w-6xl px-3 pt-3 md:px-6">
          <div className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="min-w-0">
                <div className="text-sm font-bold">Airレジ商品マスターを更新してください</div>
                <div className="mt-0.5 text-xs text-amber-800">
                  {masterStatus.lastImport
                    ? `最終更新 ${formatDate(masterStatus.lastImport.imported_at)}。3か月ごとの更新時期です。`
                    : "取込履歴がありません。最新の商品マスターを読み込んでください。"}
                </div>
              </div>
            </div>
            <Button
              className="h-9 shrink-0 bg-amber-600 px-4 text-white hover:bg-amber-700"
              onClick={() => setMasterDialogOpen(true)}
            >
              <Upload className="mr-2 h-4 w-4" />
              今すぐ更新
            </Button>
          </div>
        </div>
      )}

      {!inventory ? (
        <main className="mx-auto grid min-h-[calc(100vh-68px)] max-w-xl place-items-center px-5 py-10 text-center">
          <div>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-lg bg-slate-900 text-white">
              <PackagePlus className="h-7 w-7" />
            </div>
            <h2 className="mt-5 text-xl font-bold">棚卸し表がありません</h2>
            <p className="mt-2 text-sm text-slate-500">直近12か月に販売された商品が対象です。</p>
            <Button className="mt-6 h-12 gap-2 bg-slate-900 px-6 hover:bg-slate-800" onClick={openCreateDialog} disabled={generating}>
              <CalendarRange className="h-5 w-5" />
              年度を選んで作成
            </Button>
          </div>
        </main>
      ) : (
        <main className="mx-auto max-w-6xl space-y-3 px-3 py-3 pb-24 md:px-6 md:py-5">
          <section className="grid grid-cols-2 gap-y-3 rounded-lg border border-slate-200 bg-white py-3 shadow-sm md:grid-cols-4 md:divide-x md:divide-slate-200">
            <SummaryValue label="入力済み" value={`${completedCount}/${items.length}`} />
            <SummaryValue label="棚卸原価（税別・7掛）" value={formatYen(inventoryValue)} />
            <SummaryValue label="税込参考" value={formatYen(inventoryTaxIncludedValue)} />
            <SummaryValue label="販売価格計" value={formatYen(retailValue)} />
          </section>

          <section className="sticky top-[69px] z-20 space-y-2 border-y border-slate-200 bg-slate-100 py-2">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="商品名を検索" className="h-11 bg-white pl-9" />
              </div>
              <Button className="h-11 shrink-0 gap-1.5 bg-emerald-600 px-3 hover:bg-emerald-700" onClick={() => setManualDialogOpen(true)}>
                <Plus className="h-4 w-4" />商品追加
              </Button>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              <FilterButton active={filter === "incomplete"} onClick={() => setFilter("incomplete")} label="未入力" count={items.length - completedCount} />
              <FilterButton active={filter === "completed"} onClick={() => setFilter("completed")} label="入力済み" count={completedCount} />
              <FilterButton active={filter === "all"} onClick={() => setFilter("all")} label="すべて" count={items.length} />
              {histories.length > 1 && (
                <select
                  aria-label="過去の棚卸し"
                  value={inventory.id}
                  onChange={(event) => loadInventory(event.target.value)}
                  className="ml-auto h-9 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs"
                >
                  {histories.map((history) => (
                    <option key={history.id} value={history.id}>{history.fiscal_year}年度</option>
                  ))}
                </select>
              )}
            </div>
          </section>

          <div className="space-y-2">
            {filteredItems.slice(0, visibleCount).map((item) => (
              <InventoryItemCard
                key={item.id}
                item={item}
                saveState={saveStates[item.id]}
                onChange={(updates) => updateItemLocal(item.id, updates, true)}
                onSave={(updates) => saveItem(item.id, updates)}
                onDelete={() => deleteItem(item)}
              />
            ))}
            {!filteredItems.length && (
              <div className="py-16 text-center text-sm text-slate-500">該当する商品はありません</div>
            )}
            {filteredItems.length > visibleCount && (
              <Button variant="outline" className="h-12 w-full bg-white" onClick={() => setVisibleCount((count) => count + 80)}>
                さらに表示（残り{(filteredItems.length - visibleCount).toLocaleString()}件）
              </Button>
            )}
          </div>
        </main>
      )}

      <Dialog open={masterDialogOpen} onOpenChange={setMasterDialogOpen}>
        <DialogContent className="w-[calc(100%-24px)] max-w-lg rounded-lg">
          <DialogHeader>
            <DialogTitle>Airレジ商品マスターを更新</DialogTitle>
            <DialogDescription>
              商品ID・商品名・販売価格・税率を読み込み、現在年度の棚卸し表へ反映します。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
              Airレジ バックオフィスの「商品設定」から、全商品を含む商品一括編集CSVを選択してください。
              棚卸単価は販売価格（税別）の70%へ自動更新します。過去年度の表と、入力済みの個数・備考は変更しません。
            </div>
            <label
              htmlFor="airregi-product-master"
              className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-5 text-center hover:border-slate-400 hover:bg-slate-50"
            >
              <FileSpreadsheet className="h-8 w-8 text-slate-400" />
              <span className="mt-2 max-w-full truncate text-sm font-semibold text-slate-800">
                {masterFile ? masterFile.name : "商品一括編集CSVを選択"}
              </span>
              <span className="mt-1 text-xs text-slate-500">Shift_JIS・UTF-8対応</span>
              <input
                id="airregi-product-master"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => setMasterFile(event.target.files?.[0] || null)}
              />
            </label>
            {masterStatus?.lastImport && (
              <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                <span>最終更新 {formatDate(masterStatus.lastImport.imported_at)}</span>
                <span>{masterStatus.lastImport.row_count.toLocaleString()}商品</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMasterDialogOpen(false)} disabled={importingMaster}>
              キャンセル
            </Button>
            <Button
              className="bg-slate-900 hover:bg-slate-800"
              onClick={importProductMaster}
              disabled={!masterFile || importingMaster}
            >
              {importingMaster
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Upload className="mr-2 h-4 w-4" />}
              読み込んで更新
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="w-[calc(100%-24px)] max-w-md rounded-lg">
          <DialogHeader>
            <DialogTitle>決算年度を選択</DialogTitle>
            <DialogDescription>選択年度の販売実績から棚卸し表を作成します。保存済みの年度は、その表を開きます。</DialogDescription>
          </DialogHeader>
          <label className="block py-2 text-sm font-semibold">
            決算年度
            <select
              value={selectedFiscalYear}
              onChange={(event) => setSelectedFiscalYear(Number(event.target.value))}
              className="mt-1 h-12 w-full rounded-md border border-slate-200 bg-white px-3 text-base font-semibold"
            >
              {fiscalYearOptions.map((year) => (
                <option key={year} value={year}>{inventoryFiscalLabel(year)}</option>
              ))}
            </select>
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>キャンセル</Button>
            <Button className="bg-slate-900 hover:bg-slate-800" onClick={generateInventory} disabled={generating}>
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarRange className="mr-2 h-4 w-4" />}
              この年度を開く
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
        <DialogContent className="w-[calc(100%-24px)] max-w-md rounded-lg">
          <DialogHeader>
            <DialogTitle>商品を追加</DialogTitle>
            <DialogDescription>販売実績に登録されていない商品を棚卸し表へ追加します。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <label className="block text-sm font-semibold">
              商品名
              <Input value={manualName} onChange={(event) => setManualName(event.target.value)} className="mt-1 h-11" autoFocus />
            </label>
            <label className="block text-sm font-semibold">
              販売価格（税別）
              <Input value={manualSellingPrice} onChange={(event) => setManualSellingPrice(event.target.value)} className="mt-1 h-11" inputMode="decimal" type="number" min="0" placeholder="0" />
              <span className="mt-1 block text-xs font-normal text-slate-500">棚卸単価はこの金額の70%で自動計算します</span>
            </label>
            <fieldset>
              <legend className="text-sm font-semibold">税区分</legend>
              <div className="mt-1 grid grid-cols-2 rounded-md border border-slate-200 bg-slate-100 p-1">
                <TaxRateChoice rate={8} current={manualTaxRate} onClick={setManualTaxRate} />
                <TaxRateChoice rate={10} current={manualTaxRate} onClick={setManualTaxRate} />
              </div>
            </fieldset>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDialogOpen(false)}>キャンセル</Button>
            <Button className="bg-slate-900 hover:bg-slate-800" onClick={addManualItem} disabled={addingManual || !manualName.trim() || nullableNumber(manualSellingPrice) === null}>
              {addingManual && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InventoryItemCard({
  item,
  saveState,
  onChange,
  onSave,
  onDelete,
}: {
  item: InventoryItem;
  saveState?: SaveState;
  onChange: (updates: Partial<InventoryItem>) => void;
  onSave: (updates: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const stockValue = (item.wholesale_price ?? 0) * (item.quantity ?? 0);
  const taxIncludedUnitPrice = taxIncludedYen(item.wholesale_price, item.tax_rate);
  const taxIncludedStockValue = (taxIncludedUnitPrice ?? 0) * (item.quantity ?? 0);
  const [manualEditOpen, setManualEditOpen] = useState(false);
  const [manualNameDraft, setManualNameDraft] = useState(item.product_name);
  const [manualPriceDraft, setManualPriceDraft] = useState(
    item.selling_price === null ? "" : String(item.selling_price),
  );

  const openManualEditor = () => {
    setManualNameDraft(item.product_name);
    setManualPriceDraft(item.selling_price === null ? "" : String(item.selling_price));
    setManualEditOpen(true);
  };

  const saveManualProduct = () => {
    const productName = manualNameDraft.trim();
    if (!productName) return;
    const sellingPrice = nullableNumber(manualPriceDraft);
    if (sellingPrice === null) return;
    onChange({ product_name: productName, selling_price: sellingPrice });
    onSave({ productName, sellingPrice });
    setManualEditOpen(false);
  };

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:grid md:grid-cols-[minmax(260px,1.5fr)_150px_150px_minmax(220px,1fr)] md:items-start md:gap-3">
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 break-words text-[15px] font-bold leading-6">{item.product_name}</h2>
          <div className="flex shrink-0 items-center gap-1">
            <TaxRateMark
              rate={item.tax_rate}
              onChange={(rate) => {
                onChange({ tax_rate: rate });
                onSave({ taxRate: rate });
              }}
            />
            {item.is_manual && <Badge variant="outline" className="rounded-md text-[10px]">手動</Badge>}
            {item.is_manual && (
              <Button
                size="icon"
                variant="ghost"
                title="商品名・販売価格を編集"
                aria-label={`${item.product_name}の商品情報を編集`}
                className="h-8 w-8 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                onClick={openManualEditor}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {saveState === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
            {saveState === "saved" && <Check className="h-3.5 w-3.5 text-emerald-600" />}
            {saveState === "error" && <span className="text-xs font-bold text-red-600">未保存</span>}
            <Button
              size="icon"
              variant="ghost"
              title="リストから削除"
              aria-label={`${item.product_name}をリストから削除`}
              className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>販売価格（税別） {formatYen(item.selling_price)}</span>
          {!item.is_manual && <span>年間 {item.annual_quantity_sold.toLocaleString()}個</span>}
          {!item.is_manual && item.last_sold_month && <span>最終 {formatMonth(item.last_sold_month)}</span>}
        </div>
      </div>

      <div className="mt-3 block md:mt-0">
        <span className="mb-1 block text-xs font-semibold text-slate-500">棚卸単価（税別・7掛）</span>
        <div
          className="flex h-12 items-center justify-end rounded-md border border-slate-200 bg-slate-50 px-3 text-lg font-semibold tabular-nums text-slate-800"
          title="販売価格（税別）の70%"
        >
          {formatUnitPrice(item.wholesale_price)}
        </div>
        <span className="mt-1 block text-right text-xs font-semibold text-slate-500">
          税込 {formatYen(taxIncludedUnitPrice)}
        </span>
      </div>

      <label className="mt-3 block md:mt-0">
        <span className="mb-1 block text-xs font-semibold text-slate-500">個数</span>
        <Input
          value={item.quantity ?? ""}
          onChange={(event) => onChange({ quantity: nullableInteger(event.target.value) })}
          onBlur={(event) => onSave({ quantity: nullableInteger(event.currentTarget.value) })}
          className="h-12 text-right text-lg font-semibold"
          inputMode="numeric"
          type="number"
          min="0"
          step="1"
          placeholder="未入力"
        />
      </label>

      <div className="mt-3 md:mt-0">
        <label className="block">
          <span className="mb-1 flex items-start justify-between gap-2 text-xs font-semibold text-slate-500">
            備考
            <span className="text-right font-normal leading-4 text-emerald-700">
              税別 {formatYen(stockValue)}
              <span className="block text-slate-500">税込 {formatYen(taxIncludedStockValue)}</span>
            </span>
          </span>
          <Textarea
            value={item.note}
            onChange={(event) => onChange({ note: event.target.value })}
            onBlur={(event) => onSave({ note: event.currentTarget.value })}
            className="min-h-[48px] resize-none text-sm"
            rows={1}
            placeholder="備考"
          />
        </label>
      </div>
      {item.is_manual && (
        <Dialog open={manualEditOpen} onOpenChange={setManualEditOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>手動商品の編集</DialogTitle>
              <DialogDescription>
                商品名と販売価格を変更します。棚卸単価は販売価格の70%へ自動更新します。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-slate-700">商品名</span>
                <Input
                  value={manualNameDraft}
                  onChange={(event) => setManualNameDraft(event.target.value)}
                  className="h-11"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-slate-700">販売価格（税別）</span>
                <Input
                  value={manualPriceDraft}
                  onChange={(event) => setManualPriceDraft(event.target.value)}
                  className="h-11"
                  inputMode="decimal"
                  type="number"
                  min="0"
                  placeholder="未入力"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  棚卸単価 {formatUnitPrice(brandStoreInventoryPrice(manualPriceDraft))}
                </span>
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setManualEditOpen(false)}>キャンセル</Button>
              <Button
                onClick={saveManualProduct}
                disabled={!manualNameDraft.trim() || nullableNumber(manualPriceDraft) === null}
              >
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </article>
  );
}

function TaxRateMark({ rate, onChange }: { rate: BrandStoreTaxRate; onChange: (rate: BrandStoreTaxRate) => void }) {
  const nextRate: BrandStoreTaxRate = rate === 8 ? 10 : 8;
  return (
    <button
      type="button"
      title={`現在${rate}%です。クリックで${nextRate}%へ変更`}
      aria-label={`税率${rate}%、クリックで${nextRate}%へ変更`}
      onClick={() => onChange(nextRate)}
      className={`h-7 shrink-0 rounded-md border px-2 text-[10px] font-bold ${
        rate === 8
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
      }`}
    >
      {rate === 8 ? "食品 8%" : "標準 10%"}
    </button>
  );
}

function TaxRateChoice({
  rate,
  current,
  onClick,
}: {
  rate: BrandStoreTaxRate;
  current: BrandStoreTaxRate;
  onClick: (rate: BrandStoreTaxRate) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(rate)}
      className={`h-10 rounded-md text-sm font-semibold ${
        current === rate ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
      }`}
    >
      {rate === 8 ? "食品 8%" : "標準 10%"}
    </button>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-2 text-center md:px-4">
      <div className="truncate text-[11px] font-semibold text-slate-500 md:text-xs">{label}</div>
      <div className="mt-1 truncate text-base font-bold tabular-nums md:text-xl">{value}</div>
    </div>
  );
}

function FilterButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 shrink-0 rounded-md border px-3 text-sm font-semibold ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}
    >
      {label}<span className="ml-1.5 text-xs opacity-70">{count.toLocaleString()}</span>
    </button>
  );
}

function normalizeItem(item: any): InventoryItem {
  const sellingPrice = nullableNumber(item.selling_price);
  return {
    ...item,
    selling_price: sellingPrice,
    wholesale_price: brandStoreInventoryPrice(sellingPrice),
    tax_rate: normalizeBrandStoreTaxRate(item.tax_rate) || 10,
    quantity: nullableInteger(item.quantity),
    annual_quantity_sold: Number(item.annual_quantity_sold) || 0,
    note: String(item.note || ""),
    is_manual: Boolean(item.is_manual),
  };
}

function isCompletedForView(item: InventoryItem, saveState?: SaveState) {
  return item.quantity !== null && (saveState === undefined || saveState === "saved");
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function nullableInteger(value: unknown): number | null {
  const number = nullableNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function formatYen(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  return `¥${Math.round(value).toLocaleString()}`;
}

function formatUnitPrice(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  return `¥${value.toLocaleString("ja-JP", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${year}/${month}/${day}`;
}

function formatMonth(value: string) {
  const [year, month] = value.slice(0, 10).split("-");
  return `${year}/${month}`;
}

function todayInputValue() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function normalizeSearch(value: string) {
  return value.normalize("NFKC").replace(/[\s\u3000]+/g, "").toLocaleLowerCase("ja-JP");
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}
