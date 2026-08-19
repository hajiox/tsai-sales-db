"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleOff,
  Database,
  FileSpreadsheet,
  Loader2,
  PackagePlus,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { InventoryModeNav } from "@/components/wholesale/inventory-mode-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  currentInventoryFiscalYear,
  inventoryFiscalLabel,
  inventoryFiscalYearOptions,
} from "@/lib/inventory-fiscal";
import {
  normalizeWholesaleInventoryTaxRate,
  retailPriceInclTaxFromExcluded,
  wholesaleInventoryPrice,
  type WholesaleInventoryTaxRate,
} from "@/lib/wholesale-inventory-price";

type InventorySession = {
  id: string;
  fiscal_year: number;
  inventory_date: string;
  status: "draft" | "completed";
  source_file_name: string | null;
  source_row_count: number;
  matched_row_count: number;
  consolidated_item_count: number;
  set_row_count: number;
  needs_review_count: number;
  imported_at: string | null;
  created_at: string;
};

type MasterImport = {
  id: string;
  file_name: string;
  row_count: number;
  set_item_count: number;
  imported_at: string;
};

type MasterStatus = {
  lastImport: MasterImport | null;
  masterCount: number;
  setItemCount: number;
  physicalItemCount: number;
};

type SourceRow = {
  rowNumber?: number;
  sourceCode?: string;
  productName?: string;
  stock?: number;
  matchedRecipeName?: string;
  multiplier?: number;
  convertedQuantity?: number;
  matchKind?: string;
};

type InventoryItem = {
  id: string;
  inventory_id: string;
  source_key: string | null;
  source_recipe_id: string | null;
  source_web_product_id: string | null;
  product_name: string;
  retail_price_excl_tax: number | null;
  wholesale_price: number | null;
  tax_rate: WholesaleInventoryTaxRate;
  quantity: number | null;
  price_source: string;
  calculation_method:
    | "direct"
    | "shared_stock"
    | "bundle_derived"
    | "listing_deduplicated"
    | "unmatched"
    | "manual";
  review_status: "confirmed" | "needs_review" | "excluded";
  review_reason: string;
  source_rows: SourceRow[];
  note: string;
  is_manual: boolean;
  price_is_manual: boolean;
  sort_order: number;
};

type Filter = "all" | "confirmed" | "needs_review" | "excluded" | "missing_price";
type SaveState = "editing" | "saving" | "saved" | "error";

