"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Apple,
  ArrowLeft,
  Box,
  Link2,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ItemType = "food" | "material";

type DiningItem = {
  id: string;
  name: string;
  item_type: ItemType;
  purchase_quantity: number;
  yield_quantity: number;
  price_incl_tax: number;
  unit: string;
  notes: string | null;
  source_file: string | null;
  source_sheet: string | null;
  source_reference: string | null;
  linked_recipe_id: string | null;
  unit_cost: number;
};

const yen = (value: number, digits = 0) =>
  new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value || 0);

const emptyItem = (type: ItemType) => ({
  name: "",
  item_type: type,
  purchase_quantity: "",
  yield_quantity: "",
  price_incl_tax: "",
  unit: "g",
  notes: "",
});

export default function DiningDatabasePage() {
  const router = useRouter();
  const [items, setItems] = useState<DiningItem[]>([]);
  const [activeType, setActiveType] = useState<ItemType>("food");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [newItem, setNewItem] = useState(emptyItem("food"));

  const loadItems = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/recipe/dining/items", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "飲食用DBを取得できませんでした");
      setItems(data.items || []);
      setDirtyIds(new Set());
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  useEffect(() => {
    setNewItem((prev) => ({ ...prev, item_type: activeType }));
  }, [activeType]);

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return items.filter((item) => item.item_type === activeType && (!keyword || `${item.name} ${item.notes || ""}`.toLowerCase().includes(keyword)));
  }, [activeType, items, search]);

  const updateItem = (id: string, field: keyof DiningItem, value: string | number) => {
    setItems((current) => current.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, [field]: value };
      next.unit_cost = Number(next.yield_quantity) > 0 ? Number(next.price_incl_tax) / Number(next.yield_quantity) : 0;
      return next;
    }));
    setDirtyIds((current) => new Set(current).add(id));
  };

  const saveChanges = async () => {
    const targets = items.filter((item) => dirtyIds.has(item.id));
    if (targets.length === 0) {
      toast.info("変更はありません");
      return;
    }
    setSaving(true);
    try {
      const responses = await Promise.all(targets.map((item) => fetch("/api/recipe/dining/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          data: {
            name: item.name,
            item_type: item.item_type,
            purchase_quantity: item.purchase_quantity,
            yield_quantity: item.yield_quantity,
            price_incl_tax: item.price_incl_tax,
            unit: item.unit,
            notes: item.notes,
          },
        }),
      })));
      const failed = responses.find((response) => !response.ok);
      if (failed) {
        const data = await failed.json();
        throw new Error(data.error || "保存に失敗しました");
      }
      toast.success(`${targets.length}件を保存しました。メニュー原価にも反映済みです`);
      await loadItems();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const createItem = async () => {
    if (!newItem.name.trim()) {
      toast.error("名称を入力してください");
      return;
    }
    setCreating(true);
    try {
      const response = await fetch("/api/recipe/dining/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newItem,
          purchase_quantity: Number(newItem.purchase_quantity || 1),
          yield_quantity: Number(newItem.yield_quantity || 1),
          price_incl_tax: Number(newItem.price_incl_tax || 0),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "新規登録に失敗しました");
      toast.success(`${newItem.name}を登録しました`);
      setNewItem(emptyItem(activeType));
      setShowCreate(false);
      await loadItems();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  };

  const deleteItem = async (item: DiningItem) => {
    if (!confirm(`${item.name}を飲食用DBから削除しますか？`)) return;
    try {
      const response = await fetch(`/api/recipe/dining/items?id=${item.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "削除できませんでした");
      toast.success(`${item.name}を削除しました`);
      await loadItems();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const foodCount = items.filter((item) => item.item_type === "food").length;
  const materialCount = items.filter((item) => item.item_type === "material").length;

  return (
    <main className="mx-auto w-full max-w-[1700px] px-3 py-4 sm:px-6 sm:py-6">
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="outline" size="icon" onClick={() => router.push("/recipe/dining")} aria-label="メニューレシピへ戻る">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-950 sm:text-2xl">飲食用 食材・資材DB</h1>
            <p className="mt-1 text-sm text-gray-500">通常の製造用材料DBとは分離されています</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCreate((value) => !value)}><Plus className="mr-2 h-4 w-4" />新規登録</Button>
          <Button onClick={saveChanges} disabled={saving || dirtyIds.size === 0} className="bg-slate-900 hover:bg-slate-800">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            変更を保存{dirtyIds.size > 0 ? ` (${dirtyIds.size})` : ""}
          </Button>
        </div>
      </header>

      <section className="mb-4 flex overflow-x-auto border-b border-gray-300">
        <button type="button" onClick={() => setActiveType("food")} className={`-mb-px flex items-center gap-2 whitespace-nowrap rounded-t-lg border px-5 py-3 text-sm font-medium ${activeType === "food" ? "border-gray-300 bg-white text-gray-950" : "border-transparent bg-gray-100 text-gray-500"}`}>
          <Apple className="h-4 w-4" />食材 <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">{foodCount}</span>
        </button>
        <button type="button" onClick={() => setActiveType("material")} className={`-mb-px flex items-center gap-2 whitespace-nowrap rounded-t-lg border px-5 py-3 text-sm font-medium ${activeType === "material" ? "border-gray-300 bg-white text-gray-950" : "border-transparent bg-gray-100 text-gray-500"}`}>
          <Box className="h-4 w-4" />資材 <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800">{materialCount}</span>
        </button>
      </section>

      {showCreate && (
        <section className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h2 className="mb-3 font-semibold text-gray-950">{activeType === "food" ? "食材" : "資材"}を新規登録</h2>
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_130px_130px_150px_90px_minmax(180px,1fr)_auto]">
            <Input placeholder="名称" value={newItem.name} onChange={(event) => setNewItem((prev) => ({ ...prev, name: event.target.value }))} />
            <Input type="number" inputMode="decimal" placeholder="入数" value={newItem.purchase_quantity} onChange={(event) => setNewItem((prev) => ({ ...prev, purchase_quantity: event.target.value }))} />
            <Input type="number" inputMode="decimal" placeholder="出来高" value={newItem.yield_quantity} onChange={(event) => setNewItem((prev) => ({ ...prev, yield_quantity: event.target.value }))} />
            <Input type="number" inputMode="decimal" placeholder="税込価格" value={newItem.price_incl_tax} onChange={(event) => setNewItem((prev) => ({ ...prev, price_incl_tax: event.target.value }))} />
            <Input placeholder="単位" value={newItem.unit} onChange={(event) => setNewItem((prev) => ({ ...prev, unit: event.target.value }))} />
            <Input placeholder="備考" value={newItem.notes} onChange={(event) => setNewItem((prev) => ({ ...prev, notes: event.target.value }))} />
            <Button onClick={createItem} disabled={creating}><Plus className="mr-2 h-4 w-4" />登録</Button>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 p-4">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input className="pl-9" placeholder={`${activeType === "food" ? "食材" : "資材"}名を検索`} value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center text-gray-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />読み込み中</div>
        ) : filteredItems.length === 0 ? (
          <div className="min-h-48 p-10 text-center text-gray-500">登録データはありません</div>
        ) : (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <table className="min-w-[1320px] w-full table-fixed text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="w-[23%] px-4 py-3">名称</th>
                    <th className="w-[10%] px-4 py-3 text-right">入数</th>
                    <th className="w-[10%] px-4 py-3 text-right">出来高</th>
                    <th className="w-[8%] px-4 py-3">単位</th>
                    <th className="w-[12%] px-4 py-3 text-right">税込価格</th>
                    <th className="w-[13%] px-4 py-3 text-right">単価</th>
                    <th className="w-[18%] px-4 py-3">備考</th>
                    <th className="w-[6%] px-4 py-3 text-right">削除</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className={dirtyIds.has(item.id) ? "bg-amber-50" : ""}>
                      <td className="px-4 py-3">
                        <Input value={item.name} onChange={(event) => updateItem(item.id, "name", event.target.value)} />
                        {item.linked_recipe_id && (
                          <button type="button" onClick={() => router.push(`/recipe/${item.linked_recipe_id}`)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline">
                            <Link2 className="h-3 w-3" />中間部品連動
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3"><Input disabled={Boolean(item.linked_recipe_id)} className="text-right" type="number" inputMode="decimal" value={item.purchase_quantity} onChange={(event) => updateItem(item.id, "purchase_quantity", Number(event.target.value))} /></td>
                      <td className="px-4 py-3"><Input disabled={Boolean(item.linked_recipe_id)} className="text-right" type="number" inputMode="decimal" value={item.yield_quantity} onChange={(event) => updateItem(item.id, "yield_quantity", Number(event.target.value))} /></td>
                      <td className="px-4 py-3"><Input disabled={Boolean(item.linked_recipe_id)} value={item.unit} onChange={(event) => updateItem(item.id, "unit", event.target.value)} /></td>
                      <td className="px-4 py-3"><Input disabled={Boolean(item.linked_recipe_id)} className="text-right" type="number" inputMode="decimal" value={item.price_incl_tax} onChange={(event) => updateItem(item.id, "price_incl_tax", Number(event.target.value))} /></td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{yen(item.unit_cost, 4)}<span className="ml-1 text-[10px] font-normal text-gray-400">/{item.unit}</span></td>
                      <td className="px-4 py-3"><Input value={item.notes || ""} onChange={(event) => updateItem(item.id, "notes", event.target.value)} /></td>
                      <td className="px-4 py-3 text-right"><Button variant="ghost" size="icon" onClick={() => deleteItem(item)} aria-label={`${item.name}を削除`}><Trash2 className="h-4 w-4 text-red-500" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-gray-100 xl:hidden">
              {filteredItems.map((item) => (
                <div key={item.id} className={`p-4 ${dirtyIds.has(item.id) ? "bg-amber-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    <Input className="font-semibold" value={item.name} onChange={(event) => updateItem(item.id, "name", event.target.value)} />
                    <Button variant="ghost" size="icon" onClick={() => deleteItem(item)} aria-label={`${item.name}を削除`}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div>
                  {item.linked_recipe_id && (
                    <button type="button" onClick={() => router.push(`/recipe/${item.linked_recipe_id}`)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600">
                      <Link2 className="h-3.5 w-3.5" />中間部品連動
                    </button>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label className="space-y-1 text-xs text-gray-500">入数<Input disabled={Boolean(item.linked_recipe_id)} type="number" inputMode="decimal" value={item.purchase_quantity} onChange={(event) => updateItem(item.id, "purchase_quantity", Number(event.target.value))} /></label>
                    <label className="space-y-1 text-xs text-gray-500">出来高<Input disabled={Boolean(item.linked_recipe_id)} type="number" inputMode="decimal" value={item.yield_quantity} onChange={(event) => updateItem(item.id, "yield_quantity", Number(event.target.value))} /></label>
                    <label className="space-y-1 text-xs text-gray-500">税込価格<Input disabled={Boolean(item.linked_recipe_id)} type="number" inputMode="decimal" value={item.price_incl_tax} onChange={(event) => updateItem(item.id, "price_incl_tax", Number(event.target.value))} /></label>
                    <label className="space-y-1 text-xs text-gray-500">単位<Input disabled={Boolean(item.linked_recipe_id)} value={item.unit} onChange={(event) => updateItem(item.id, "unit", event.target.value)} /></label>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <Input placeholder="備考" value={item.notes || ""} onChange={(event) => updateItem(item.id, "notes", event.target.value)} />
                    <div className="shrink-0 text-right"><p className="text-[10px] text-gray-500">単価</p><p className="font-bold text-emerald-700">{yen(item.unit_cost, 4)}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
