"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Database,
  ExternalLink,
  Loader2,
  Plus,
  Save,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type DiningMaster = {
  id: string;
  name: string;
  item_type: "food" | "material";
  unit: string;
  unit_cost: number;
};

type RecipeItem = {
  id: string;
  dining_item_id: string | null;
  intermediate_recipe_id: string | null;
  quantity: number;
  unit: string;
  notes: string | null;
  source_name: string;
  source_type: "food" | "material" | "intermediate";
  unit_cost: number;
  calculated_cost: number;
};

type DiningRecipe = {
  id: string;
  name: string;
  menu_group: string | null;
  selling_price: number;
  serving_yield: number;
  serving_unit: string;
  is_intermediate: boolean;
  notes: string | null;
  source_file: string | null;
  source_sheet: string | null;
  source_reference: string | null;
  calculated_cost: number;
  unit_cost: number;
  cost_rate: number;
  gross_profit: number;
  cost_status: "complete" | "needs_review" | "recipe_missing" | "price_missing" | "selling_price_missing";
  recipe_items: RecipeItem[];
};

const yen = (value: number, digits = 0) =>
  new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value || 0);

export default function DiningRecipeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [recipe, setRecipe] = useState<DiningRecipe | null>(null);
  const [masters, setMasters] = useState<DiningMaster[]>([]);
  const [intermediates, setIntermediates] = useState<DiningRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [newItem, setNewItem] = useState({ source: "", quantity: "", unit: "g" });

  const loadRecipe = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch(`/api/recipe/dining?id=${params.id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "メニューレシピを取得できませんでした");
      setRecipe(data.recipe);
      setMasters(data.items || []);
      setIntermediates((data.intermediates || []).filter((row: DiningRecipe) => row.id !== params.id));
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadRecipe();
  }, [params.id]);

  const sourceOptions = useMemo(() => ({
    items: masters,
    intermediates,
  }), [masters, intermediates]);

  const saveRecipe = async () => {
    if (!recipe) return;
    setSavingRecipe(true);
    try {
      const response = await fetch("/api/recipe/dining", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: "recipe",
          id: recipe.id,
          data: {
            name: recipe.name,
            menu_group: recipe.menu_group,
            selling_price: recipe.selling_price,
            serving_yield: recipe.serving_yield,
            serving_unit: recipe.serving_unit,
            notes: recipe.notes,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存に失敗しました");
      toast.success("メニューレシピを保存しました");
      await loadRecipe(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSavingRecipe(false);
    }
  };

  const patchRecipeItem = async (item: RecipeItem, updates: Record<string, unknown>) => {
    setSavingItemId(item.id);
    try {
      const response = await fetch("/api/recipe/dining", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: "recipe_item", id: item.id, data: updates }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "材料明細の保存に失敗しました");
      await loadRecipe(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSavingItemId(null);
    }
  };

  const changeSource = (item: RecipeItem, source: string) => {
    if (source.startsWith("item:")) {
      const master = masters.find((row) => row.id === source.slice(5));
      patchRecipeItem(item, {
        dining_item_id: source.slice(5),
        intermediate_recipe_id: null,
        unit: master?.unit || item.unit,
      });
    } else if (source.startsWith("recipe:")) {
      patchRecipeItem(item, {
        dining_item_id: null,
        intermediate_recipe_id: source.slice(7),
        unit: "g",
      });
    }
  };

  const addRecipeItem = async () => {
    if (!recipe || !newItem.source) {
      toast.error("追加する食材・中間仕込みを選択してください");
      return;
    }
    setAddingItem(true);
    try {
      const isIntermediate = newItem.source.startsWith("recipe:");
      const response = await fetch("/api/recipe/dining", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_item",
          recipe_id: recipe.id,
          dining_item_id: isIntermediate ? null : newItem.source.slice(5),
          intermediate_recipe_id: isIntermediate ? newItem.source.slice(7) : null,
          quantity: Number(newItem.quantity || 0),
          unit: newItem.unit || "g",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "材料を追加できませんでした");
      setNewItem({ source: "", quantity: "", unit: "g" });
      toast.success("材料を追加しました");
      await loadRecipe(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setAddingItem(false);
    }
  };

  const deleteRecipeItem = async (item: RecipeItem) => {
    if (!confirm(`${item.source_name}をレシピから削除しますか？`)) return;
    try {
      const response = await fetch(`/api/recipe/dining?entity=recipe_item&id=${item.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "削除できませんでした");
      toast.success("材料を削除しました");
      await loadRecipe(false);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const deleteRecipe = async () => {
    if (!recipe || !confirm(`${recipe.name}を削除しますか？この操作は取り消せません。`)) return;
    try {
      const response = await fetch(`/api/recipe/dining?entity=recipe&id=${recipe.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "削除できませんでした");
      toast.success("メニューレシピを削除しました");
      router.push("/recipe/dining");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-gray-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />読み込み中</div>;
  }

  if (!recipe) {
    return <div className="p-8 text-center text-gray-500">メニューレシピが見つかりません</div>;
  }

  const displayCost = recipe.is_intermediate ? recipe.unit_cost : recipe.calculated_cost;
  const canDisplayCost = recipe.is_intermediate || ["complete", "needs_review"].includes(recipe.cost_status);
  const statusLabel = {
    complete: "原価確定",
    needs_review: "概算原価。製造メモの換算条件を確認してください",
    recipe_missing: "レシピ未登録。掲示板に分量の記載がないため推測登録していません",
    price_missing: "単価未確認の材料があります",
    selling_price_missing: "販売価格未登録です",
  }[recipe.cost_status];

  return (
    <main className="mx-auto w-full max-w-[1500px] px-3 py-4 sm:px-6 sm:py-6">
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="outline" size="icon" onClick={() => router.push("/recipe/dining")} aria-label="メニュー一覧へ戻る">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="h-6 w-6 text-emerald-700" />
              <h1 className="break-words text-xl font-bold leading-tight text-gray-950 sm:text-2xl">{recipe.name}</h1>
            </div>
            <p className="mt-1 text-sm text-gray-500">{recipe.is_intermediate ? "中間仕込み" : recipe.menu_group || "店舗メニュー"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/recipe/dining/database")}>
            <Database className="mr-2 h-4 w-4" />飲食用DB
          </Button>
          <Button onClick={saveRecipe} disabled={savingRecipe} className="bg-slate-900 hover:bg-slate-800">
            {savingRecipe ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            保存
          </Button>
        </div>
      </header>

      {!recipe.is_intermediate && recipe.cost_status !== "complete" && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{statusLabel}</p>
        </div>
      )}

      <section className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)]">
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">基本情報</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs font-medium text-gray-600">
              メニュー名
              <Input value={recipe.name} onChange={(event) => setRecipe((prev) => prev ? { ...prev, name: event.target.value } : prev)} />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-gray-600">
              分類
              <Input value={recipe.menu_group || ""} onChange={(event) => setRecipe((prev) => prev ? { ...prev, menu_group: event.target.value } : prev)} />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-gray-600">
              {recipe.is_intermediate ? "出来高" : "販売価格（税込）"}
              <Input type="number" inputMode="decimal" value={recipe.is_intermediate ? recipe.serving_yield : recipe.selling_price} onChange={(event) => setRecipe((prev) => prev ? recipe.is_intermediate ? { ...prev, serving_yield: Number(event.target.value) } : { ...prev, selling_price: Number(event.target.value) } : prev)} />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-gray-600">
              単位
              <Input value={recipe.serving_unit} onChange={(event) => setRecipe((prev) => prev ? { ...prev, serving_unit: event.target.value } : prev)} />
            </label>
          </div>
        </div>

        <div className="rounded-lg bg-slate-900 p-5 text-white shadow-lg">
          <p className="text-xs font-medium text-slate-400">{recipe.is_intermediate ? `1${recipe.serving_unit}あたり原価` : "1食原価（税込）"}</p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <p className="text-4xl font-bold tabular-nums">{canDisplayCost ? yen(displayCost, 2) : "算定待ち"}</p>
            {!recipe.is_intermediate && canDisplayCost && <p className="text-xl font-bold text-amber-300">{recipe.cost_rate.toFixed(1)}%</p>}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-700 pt-4 text-sm">
            <div>
              <p className="text-xs text-slate-400">{recipe.is_intermediate ? "仕込み総原価" : "販売価格"}</p>
              <p className="mt-1 font-semibold">{recipe.is_intermediate ? yen(recipe.calculated_cost, 2) : recipe.selling_price > 0 ? yen(recipe.selling_price, 2) : "未登録"}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">{recipe.is_intermediate ? "出来高" : "粗利"}</p>
              <p className="mt-1 font-semibold text-emerald-300">{recipe.is_intermediate ? `${recipe.serving_yield.toLocaleString()}${recipe.serving_unit}` : canDisplayCost ? yen(recipe.gross_profit, 2) : "-"}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-5 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-gray-950">材料・中間仕込み</h2>
            <p className="text-xs text-gray-500">飲食用DBの現行価格から自動計算</p>
          </div>
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-[980px] w-full table-fixed text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="w-[34%] px-4 py-3">名称</th>
                <th className="w-[13%] px-4 py-3 text-right">使用量</th>
                <th className="w-[9%] px-4 py-3">単位</th>
                <th className="w-[15%] px-4 py-3 text-right">単価</th>
                <th className="w-[17%] px-4 py-3 text-right">原価</th>
                <th className="w-[12%] px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recipe.recipe_items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">
                    <select
                      className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                      value={item.dining_item_id ? `item:${item.dining_item_id}` : `recipe:${item.intermediate_recipe_id}`}
                      onChange={(event) => changeSource(item, event.target.value)}
                    >
                      <optgroup label="食材・資材">
                        {sourceOptions.items.map((master) => <option key={master.id} value={`item:${master.id}`}>{master.name}</option>)}
                      </optgroup>
                      <optgroup label="中間仕込み">
                        {sourceOptions.intermediates.map((row) => <option key={row.id} value={`recipe:${row.id}`}>{row.name}</option>)}
                      </optgroup>
                    </select>
                    {item.source_type === "intermediate" && item.intermediate_recipe_id && (
                      <button type="button" onClick={() => router.push(`/recipe/dining/${item.intermediate_recipe_id}`)} className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        仕込み内訳を見る<ExternalLink className="h-3 w-3" />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      className="text-right tabular-nums"
                      type="number"
                      inputMode="decimal"
                      value={item.quantity}
                      onChange={(event) => setRecipe((prev) => prev ? { ...prev, recipe_items: prev.recipe_items.map((row) => row.id === item.id ? { ...row, quantity: Number(event.target.value) } : row) } : prev)}
                      onBlur={() => patchRecipeItem(item, { quantity: item.quantity })}
                    />
                  </td>
                  <td className="px-4 py-3"><Input value={item.unit} onChange={(event) => setRecipe((prev) => prev ? { ...prev, recipe_items: prev.recipe_items.map((row) => row.id === item.id ? { ...row, unit: event.target.value } : row) } : prev)} onBlur={() => patchRecipeItem(item, { unit: item.unit })} /></td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">{yen(item.unit_cost, 4)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{yen(item.calculated_cost, 2)}</td>
                  <td className="px-4 py-3 text-right">
                    {savingItemId === item.id ? <Loader2 className="ml-auto h-4 w-4 animate-spin text-gray-400" /> : (
                      <Button variant="ghost" size="icon" onClick={() => deleteRecipeItem(item)} aria-label={`${item.source_name}を削除`}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-gray-100 lg:hidden">
          {recipe.recipe_items.map((item) => (
            <div key={item.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-950">{item.source_name}</p>
                  <p className="mt-0.5 text-xs text-gray-500">単価 {yen(item.unit_cost, 4)} / {item.unit}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => deleteRecipeItem(item)} aria-label={`${item.source_name}を削除`}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-[1fr_90px_1fr] items-end gap-2">
                <label className="space-y-1 text-xs text-gray-500">使用量<Input type="number" inputMode="decimal" value={item.quantity} onChange={(event) => setRecipe((prev) => prev ? { ...prev, recipe_items: prev.recipe_items.map((row) => row.id === item.id ? { ...row, quantity: Number(event.target.value) } : row) } : prev)} onBlur={() => patchRecipeItem(item, { quantity: item.quantity })} /></label>
                <label className="space-y-1 text-xs text-gray-500">単位<Input value={item.unit} onChange={(event) => setRecipe((prev) => prev ? { ...prev, recipe_items: prev.recipe_items.map((row) => row.id === item.id ? { ...row, unit: event.target.value } : row) } : prev)} onBlur={() => patchRecipeItem(item, { unit: item.unit })} /></label>
                <div className="pb-2 text-right"><p className="text-xs text-gray-500">原価</p><p className="font-bold text-emerald-700">{yen(item.calculated_cost, 2)}</p></div>
              </div>
              {item.source_type === "intermediate" && item.intermediate_recipe_id && (
                <Button variant="outline" className="mt-3 w-full" onClick={() => router.push(`/recipe/dining/${item.intermediate_recipe_id}`)}>仕込み内訳を見る</Button>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-dashed border-gray-300 bg-gray-50 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(280px,1fr)_160px_100px_auto]">
            <select className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm" value={newItem.source} onChange={(event) => {
              const value = event.target.value;
              const master = value.startsWith("item:") ? masters.find((row) => row.id === value.slice(5)) : null;
              setNewItem((prev) => ({ ...prev, source: value, unit: master?.unit || "g" }));
            }}>
              <option value="">追加する食材・中間仕込みを選択</option>
              <optgroup label="食材・資材">{masters.map((master) => <option key={master.id} value={`item:${master.id}`}>{master.name}</option>)}</optgroup>
              <optgroup label="中間仕込み">{intermediates.map((row) => <option key={row.id} value={`recipe:${row.id}`}>{row.name}</option>)}</optgroup>
            </select>
            <Input type="number" inputMode="decimal" placeholder="使用量" value={newItem.quantity} onChange={(event) => setNewItem((prev) => ({ ...prev, quantity: event.target.value }))} />
            <Input placeholder="単位" value={newItem.unit} onChange={(event) => setNewItem((prev) => ({ ...prev, unit: event.target.value }))} />
            <Button onClick={addRecipeItem} disabled={addingItem}><Plus className="mr-2 h-4 w-4" />追加</Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">製造メモ</h2>
        <Textarea rows={4} value={recipe.notes || ""} onChange={(event) => setRecipe((prev) => prev ? { ...prev, notes: event.target.value } : prev)} placeholder="仕込み方、注意点、盛り付け方法など" />
        {recipe.source_file && (
          <p className="mt-3 text-xs text-gray-500">出典: {recipe.source_file} / {recipe.source_sheet} / {recipe.source_reference}</p>
        )}
        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={deleteRecipe} className="text-red-600 hover:bg-red-50 hover:text-red-700">
            <Trash2 className="mr-2 h-4 w-4" />このレシピを削除
          </Button>
        </div>
      </section>
    </main>
  );
}