export default function WholesaleInventoryPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const masterFileInputRef = useRef<HTMLInputElement>(null);
  const [inventory, setInventory] = useState<InventorySession | null>(null);
  const [histories, setHistories] = useState<InventorySession[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [masterStatus, setMasterStatus] = useState<MasterStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [masterDialogOpen, setMasterDialogOpen] = useState(false);
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [importingMaster, setImportingMaster] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [visibleCount, setVisibleCount] = useState(80);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState(currentInventoryFiscalYear());
  const [creating, setCreating] = useState(false);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualRetailPrice, setManualRetailPrice] = useState("");
  const [manualQuantity, setManualQuantity] = useState("");
  const [manualTaxRate, setManualTaxRate] = useState<WholesaleInventoryTaxRate>(8);
  const [addingManual, setAddingManual] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadInventory();
    loadMasterStatus();
  }, []);

  useEffect(() => {
    setVisibleCount(80);
  }, [search, filter]);

  const reviewCount = useMemo(
    () => items.filter((item) => item.review_status === "needs_review").length,
    [items],
  );
  const confirmedValue = useMemo(
    () => inventoryValue(items.filter((item) => item.review_status === "confirmed")),
    [items],
  );
  const provisionalValue = useMemo(
    () => inventoryValue(items.filter((item) => item.review_status !== "excluded")),
    [items],
  );
  const missingPriceCount = useMemo(
    () => items.filter((item) => item.wholesale_price === null).length,
    [items],
  );
  const fiscalYearOptions = useMemo(
    () => inventoryFiscalYearOptions(histories.map((history) => history.fiscal_year)),
    [histories],
  );
  const filteredItems = useMemo(() => {
    const keyword = normalizeSearch(search);
    return items.filter((item) => {
      const matchesSearch = !keyword
        || normalizeSearch(`${item.product_name} ${item.note} ${item.price_source}`).includes(keyword);
      const matchesFilter = filter === "all"
        || item.review_status === filter
        || (filter === "missing_price" && item.wholesale_price === null);
      return matchesSearch && matchesFilter;
    });
  }, [filter, items, search]);

  const loadInventory = async (id?: string) => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/wholesale/inventory${id ? `?id=${encodeURIComponent(id)}` : ""}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "卸決算棚卸しの取得に失敗しました");
      }
      setInventory(data.inventory || null);
      setHistories(data.histories || []);
      setItems((data.items || []).map(normalizeItem));
      if (data.inventory?.fiscal_year) setSelectedFiscalYear(data.inventory.fiscal_year);
    } catch (error: any) {
      toast.error(error.message || "卸決算棚卸しの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const loadMasterStatus = async () => {
    try {
      const response = await fetch("/api/wholesale/inventory/master", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "セット判定マスターの状態を取得できません");
      }
      setMasterStatus({
        lastImport: data.lastImport || null,
        masterCount: Number(data.masterCount || 0),
        setItemCount: Number(data.setItemCount || 0),
        physicalItemCount: Number(data.physicalItemCount || 0),
      });
    } catch (error: any) {
      toast.error(error.message || "セット判定マスターの状態を取得できません");
    }
  };

  const importMaster = async () => {
    if (!masterFile) {
      toast.error("助ネコの商品基本情報CSVを選択してください");
      return;
    }
    setImportingMaster(true);
    try {
      const formData = new FormData();
      formData.append("file", masterFile);
      const response = await fetch("/api/wholesale/inventory/master", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "商品基本情報CSVの読み込みに失敗しました");
      }
      setMasterStatus({
        lastImport: data.lastImport,
        masterCount: Number(data.masterCount || 0),
        setItemCount: Number(data.setItemCount || 0),
        physicalItemCount: Number(data.physicalItemCount || 0),
      });
      setMasterFile(null);
      if (masterFileInputRef.current) masterFileInputRef.current.value = "";
      setMasterDialogOpen(false);
      toast.success(
        `${Number(data.masterCount).toLocaleString()}商品を登録し、`
        + `${Number(data.setItemCount).toLocaleString()}セットを除外対象にしました`,
      );
    } catch (error: any) {
      toast.error(error.message || "商品基本情報CSVの読み込みに失敗しました");
    } finally {
      setImportingMaster(false);
    }
  };

  const createInventory = async () => {
    setCreating(true);
    try {
      const response = await fetch("/api/wholesale/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", fiscalYear: selectedFiscalYear }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "年度棚卸しの作成に失敗しました");
      }
      setInventory(data.inventory);
      setItems((data.items || []).map(normalizeItem));
      setCreateDialogOpen(false);
      await loadInventory(data.inventory.id);
      toast.success(
        data.existing
          ? `${selectedFiscalYear}年度の棚卸しを開きました`
          : `${selectedFiscalYear}年度の棚卸しを作成しました`,
      );
    } catch (error: any) {
      toast.error(error.message || "年度棚卸しの作成に失敗しました");
    } finally {
      setCreating(false);
    }
  };

  const importCsv = async () => {
    if (!masterStatus?.masterCount) {
      setMasterDialogOpen(true);
      toast.error("先にセット判定マスターを登録してください");
      return;
    }
    if (!file) {
      toast.error("助ネコ在庫CSVを選択してください");
      return;
    }
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append(
        "fiscalYear",
        String(inventory?.fiscal_year || selectedFiscalYear),
      );
      const response = await fetch("/api/wholesale/inventory/import", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        if (
          data.code === "SUKENEKO_MASTER_REQUIRED"
          || data.code === "SUKENEKO_MASTER_OUTDATED"
        ) {
          setMasterDialogOpen(true);
        }
        throw new Error(data.error || "助ネコ在庫CSVの読み込みに失敗しました");
      }
      setInventory(data.inventory);
      setItems((data.items || []).map(normalizeItem));
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refreshHistories(data.inventory.id);
      setFilter(data.summary.needsReviewCount ? "needs_review" : "all");
      toast.success(
        `${Number(data.summary.sourceRowCount).toLocaleString()}行から`
        + `${Number(data.summary.setRowCount).toLocaleString()}セットを除外し、`
        + `${Number(data.summary.consolidatedItemCount).toLocaleString()}品目を作成しました`,
      );
    } catch (error: any) {
      toast.error(error.message || "助ネコ在庫CSVの読み込みに失敗しました");
    } finally {
      setImporting(false);
    }
  };

  const refreshHistories = async (id: string) => {
    const response = await fetch(`/api/wholesale/inventory?id=${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    const data = await response.json();
    if (response.ok && data.success) setHistories(data.histories || []);
  };

  const updateItemLocal = (
    id: string,
    updates: Partial<InventoryItem>,
    markEditing = false,
  ) => {
    setItems((current) => current.map(
      (item) => item.id === id ? { ...item, ...updates } : item,
    ));
    if (markEditing) {
      setSaveStates((current) => ({ ...current, [id]: "editing" }));
    }
  };

  const saveItem = async (id: string, updates: Record<string, unknown>) => {
    setSaveStates((current) => ({ ...current, [id]: "saving" }));
    try {
      const response = await fetch("/api/wholesale/inventory/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "保存に失敗しました");
      }
      const saved = normalizeItem(data.item);
      setItems((current) => current.map((item) => item.id === id ? saved : item));
      setSaveStates((current) => ({ ...current, [id]: "saved" }));
    } catch (error: any) {
      setSaveStates((current) => ({ ...current, [id]: "error" }));
      toast.error(error.message || "保存に失敗しました");
    }
  };

  const addManualItem = async () => {
    if (!inventory) {
      toast.error("先に年度棚卸しを作成してください");
      return;
    }
    const retailPrice = nullableNumber(manualRetailPrice);
    if (!manualName.trim() || retailPrice === null) {
      toast.error("商品名と販売価格（税別）を入力してください");
      return;
    }
    setAddingManual(true);
    try {
      const response = await fetch("/api/wholesale/inventory/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryId: inventory.id,
          productName: manualName,
          retailPrice,
          quantity: nullableNumber(manualQuantity),
          taxRate: manualTaxRate,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "商品の追加に失敗しました");
      }
      setItems((current) => [normalizeItem(data.item), ...current]);
      setManualName("");
      setManualRetailPrice("");
      setManualQuantity("");
      setManualTaxRate(8);
      setManualDialogOpen(false);
      toast.success("棚卸し商品を追加しました");
    } catch (error: any) {
      toast.error(error.message || "商品の追加に失敗しました");
    } finally {
      setAddingManual(false);
    }
  };

  const deleteItem = async (item: InventoryItem) => {
    if (!confirm(`${item.product_name} を棚卸し表から削除しますか？`)) return;
    try {
      const response = await fetch("/api/wholesale/inventory/items", {
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

  const selectFile = (nextFile: File | null) => {
    if (nextFile && !nextFile.name.toLowerCase().endsWith(".csv")) {
      toast.error("CSVファイルを選択してください");
      return;
    }
    setFile(nextFile);
  };

  const downloadExcel = async () => {
    if (!inventory) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const rows = items.map((item, index) => [
        index + 1,
        item.product_name,
        item.tax_rate,
        item.retail_price_excl_tax ?? "",
        retailPriceInclTaxFromExcluded(item.retail_price_excl_tax, item.tax_rate) ?? "",
        item.wholesale_price ?? "",
        item.quantity ?? "",
        item.wholesale_price !== null && item.quantity !== null
          ? inventoryScaledValue(item.wholesale_price, item.quantity) / 100_000
          : "",
        item.note,
      ]);
      const sheet = XLSX.utils.aoa_to_sheet([
        ["卸販売 決算棚卸し（倉庫）"],
        ["決算年度", `${inventory.fiscal_year}年度`],
        ["棚卸日", inventory.inventory_date],
        ["取込ファイル", inventory.source_file_name || ""],
        ["確定原価合計", confirmedValue],
        ["要確認込み原価合計", provisionalValue],
        [],
        [
          "No.",
          "商品名",
          "税率（%）",
          "販売価格（税別）",
          "販売価格（税込）",
          "原価（税別）",
          "在庫数",
          "棚卸原価",
          "備考",
        ],
        ...rows,
      ]);
      sheet["!cols"] = [
        { wch: 16 },
        { wch: 46 },
        { wch: 10 },
        { wch: 17 },
        { wch: 17 },
        { wch: 19 },
        { wch: 12 },
        { wch: 16 },
        { wch: 34 },
      ];
      sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
      sheet["!autofilter"] = { ref: `A8:I${rows.length + 8}` };
      sheet["!rows"] = [{ hpt: 24 }, { hpt: 18 }, { hpt: 18 }, { hpt: 18 }, { hpt: 18 }, { hpt: 18 }, { hpt: 8 }, { hpt: 24 }];
      sheet["!margins"] = {
        left: 0.25,
        right: 0.25,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      };
      (sheet as any)["!pageSetup"] = {
        orientation: "landscape",
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9,
      };
      for (const address of ["B5", "B6"]) {
        const cell = sheet[address];
        if (cell?.t === "n") cell.z = "#,##0.00";
      }
      for (let row = 1; row < rows.length + 9; row += 1) {
        for (const column of [3, 4, 5, 7]) {
          const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
          if (cell?.t === "n") cell.z = "#,##0.00";
        }
        const quantityCell = sheet[XLSX.utils.encode_cell({ r: row, c: 6 })];
        if (quantityCell?.t === "n") quantityCell.z = "#,##0.###";
      }
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "卸棚卸し");
      XLSX.writeFile(workbook, `卸販売_決算棚卸し_倉庫_${inventory.fiscal_year}年度.xlsx`);
      toast.success("Excelを出力しました");
    } catch (error: any) {
      toast.error(error.message || "Excel出力に失敗しました");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-100 text-slate-600">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Loader2 className="h-5 w-5 animate-spin" />
          棚卸しを読み込み中
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Button asChild size="icon" variant="ghost" title="卸販売管理へ戻る" className="h-10 w-10 shrink-0">
              <a href="/wholesale/dashboard"><ArrowLeft className="h-5 w-5" /></a>
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold md:text-xl">卸販売 決算棚卸し（倉庫）</h1>
              <div className="truncate text-xs text-slate-500">
                {inventory ? inventoryFiscalLabel(inventory.fiscal_year) : "助ネコ在庫から作成"}
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
                    href={`/wholesale/inventory/print?id=${encodeURIComponent(inventory.id)}`}
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
            <Button
              className="h-10 gap-1.5 bg-slate-900 px-3 hover:bg-slate-800"
              onClick={() => {
                setSelectedFiscalYear(inventory?.fiscal_year || currentInventoryFiscalYear());
                setCreateDialogOpen(true);
              }}
            >
              <CalendarRange className="h-4 w-4" />
              <span className="hidden sm:inline">年度</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-3 px-3 py-3 pb-24 md:px-6 md:py-5">
        <InventoryModeNav current="warehouse" />

        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:p-4">
          <div className="mb-3 flex min-w-0 items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Database className={`h-5 w-5 shrink-0 ${
                masterStatus?.masterCount ? "text-emerald-600" : "text-amber-600"
              }`} />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">
                  {masterStatus?.masterCount
                    ? `セット判定マスター ${masterStatus.masterCount.toLocaleString()}商品`
                    : "セット判定マスター未登録"}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {masterStatus?.lastImport
                    ? `セット ${masterStatus.setItemCount.toLocaleString()}件 / 単品 ${masterStatus.physicalItemCount.toLocaleString()}件 / ${formatDateTime(masterStatus.lastImport.imported_at)}更新`
                    : "助ネコの商品基本情報CSVが必要です"}
                </div>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-9 shrink-0 gap-1.5"
              onClick={() => setMasterDialogOpen(true)}
            >
              <Upload className="h-3.5 w-3.5" />
              {masterStatus?.masterCount ? "更新" : "登録"}
            </Button>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label
              htmlFor="sukeneko-inventory"
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                selectFile(event.dataTransfer.files?.[0] || null);
              }}
              className={`flex min-h-24 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md border-2 border-dashed px-4 py-3 transition-colors ${
                dragging
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-white"
              }`}
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-white text-slate-500 shadow-sm">
                <FileSpreadsheet className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">
                  {file ? file.name : "助ネコ在庫CSVをドロップ"}
                </span>
                <span className="mt-1 block text-xs text-slate-500">Shift_JIS・UTF-8対応</span>
              </span>
              <input
                ref={fileInputRef}
                id="sukeneko-inventory"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => selectFile(event.target.files?.[0] || null)}
              />
            </label>
            <Button
              className="h-12 shrink-0 gap-2 bg-emerald-600 px-5 hover:bg-emerald-700 lg:h-16"
              onClick={importCsv}
              disabled={!file || importing || !masterStatus?.masterCount}
            >
              {importing
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Upload className="h-4 w-4" />}
              在庫を計算
            </Button>
          </div>
          <div className="mt-3 flex flex-col gap-1 border-t border-slate-100 pt-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>助ネコのセット商品フラグを除外し、単品在庫だけを棚卸し数に採用</span>
            {inventory?.imported_at && (
              <span className="shrink-0">
                最終取込 {formatDateTime(inventory.imported_at)}
                {inventory.source_file_name ? ` / ${inventory.source_file_name}` : ""}
              </span>
            )}
          </div>
        </section>

        {inventory ? (
          <>
            <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 shadow-sm md:grid-cols-4">
              <SummaryValue
                label="単品在庫"
                value={`${items.filter((item) => !item.is_manual).length.toLocaleString()}品目`}
                sub={`CSV ${inventory.source_row_count.toLocaleString()}行 / セット ${inventory.set_row_count.toLocaleString()}件除外`}
              />
              <SummaryValue
                label="確定原価合計"
                value={formatYen(confirmedValue)}
                sub="確認済み・税別7掛"
              />
              <SummaryValue
                label="要確認込み原価"
                value={formatYen(provisionalValue)}
                sub="除外品を含まない・税別"
              />
              <SummaryValue
                label="要確認"
                value={`${reviewCount.toLocaleString()}品目`}
                sub={missingPriceCount ? `価格なし ${missingPriceCount.toLocaleString()}品目` : "価格取得済み"}
                tone={reviewCount ? "amber" : "green"}
              />
            </section>

            <section className="sticky top-[65px] z-20 space-y-2 border-y border-slate-200 bg-slate-100 py-2">
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="商品名を検索"
                    className="h-11 bg-white pl-9"
                  />
                </div>
                <Button
                  className="h-11 shrink-0 gap-1.5 bg-slate-900 px-3 hover:bg-slate-800"
                  onClick={() => setManualDialogOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">商品追加</span>
                </Button>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                <FilterButton active={filter === "all"} label="すべて" count={items.length} onClick={() => setFilter("all")} />
                <FilterButton active={filter === "needs_review"} label="要確認" count={reviewCount} onClick={() => setFilter("needs_review")} />
                <FilterButton
                  active={filter === "confirmed"}
                  label="確定"
                  count={items.filter((item) => item.review_status === "confirmed").length}
                  onClick={() => setFilter("confirmed")}
                />
                <FilterButton
                  active={filter === "excluded"}
                  label="除外"
                  count={items.filter((item) => item.review_status === "excluded").length}
                  onClick={() => setFilter("excluded")}
                />
                {missingPriceCount > 0 && (
                  <FilterButton
                    active={filter === "missing_price"}
                    label="価格なし"
                    count={missingPriceCount}
                    onClick={() => setFilter("missing_price")}
                  />
                )}
                {histories.length > 1 && (
                  <select
                    aria-label="決算年度"
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
                <Button
                  variant="outline"
                  className="h-12 w-full bg-white"
                  onClick={() => setVisibleCount((count) => count + 80)}
                >
                  さらに表示（残り{(filteredItems.length - visibleCount).toLocaleString()}品目）
                </Button>
              )}
            </div>
          </>
        ) : (
          <section className="grid min-h-[360px] place-items-center rounded-lg border border-slate-200 bg-white px-6 text-center shadow-sm">
            <div>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-slate-900 text-white">
                <PackagePlus className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-lg font-bold">年度棚卸しを作成してください</h2>
              <p className="mt-2 text-sm text-slate-500">年度を作成後、助ネコ在庫CSVを読み込みます。</p>
              <Button
                className="mt-5 h-11 gap-2 bg-slate-900 px-5 hover:bg-slate-800"
                onClick={() => setCreateDialogOpen(true)}
              >
                <CalendarRange className="h-4 w-4" />
                年度を選択
              </Button>
            </div>
          </section>
        )}
      </main>

      <Dialog open={masterDialogOpen} onOpenChange={setMasterDialogOpen}>
        <DialogContent className="w-[calc(100%-24px)] max-w-lg rounded-lg">
          <DialogHeader>
            <DialogTitle>セット判定マスターを更新</DialogTitle>
            <DialogDescription>
              助ネコの商品基本情報CSVから、実在庫と派生するセット在庫を判別します。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="border-l-2 border-emerald-500 pl-3 text-sm leading-6 text-slate-700">
              商品マスター → 商品登録CSV → 「セット商品を含める」をON
              → CSVダウンロード
            </div>
            <label
              htmlFor="sukeneko-product-master"
              className="flex min-h-24 cursor-pointer items-center gap-3 rounded-md border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-3 hover:border-slate-400 hover:bg-white"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-white text-slate-500 shadow-sm">
                <FileSpreadsheet className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">
                  {masterFile ? masterFile.name : "商品基本情報CSVを選択"}
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  ファイル名の例: item_basic_YYYYMMDD.csv
                </span>
              </span>
              <input
                ref={masterFileInputRef}
                id="sukeneko-product-master"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] || null;
                  if (nextFile && !nextFile.name.toLowerCase().endsWith(".csv")) {
                    toast.error("CSVファイルを選択してください");
                    return;
                  }
                  setMasterFile(nextFile);
                }}
              />
            </label>
            {masterStatus?.lastImport && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>現在: {masterStatus.lastImport.file_name}</span>
                <span>
                  {masterStatus.masterCount.toLocaleString()}商品 /
                  セット {masterStatus.setItemCount.toLocaleString()}件
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMasterDialogOpen(false)}
              disabled={importingMaster}
            >
              キャンセル
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={importMaster}
              disabled={!masterFile || importingMaster}
            >
              {importingMaster
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Upload className="mr-2 h-4 w-4" />}
              マスターを更新
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="w-[calc(100%-24px)] max-w-md rounded-lg">
          <DialogHeader>
            <DialogTitle>決算年度を選択</DialogTitle>
            <DialogDescription>
              保存済み年度は既存の棚卸しを開きます。
            </DialogDescription>
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
            <Button
              className="bg-slate-900 hover:bg-slate-800"
              onClick={createInventory}
              disabled={creating}
            >
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              この年度を開く
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
        <DialogContent className="w-[calc(100%-24px)] max-w-md rounded-lg">
          <DialogHeader>
            <DialogTitle>棚卸し商品を追加</DialogTitle>
            <DialogDescription>
              助ネコに登録されていない商品を追加します。原価は税別販売価格の7掛です。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FieldLabel label="商品名">
              <Input value={manualName} onChange={(event) => setManualName(event.target.value)} className="h-11" autoFocus />
            </FieldLabel>
            <div className="grid grid-cols-2 gap-3">
              <FieldLabel label="販売価格（税別）">
                <Input
                  value={manualRetailPrice}
                  onChange={(event) => setManualRetailPrice(event.target.value)}
                  className="h-11 text-right"
                  inputMode="decimal"
                  type="number"
                  min="0"
                />
              </FieldLabel>
              <FieldLabel label="在庫数">
                <Input
                  value={manualQuantity}
                  onChange={(event) => setManualQuantity(event.target.value)}
                  className="h-11 text-right"
                  inputMode="decimal"
                  type="number"
                  min="0"
                />
              </FieldLabel>
            </div>
            <TaxRateSelector value={manualTaxRate} onChange={setManualTaxRate} />
            <div className="space-y-1 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">販売価格（税込）</span>
                <span>{formatYen(retailPriceInclTaxFromExcluded(manualRetailPrice, manualTaxRate))}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">原価（税別・7掛）</span>
                <span className="text-emerald-700">{formatYen(wholesaleInventoryPrice(manualRetailPrice, manualTaxRate))}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDialogOpen(false)}>キャンセル</Button>
            <Button
              className="bg-slate-900 hover:bg-slate-800"
              onClick={addManualItem}
              disabled={addingManual || !manualName.trim() || nullableNumber(manualRetailPrice) === null}
            >
              {addingManual && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              追加
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
  const [editOpen, setEditOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(item.product_name);
  const [priceDraft, setPriceDraft] = useState(
    item.retail_price_excl_tax === null ? "" : String(item.retail_price_excl_tax),
  );
  const [taxDraft, setTaxDraft] = useState<WholesaleInventoryTaxRate>(item.tax_rate);
  const stockValue = item.wholesale_price === null || item.quantity === null
    ? null
    : Math.round(inventoryScaledValue(item.wholesale_price, item.quantity) / 100_000);

  const openEditor = () => {
    setNameDraft(item.product_name);
    setPriceDraft(item.retail_price_excl_tax === null ? "" : String(item.retail_price_excl_tax));
    setTaxDraft(item.tax_rate);
    setEditOpen(true);
  };

  const saveProduct = () => {
    const retailPrice = nullableNumber(priceDraft);
    if (!nameDraft.trim() || retailPrice === null) return;
    onSave({
      productName: nameDraft.trim(),
      retailPrice,
      taxRate: taxDraft,
    });
    setEditOpen(false);
  };

  const setStatus = (reviewStatus: InventoryItem["review_status"]) => {
    onChange({ review_status: reviewStatus });
    onSave({ reviewStatus });
  };

  return (
    <article className={`rounded-lg border bg-white p-3 shadow-sm ${
      item.review_status === "needs_review"
        ? "border-amber-300"
        : item.review_status === "excluded"
          ? "border-slate-200 opacity-65"
          : "border-slate-200"
    }`}>
      <div className="grid gap-3 lg:grid-cols-[minmax(280px,1.5fr)_170px_145px_180px_minmax(180px,1fr)] lg:items-start">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 break-words text-[15px] font-bold leading-6">{item.product_name}</h2>
            <div className="flex shrink-0 items-center gap-0.5">
              {saveState === "saving" && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin text-slate-400" />}
              {saveState === "saved" && <Check className="mr-1 h-3.5 w-3.5 text-emerald-600" />}
              {saveState === "error" && <span className="mr-1 text-[10px] font-bold text-red-600">未保存</span>}
              <Button size="icon" variant="ghost" className="h-8 w-8" title="商品名・価格を修正" onClick={openEditor}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                title="リストから削除"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <StatusBadge status={item.review_status} />
            <Badge variant="outline" className="rounded-md text-[10px]">{methodLabel(item.calculation_method)}</Badge>
            <Badge variant="outline" className="rounded-md text-[10px]">{item.price_source || "価格なし"}</Badge>
            {item.price_is_manual && <Badge variant="outline" className="rounded-md text-[10px]">価格修正済み</Badge>}
          </div>
          {item.review_reason && item.review_status === "needs_review" && (
            <p className="mt-2 text-xs leading-5 text-amber-800">{item.review_reason}</p>
          )}
        </div>

        <div>
          <span className="mb-1 block text-xs font-semibold text-slate-500">販売価格</span>
          <div className="grid min-h-11 grid-cols-[auto_1fr] items-center gap-x-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-xs tabular-nums">
            <span className="text-slate-500">税別</span>
            <span className="text-right font-semibold">{formatYen(item.retail_price_excl_tax)}</span>
            <span className="text-slate-500">税込</span>
            <span className="text-right font-bold">{formatYen(retailPriceInclTaxFromExcluded(item.retail_price_excl_tax, item.tax_rate))}</span>
          </div>
        </div>

        <div>
          <span className="mb-1 block text-xs font-semibold text-slate-500">原価（税別・7掛）</span>
          <div className="flex min-h-11 items-center justify-end rounded-md border border-slate-200 bg-slate-50 px-3 font-bold tabular-nums text-emerald-700">
            {formatYen(item.wholesale_price)}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">
            在庫数
            {stockValue !== null && <span className="font-normal text-emerald-700">{formatYen(stockValue)}</span>}
          </span>
          <Input
            value={item.quantity ?? ""}
            onChange={(event) => onChange({ quantity: nullableNumber(event.target.value) })}
            onBlur={(event) => onSave({ quantity: nullableNumber(event.currentTarget.value) })}
            className="h-11 text-right text-lg font-semibold tabular-nums"
            inputMode="decimal"
            type="number"
            min="0"
            step="1"
          />
        </label>

        <label className="block">
          <span className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">
            備考
            <span>{item.tax_rate}%</span>
          </span>
          <Textarea
            value={item.note}
            onChange={(event) => onChange({ note: event.target.value })}
            onBlur={(event) => onSave({ note: event.currentTarget.value })}
            className="min-h-11 resize-none text-sm"
            rows={1}
            placeholder="備考"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <details className="group min-w-0 text-xs text-slate-500">
          <summary className="flex cursor-pointer list-none items-center gap-1 font-semibold hover:text-slate-800">
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            算定根拠 {item.source_rows.length.toLocaleString()}件
          </summary>
          <div className="mt-2 max-h-44 space-y-1 overflow-auto rounded-md bg-slate-50 p-2">
            {item.source_rows.length ? item.source_rows.map((source, index) => (
              <div
                key={`${source.rowNumber || index}-${source.sourceCode || ""}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-200 py-1 last:border-0"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-700">{source.productName || "商品名なし"}</div>
                  <div className="truncate text-[10px]">
                    {source.matchedRecipeName ? `レシピ: ${source.matchedRecipeName}` : source.sourceCode || "コードなし"}
                  </div>
                </div>
                <div className="text-right tabular-nums">
                  <div>{formatQuantity(source.stock)} × {formatQuantity(source.multiplier ?? 1)}</div>
                  <div className="text-[10px] font-semibold text-emerald-700">
                    換算 {formatQuantity(source.convertedQuantity)}
                  </div>
                </div>
              </div>
            )) : (
              <div className="py-2 text-center">手動登録</div>
            )}
          </div>
        </details>

        <div className="flex shrink-0 items-center justify-end gap-1.5">
          {item.review_status === "needs_review" && (
            <Button
              size="sm"
              className="h-9 gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setStatus("confirmed")}
            >
              <CheckCircle2 className="h-4 w-4" />
              確認済みにする
            </Button>
          )}
          {item.review_status === "confirmed" && (
            <Button
              size="sm"
              variant="outline"
              className="h-9 gap-1.5 text-emerald-700"
              onClick={() => setStatus("needs_review")}
            >
              <CheckCircle2 className="h-4 w-4" />
              確認済み
            </Button>
          )}
          {item.review_status !== "excluded" ? (
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9"
              title="棚卸し集計から除外"
              onClick={() => setStatus("excluded")}
            >
              <CircleOff className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={() => setStatus("needs_review")}
            >
              集計へ戻す
            </Button>
          )}
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="w-[calc(100%-24px)] max-w-md rounded-lg">
          <DialogHeader>
            <DialogTitle>商品と価格を修正</DialogTitle>
            <DialogDescription>
              原価は税別販売価格の7掛で再計算します。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FieldLabel label="商品名">
              <Input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} className="h-11" />
            </FieldLabel>
            <FieldLabel label="販売価格（税別）">
              <Input
                value={priceDraft}
                onChange={(event) => setPriceDraft(event.target.value)}
                className="h-11 text-right"
                inputMode="decimal"
                type="number"
                min="0"
              />
            </FieldLabel>
            <TaxRateSelector value={taxDraft} onChange={setTaxDraft} />
            <div className="space-y-1 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">販売価格（税込）</span>
                <span>{formatYen(retailPriceInclTaxFromExcluded(priceDraft, taxDraft))}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">原価（税別・7掛）</span>
                <span className="text-emerald-700">{formatYen(wholesaleInventoryPrice(priceDraft, taxDraft))}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>キャンセル</Button>
            <Button
              className="bg-slate-900 hover:bg-slate-800"
              onClick={saveProduct}
              disabled={!nameDraft.trim() || nullableNumber(priceDraft) === null}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function SummaryValue({
  label,
  value,
  sub,
  tone = "slate",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "slate" | "amber" | "green";
}) {
  const toneClass = tone === "amber"
    ? "text-amber-700"
    : tone === "green"
      ? "text-emerald-700"
      : "text-slate-950";
  return (
    <div className="min-w-0 bg-white px-3 py-3 md:px-4">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={`mt-1 break-words text-lg font-bold tabular-nums md:text-xl ${toneClass}`}>{value}</div>
      <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}

function FilterButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 shrink-0 rounded-md border px-3 text-xs font-bold ${
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label} <span className={active ? "text-slate-300" : "text-slate-400"}>{count}</span>
    </button>
  );
}

