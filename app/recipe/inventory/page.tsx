"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Apple,
  ArrowLeft,
  Box,
  CalendarRange,
  Check,
  Download,
  Loader2,
  PackagePlus,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ManufacturingInventoryQrCode } from "@/components/recipe/ManufacturingInventoryQrCode";
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

type ItemType = "ingredient" | "material";
type ItemFilter = "incomplete" | "completed" | "all";
type SaveState = "editing" | "saving" | "saved" | "error";

type InventorySession = {
  id: string;
  fiscal_year: number;
  inventory_date: string;
  status: "draft" | "completed";
  created_at: string;
};

type InventoryItem = {
  id: string;
  inventory_id: string;
  item_type: ItemType;
  source_id: string | null;
  item_name: string;
  source_unit_text: string | null;
  source_unit_quantity: number | null;
  source_tax_included_cost: number | null;
  base_unit_quantity: number | null;
  unit_quantity: number | null;
  base_tax_included_cost: number | null;
  tax_included_cost: number | null;
  stock_count: number | null;
  note: string;
  sort_order: number;
  is_manual: boolean;
};

export default function ManufacturingInventoryPage() {
  const [inventory, setInventory] = useState<InventorySession | null>(null);
  const [histories, setHistories] = useState<InventorySession[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedFiscalYear, setSelectedFiscalYear] = useState(currentInventoryFiscalYear());
  const [syncing, setSyncing] = useState(false);
  const [activeType, setActiveType] = useState<ItemType>("ingredient");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ItemFilter>("incomplete");
  const [visibleCount, setVisibleCount] = useState(80);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [editingCompletion, setEditingCompletion] = useState<Record<string, boolean>>({});
  const editRevisionRef = useRef<Record<string, number>>({});
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualUnitQuantity, setManualUnitQuantity] = useState("");
  const [manualCost, setManualCost] = useState("");
  const [addingManual, setAddingManual] = useState(false);

  useEffect(() => {
    loadInventory();
  }, []);

  useEffect(() => {
    setVisibleCount(80);
  }, [activeType, search, filter]);

  const activeItems = useMemo(() => items.filter((item) => item.item_type === activeType), [items, activeType]);
  const completedCount = useMemo(
    () => activeItems.filter((item) => isCompletedForView(item, saveStates[item.id], editingCompletion[item.id])).length,
    [activeItems, editingCompletion, saveStates],
  );
  const inventoryValue = useMemo(
    () => activeItems.reduce((sum, item) => sum + (item.tax_included_cost ?? 0) * (item.stock_count ?? 0), 0),
    [activeItems],
  );
  const filteredItems = useMemo(() => {
    const keyword = normalizeSearch(search);
    return activeItems.filter((item) => {
      const completed = isCompletedForView(item, saveStates[item.id], editingCompletion[item.id]);
      const matchesFilter = filter === "all" || (filter === "completed" ? completed : !completed);
      const matchesSearch = !keyword || normalizeSearch(`${item.item_name} ${item.note}`).includes(keyword);
      return matchesFilter && matchesSearch;
    });
  }, [activeItems, editingCompletion, filter, search, saveStates]);
  const fiscalYearOptions = useMemo(
    () => inventoryFiscalYearOptions(histories.map((history) => history.fiscal_year)),
    [histories],
  );

  const loadInventory = async (id?: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/recipe/inventory${id ? `?id=${encodeURIComponent(id)}` : ""}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "製造棚卸し表の取得に失敗しました");
      let loadedItems = data.items || [];
      if (!id && data.inventory) {
        setSyncing(true);
        try {
          const syncData = await requestInventorySync(data.inventory.id);
          loadedItems = syncData.items || loadedItems;
        } catch (error: any) {
          toast.error(error.message || "材料DBとの同期に失敗しました");
        } finally {
          setSyncing(false);
        }
      }
      setInventory(data.inventory || null);
      setItems(loadedItems.map(normalizeItem));
      setHistories(data.histories || []);
      setSaveStates({});
      setEditingCompletion({});
      editRevisionRef.current = {};
    } catch (error: any) {
      toast.error(error.message || "製造棚卸し表の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const generateInventory = async () => {
    setGenerating(true);
    try {
      const response = await fetch("/api/recipe/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          inventoryDate: todayInJapan(),
          fiscalYear: selectedFiscalYear,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "製造棚卸し表の作成に失敗しました");
      setInventory(data.inventory);
      setItems((data.items || []).map(normalizeItem));
      setSaveStates({});
      setEditingCompletion({});
      editRevisionRef.current = {};
      setFilter("incomplete");
      setCreateDialogOpen(false);
      await refreshHistories(data.inventory.id);
      toast.success(data.existing
        ? `${selectedFiscalYear}年度の保存済み棚卸し表を開きました`
        : `${selectedFiscalYear}年度を食材・資材 ${Number(data.generatedCount || 0).toLocaleString()}件で作成しました`);
    } catch (error: any) {
      toast.error(error.message || "製造棚卸し表の作成に失敗しました");
    } finally {
      setGenerating(false);
    }
  };

  const openCreateDialog = () => {
    setSelectedFiscalYear(currentInventoryFiscalYear());
    setCreateDialogOpen(true);
  };

  const refreshHistories = async (selectedId: string) => {
    const response = await fetch(`/api/recipe/inventory?id=${encodeURIComponent(selectedId)}`, { cache: "no-store" });
    const data = await response.json();
    if (response.ok && data.success) setHistories(data.histories || []);
  };

  const syncCurrentInventory = async () => {
    if (!inventory) return;
    setSyncing(true);
    try {
      const data = await requestInventorySync(inventory.id);
      setItems((data.items || []).map(normalizeItem));
      setSaveStates({});
      setEditingCompletion({});
      editRevisionRef.current = {};
      toast.success(data.updatedCount > 0
        ? `材料DBの変更を${Number(data.updatedCount).toLocaleString()}件反映しました`
        : "材料DBの最新状態です");
    } catch (error: any) {
      toast.error(error.message || "材料DBとの同期に失敗しました");
    } finally {
      setSyncing(false);
    }
  };

  const updateItemLocal = (id: string, updates: Partial<InventoryItem>, markEditing = false) => {
    if (markEditing) {
      const itemBeforeEdit = items.find((item) => item.id === id);
      if (itemBeforeEdit) {
        setEditingCompletion((current) => Object.prototype.hasOwnProperty.call(current, id)
          ? current
          : { ...current, [id]: hasRequiredInventoryValues(itemBeforeEdit) });
      }
      editRevisionRef.current[id] = (editRevisionRef.current[id] || 0) + 1;
    }
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...updates } : item)));
    if (markEditing) setSaveStates((current) => ({ ...current, [id]: "editing" }));
  };

  const saveItem = async (id: string, updates: Record<string, unknown>) => {
    const saveRevision = editRevisionRef.current[id] || 0;
    setSaveStates((current) => ({ ...current, [id]: "saving" }));
    try {
      const response = await fetch("/api/recipe/inventory/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "保存に失敗しました");
      if ((editRevisionRef.current[id] || 0) !== saveRevision) return;
      const savedItem = normalizeItem(data.item);
      const savedFields: Partial<InventoryItem> = {};
      if (Object.prototype.hasOwnProperty.call(updates, "itemName")) savedFields.item_name = savedItem.item_name;
      if (Object.prototype.hasOwnProperty.call(updates, "unitQuantity")) {
        savedFields.unit_quantity = savedItem.unit_quantity;
        savedFields.tax_included_cost = savedItem.tax_included_cost;
      }
      if (Object.prototype.hasOwnProperty.call(updates, "taxIncludedCost")) {
        savedFields.tax_included_cost = savedItem.tax_included_cost;
        savedFields.base_tax_included_cost = savedItem.base_tax_included_cost;
        savedFields.base_unit_quantity = savedItem.base_unit_quantity;
      }
      if (Object.prototype.hasOwnProperty.call(updates, "stockCount")) savedFields.stock_count = savedItem.stock_count;
      if (Object.prototype.hasOwnProperty.call(updates, "note")) savedFields.note = savedItem.note;
      updateItemLocal(id, savedFields);
      setSaveStates((current) => ({ ...current, [id]: "saved" }));
      setEditingCompletion((current) => {
        if (!Object.prototype.hasOwnProperty.call(current, id)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
    } catch (error: any) {
      if ((editRevisionRef.current[id] || 0) !== saveRevision) return;
      setSaveStates((current) => ({ ...current, [id]: "error" }));
      toast.error(error.message || "保存に失敗しました");
    }
  };

  const addManualItem = async () => {
    if (!inventory || !manualName.trim()) {
      toast.error("品名を入力してください");
      return;
    }
    setAddingManual(true);
    try {
      const response = await fetch("/api/recipe/inventory/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryId: inventory.id,
          itemType: activeType,
          itemName: manualName,
          unitQuantity: manualUnitQuantity === "" ? null : Number(manualUnitQuantity),
          taxIncludedCost: manualCost === "" ? null : Number(manualCost),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "品目の追加に失敗しました");
      setItems((current) => [normalizeItem(data.item), ...current]);
      setManualName("");
      setManualUnitQuantity("");
      setManualCost("");
      setManualDialogOpen(false);
      setFilter("incomplete");
      toast.success("品目を追加しました");
    } catch (error: any) {
      toast.error(error.message || "品目の追加に失敗しました");
    } finally {
      setAddingManual(false);
    }
  };

  const deleteItem = async (item: InventoryItem) => {
    if (!confirm(`${item.item_name} を棚卸し表から削除しますか？`)) return;
    try {
      const response = await fetch("/api/recipe/inventory/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "削除に失敗しました");
      setItems((current) => current.filter((row) => row.id !== item.id));
      toast.success("品目を削除しました");
    } catch (error: any) {
      toast.error(error.message || "削除に失敗しました");
    }
  };

  const downloadCsv = () => {
    if (!inventory) return;
    const rows = [
      ["区分", "品名", "入数", "税込単価（原価）", "個数", "棚卸原価", "備考"],
      ...items.map((item) => [
        item.item_type === "ingredient" ? "食材" : "資材",
        item.item_name,
        item.unit_quantity ?? "",
        item.tax_included_cost ?? "",
        item.stock_count ?? "",
        item.tax_included_cost !== null && item.stock_count !== null ? roundCost(item.tax_included_cost * item.stock_count) : "",
        item.note,
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `製造棚卸し_${inventory.fiscal_year}年度_${inventory.inventory_date}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm font-semibold text-slate-500">棚卸し表を読み込み中</div>;
  }

  const ingredientCount = items.filter((item) => item.item_type === "ingredient").length;
  const materialCount = items.filter((item) => item.item_type === "material").length;
  const isLatestInventory = Boolean(inventory && histories[0]?.id === inventory.id);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <a href="/recipe/database" className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-slate-600 hover:bg-slate-100" title="材料データベースへ戻る">
              <ArrowLeft className="h-5 w-5" />
            </a>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold md:text-2xl">製造棚卸し</h1>
              <div className="truncate text-[11px] text-slate-500 md:text-xs">
                {inventory ? `${inventory.fiscal_year}年度 / 食材・資材` : "レシピシステム"}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <ManufacturingInventoryQrCode className="h-16 w-16 sm:h-20 sm:w-20" />
            {inventory && (
              <Button size="icon" variant="outline" className="h-10 w-10" title="CSV出力" onClick={downloadCsv}>
                <Download className="h-4 w-4" />
              </Button>
            )}
            <Button className="h-10 bg-slate-900 px-3 hover:bg-slate-800" disabled={generating} onClick={openCreateDialog}>
              <CalendarRange className="h-4 w-4" />
              <span className="ml-1.5 hidden sm:inline">年度表作成</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 md:px-6 md:py-6">
        {!inventory ? (
          <div className="mx-auto mt-16 max-w-md text-center">
            <PackagePlus className="mx-auto h-10 w-10 text-slate-400" />
            <h2 className="mt-4 text-lg font-bold">製造棚卸し表がありません</h2>
            <p className="mt-1 text-sm text-slate-500">材料データベースの食材と資材から作成します。</p>
            <Button className="mt-5 bg-slate-900 hover:bg-slate-800" disabled={generating} onClick={openCreateDialog}>
              <CalendarRange className="mr-2 h-4 w-4" />
              年度を選んで作成
            </Button>
          </div>
        ) : (
          <>
            {histories.length > 1 && (
              <div className="mb-3 flex justify-end">
                <select
                  className="h-9 max-w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  value={inventory.id}
                  onChange={(event) => loadInventory(event.target.value)}
                  aria-label="棚卸し履歴"
                >
                  {histories.map((history) => (
                    <option key={history.id} value={history.id}>{history.fiscal_year}年度</option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-white py-3 shadow-sm">
              <SummaryValue label="入力済み" value={`${completedCount.toLocaleString()}/${activeItems.length.toLocaleString()}`} />
              <SummaryValue label="棚卸原価" value={formatYen(inventoryValue)} />
              <SummaryValue label="登録品目" value={`${activeItems.length.toLocaleString()}件`} />
            </div>

            <div className="mt-3 flex gap-2 border-b border-slate-200">
              <TypeTab active={activeType === "ingredient"} label="食材" count={ingredientCount} icon={<Apple className="h-4 w-4" />} onClick={() => setActiveType("ingredient")} />
              <TypeTab active={activeType === "material"} label="資材" count={materialCount} icon={<Box className="h-4 w-4" />} onClick={() => setActiveType("material")} />
            </div>

            <div className="sticky top-[89px] z-20 -mx-3 border-b border-slate-200 bg-slate-100/95 px-3 py-3 backdrop-blur md:top-[105px] md:mx-0 md:px-0">
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} className="h-12 bg-white pl-9" placeholder="品名を検索" />
                </div>
                {isLatestInventory && (
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-12 w-12 shrink-0 bg-white"
                    title="材料DBの最新入数・原価を反映"
                    aria-label="材料DBの最新入数・原価を反映"
                    disabled={syncing}
                    onClick={syncCurrentInventory}
                  >
                    <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                  </Button>
                )}
                <Button className="h-12 shrink-0 bg-emerald-600 px-3 hover:bg-emerald-700" onClick={() => setManualDialogOpen(true)}>
                  <Plus className="mr-1 h-4 w-4" />品目追加
                </Button>
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5">
                <FilterButton active={filter === "incomplete"} label="未入力" count={activeItems.length - completedCount} onClick={() => setFilter("incomplete")} />
                <FilterButton active={filter === "completed"} label="入力済み" count={completedCount} onClick={() => setFilter("completed")} />
                <FilterButton active={filter === "all"} label="すべて" count={activeItems.length} onClick={() => setFilter("all")} />
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {filteredItems.slice(0, visibleCount).map((item) => (
                <ManufacturingItemCard
                  key={item.id}
                  item={item}
                  saveState={saveStates[item.id]}
                  onChange={(updates) => updateItemLocal(item.id, updates, true)}
                  onSave={(updates) => saveItem(item.id, updates)}
                  onDelete={() => deleteItem(item)}
                />
              ))}
              {!filteredItems.length && <div className="py-16 text-center text-sm text-slate-500">該当する品目はありません</div>}
              {filteredItems.length > visibleCount && (
                <Button variant="outline" className="h-12 w-full bg-white" onClick={() => setVisibleCount((count) => count + 80)}>
                  さらに表示（残り{(filteredItems.length - visibleCount).toLocaleString()}件）
                </Button>
              )}
            </div>
          </>
        )}
      </main>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>決算年度を選択</DialogTitle>
            <DialogDescription>材料DBの食材・資材から、選択年度の棚卸し表を作成します。保存済みの年度は、その表を開きます。</DialogDescription>
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
            <Button className="bg-slate-900 hover:bg-slate-800" disabled={generating} onClick={generateInventory}>
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarRange className="mr-2 h-4 w-4" />}
              この年度を開く
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{activeType === "ingredient" ? "食材" : "資材"}を追加</DialogTitle>
            <DialogDescription>材料データベースに未登録の品目を、この棚卸し表だけに追加します。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block text-sm font-semibold">品名<Input className="mt-1" value={manualName} onChange={(event) => setManualName(event.target.value)} /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-semibold">入数<Input className="mt-1" type="number" min="0.001" step="any" inputMode="decimal" value={manualUnitQuantity} onChange={(event) => setManualUnitQuantity(event.target.value)} /></label>
              <label className="block text-sm font-semibold">税込原価<Input className="mt-1" type="number" min="0" step="any" inputMode="decimal" value={manualCost} onChange={(event) => setManualCost(event.target.value)} /></label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDialogOpen(false)}>キャンセル</Button>
            <Button className="bg-slate-900 hover:bg-slate-800" disabled={addingManual || !manualName.trim()} onClick={addManualItem}>
              {addingManual && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ManufacturingItemCard({ item, saveState, onChange, onSave, onDelete }: {
  item: InventoryItem;
  saveState?: SaveState;
  onChange: (updates: Partial<InventoryItem>) => void;
  onSave: (updates: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const stockValue = (item.tax_included_cost ?? 0) * (item.stock_count ?? 0);
  const unitLabel = item.item_type === "ingredient" ? "入数 (g)" : "入数";
  const changeUnitQuantity = (value: string) => {
    const unitQuantity = nullablePositiveNumber(value);
    const adjustedCost = unitQuantity !== null && item.base_unit_quantity && item.base_tax_included_cost !== null
      ? roundCost(item.base_tax_included_cost * unitQuantity / item.base_unit_quantity)
      : item.tax_included_cost;
    onChange({ unit_quantity: unitQuantity, tax_included_cost: adjustedCost });
  };

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:grid md:grid-cols-[minmax(240px,1.5fr)_130px_150px_110px_minmax(200px,1fr)] md:items-start md:gap-3">
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          {item.is_manual ? (
            <Input value={item.item_name} onChange={(event) => onChange({ item_name: event.target.value })} onBlur={(event) => onSave({ itemName: event.currentTarget.value })} className="h-10 font-semibold" />
          ) : (
            <h2 className="min-w-0 break-words text-[15px] font-bold leading-6">{item.item_name}</h2>
          )}
          <div className="flex shrink-0 items-center gap-1">
            {item.is_manual && <Badge variant="outline" className="rounded-md text-[10px]">手動</Badge>}
            {saveState === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
            {saveState === "saved" && <Check className="h-3.5 w-3.5 text-emerald-600" />}
            {saveState === "error" && <span className="text-xs font-bold text-red-600">未保存</span>}
            <Button size="icon" variant="ghost" title="リストから削除" aria-label={`${item.item_name}をリストから削除`} className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
          <span>{item.item_type === "ingredient" ? "食材" : "資材"}</span>
          {item.source_unit_text && <span>登録入数 {item.source_unit_text}</span>}
        </div>
      </div>

      <label className="mt-3 block md:mt-0">
        <span className="mb-1 block text-xs font-semibold text-slate-500">{unitLabel}</span>
        <Input
          value={item.unit_quantity ?? ""}
          onChange={(event) => changeUnitQuantity(event.target.value)}
          onBlur={(event) => onSave({ unitQuantity: nullablePositiveNumber(event.currentTarget.value) })}
          className="h-12 text-right text-base font-semibold"
          type="number"
          min="0.001"
          step="any"
          inputMode="decimal"
          placeholder="未入力"
        />
      </label>

      <label className="mt-3 block md:mt-0">
        <span className="mb-1 block text-xs font-semibold text-slate-500">税込単価（原価）</span>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">¥</span>
          <Input
            value={item.tax_included_cost ?? ""}
            onChange={(event) => onChange({ tax_included_cost: nullableNonNegativeNumber(event.target.value) })}
            onBlur={(event) => onSave({ taxIncludedCost: nullableNonNegativeNumber(event.currentTarget.value) })}
            className="h-12 pl-7 text-right text-base font-semibold"
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            placeholder="未入力"
          />
        </div>
      </label>

      <label className="mt-3 block md:mt-0">
        <span className="mb-1 block text-xs font-semibold text-slate-500">個数</span>
        <Input
          value={item.stock_count ?? ""}
          onChange={(event) => onChange({ stock_count: nullableNonNegativeNumber(event.target.value) })}
          onBlur={(event) => onSave({ stockCount: nullableNonNegativeNumber(event.currentTarget.value) })}
          className="h-12 text-right text-lg font-semibold"
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          placeholder="未入力"
        />
      </label>

      <div className="mt-3 md:mt-0">
        <label className="block">
          <span className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">
            備考<span className="font-normal text-emerald-700">棚卸原価 {formatYen(stockValue)}</span>
          </span>
          <Textarea value={item.note} onChange={(event) => onChange({ note: event.target.value })} onBlur={(event) => onSave({ note: event.currentTarget.value })} className="min-h-[48px] resize-none text-sm" rows={1} placeholder="備考" />
        </label>
      </div>
    </article>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 px-2 text-center md:px-4"><div className="truncate text-[11px] font-semibold text-slate-500 md:text-xs">{label}</div><div className="mt-1 truncate text-base font-bold tabular-nums md:text-xl">{value}</div></div>;
}

function TypeTab({ active, label, count, icon, onClick }: { active: boolean; label: string; count: number; icon: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex h-11 items-center gap-2 border-b-2 px-4 text-sm font-bold ${active ? "border-slate-900 text-slate-950" : "border-transparent text-slate-500"}`}>{icon}{label}<span className="text-xs opacity-60">{count.toLocaleString()}</span></button>;
}

function FilterButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`h-9 shrink-0 rounded-md border px-3 text-sm font-semibold ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"}`}>{label}<span className="ml-1.5 text-xs opacity-70">{count.toLocaleString()}</span></button>;
}

function normalizeItem(item: any): InventoryItem {
  return {
    ...item,
    base_unit_quantity: nullablePositiveNumber(item.base_unit_quantity),
    source_unit_quantity: nullablePositiveNumber(item.source_unit_quantity),
    source_tax_included_cost: nullableNonNegativeNumber(item.source_tax_included_cost),
    unit_quantity: nullablePositiveNumber(item.unit_quantity),
    base_tax_included_cost: nullableNonNegativeNumber(item.base_tax_included_cost),
    tax_included_cost: nullableNonNegativeNumber(item.tax_included_cost),
    stock_count: nullableNonNegativeNumber(item.stock_count),
    note: String(item.note || ""),
    is_manual: Boolean(item.is_manual),
  };
}

function isCompletedForView(item: InventoryItem, saveState?: SaveState, editingOrigin?: boolean) {
  if (editingOrigin !== undefined && (saveState === "editing" || saveState === "saving" || saveState === "error")) {
    return editingOrigin;
  }
  return hasRequiredInventoryValues(item);
}

function hasRequiredInventoryValues(item: InventoryItem) {
  return item.tax_included_cost !== null && item.stock_count !== null;
}

function nullablePositiveNumber(value: unknown): number | null {
  const number = nullableNonNegativeNumber(value);
  return number !== null && number > 0 ? number : null;
}

function nullableNonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function roundCost(value: number) {
  return Math.round(value * 1000) / 1000;
}

function formatYen(value: number) {
  if (!Number.isFinite(value)) return "-";
  return `¥${value.toLocaleString("ja-JP", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${year}/${month}/${day}`;
}

function normalizeSearch(value: string) {
  return value.normalize("NFKC").replace(/[\s\u3000]+/g, "").toLocaleLowerCase("ja-JP");
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function requestInventorySync(inventoryId: string) {
  const response = await fetch("/api/recipe/inventory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "sync", inventoryId }),
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || "材料DBとの同期に失敗しました");
  return data;
}

function todayInJapan() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