function StatusBadge({ status }: { status: InventoryItem["review_status"] }) {
  if (status === "confirmed") {
    return <Badge className="rounded-md bg-emerald-100 text-[10px] text-emerald-800 hover:bg-emerald-100">確定</Badge>;
  }
  if (status === "excluded") {
    return <Badge variant="outline" className="rounded-md text-[10px] text-slate-500">除外</Badge>;
  }
  return <Badge className="rounded-md bg-amber-100 text-[10px] text-amber-900 hover:bg-amber-100">要確認</Badge>;
}

function TaxRateSelector({
  value,
  onChange,
}: {
  value: WholesaleInventoryTaxRate;
  onChange: (value: WholesaleInventoryTaxRate) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold">税率</legend>
      <div className="mt-1 grid grid-cols-2 rounded-md border border-slate-200 bg-slate-100 p-1">
        {[8, 10].map((rate) => (
          <button
            key={rate}
            type="button"
            onClick={() => onChange(rate as WholesaleInventoryTaxRate)}
            className={`h-9 rounded-md text-sm font-bold ${
              value === rate ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
            }`}
          >
            {rate}%
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function normalizeItem(value: any): InventoryItem {
  return {
    ...value,
    retail_price_excl_tax: nullableNumber(value.retail_price_excl_tax),
    wholesale_price: nullableNumber(value.wholesale_price),
    tax_rate: normalizeWholesaleInventoryTaxRate(value.tax_rate),
    quantity: nullableNumber(value.quantity),
    source_rows: Array.isArray(value.source_rows) ? value.source_rows : [],
  };
}

function inventoryValue(items: InventoryItem[]) {
  const scaledTotal = items.reduce((sum, item) => (
    sum + inventoryScaledValue(item.wholesale_price || 0, item.quantity || 0)
  ), 0);
  return scaledTotal / 100_000;
}

function inventoryScaledValue(wholesalePrice: number, quantity: number) {
  const priceInCents = Math.round(wholesalePrice * 100);
  const quantityInThousandths = Math.round(quantity * 1000);
  return priceInCents * quantityInThousandths;
}

function methodLabel(method: InventoryItem["calculation_method"]) {
  return {
    direct: "単品在庫",
    shared_stock: "共有在庫統合",
    bundle_derived: "セット換算",
    listing_deduplicated: "重複掲載統合",
    unmatched: "未照合",
    manual: "手動",
  }[method];
}

function formatYen(value: unknown) {
  const number = nullableNumber(value);
  return number === null
    ? "未設定"
    : `¥${Math.round(number).toLocaleString("ja-JP")}`;
}

function formatQuantity(value: unknown) {
  const number = nullableNumber(value);
  if (number === null) return "-";
  return Number.isInteger(number)
    ? number.toLocaleString("ja-JP")
    : number.toLocaleString("ja-JP", { maximumFractionDigits: 3 });
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

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizeSearch(value: string) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ja-JP");
}
