"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  ChefHat,
  Database,
  Loader2,
  Plus,
  Search,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DiningRecipe = {
  id: string;
  name: string;
  menu_group: string | null;
  selling_price: number;
  calculated_cost: number;
  cost_rate: number;
  gross_profit: number;
  cost_status: "complete" | "needs_review" | "recipe_missing" | "price_missing" | "selling_price_missing";
  recipe_items: unknown[];
};

const statusMeta = {
  complete: { label: "原価確定", className: "bg-emerald-50 text-emerald-700", icon: BadgeCheck },
  needs_review: { label: "概算", className: "bg-blue-50 text-blue-700", icon: AlertTriangle },
  recipe_missing: { label: "レシピ未登録", className: "bg-amber-50 text-amber-800", icon: AlertTriangle },
  price_missing: { label: "単価未確認", className: "bg-red-50 text-red-700", icon: AlertTriangle },
  selling_price_missing: { label: "販売価格未登録", className: "bg-amber-50 text-amber-800", icon: AlertTriangle },
} as const;

const yen = (value: number, digits = 0) =>
  new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value || 0);

export default function DiningRecipePage() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<DiningRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newMenu, setNewMenu] = useState({ name: "", menu_group: "", selling_price: "" });

  const loadRecipes = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/recipe/dining", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "メニューレシピを取得できませんでした");
      setRecipes(data.recipes || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecipes();
  }, []);

  const filteredRecipes = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return recipes;
    return recipes.filter((recipe) =>
      `${recipe.name} ${recipe.menu_group || ""}`.toLowerCase().includes(keyword),
    );
  }, [recipes, search]);

  const summary = useMemo(() => {
    const costedRecipes = recipes.filter((recipe) => recipe.cost_status === "complete");
    const totalPrice = costedRecipes.reduce((sum, recipe) => sum + recipe.selling_price, 0);
    const totalCost = costedRecipes.reduce((sum, recipe) => sum + recipe.calculated_cost, 0);
    const highest = [...costedRecipes].sort((a, b) => b.cost_rate - a.cost_rate)[0];
    return {
      totalCost,
      averageRate: totalPrice > 0 ? totalCost / totalPrice * 100 : 0,
      highest,
      costedCount: costedRecipes.length,
      pendingCount: recipes.length - costedRecipes.length,
    };
  }, [recipes]);

  const createRecipe = async () => {
    if (!newMenu.name.trim()) {
      toast.error("メニュー名を入力してください");
      return;
    }
    setCreating(true);
    try {
      const response = await fetch("/api/recipe/dining", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_recipe",
          name: newMenu.name,
          menu_group: newMenu.menu_group || null,
          selling_price: Number(newMenu.selling_price || 0),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "新規作成に失敗しました");
      toast.success("メニューレシピを作成しました");
      router.push(`/recipe/dining/${data.id}`);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6">
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="outline" size="icon" onClick={() => router.push("/recipe")} aria-label="レシピ一覧へ戻る">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="h-6 w-6 text-emerald-700" />
              <h1 className="break-words text-xl font-bold leading-tight text-gray-950 sm:text-2xl">会津食のブランド館 メニューレシピ</h1>
            </div>
            <p className="mt-1 text-sm text-gray-500">店舗メニューの分量と税込原価を管理</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/recipe/dining/database")}>
            <Database className="mr-2 h-4 w-4" />
            飲食用DB
          </Button>
          <Button onClick={() => setShowCreate(true)} className="bg-slate-900 hover:bg-slate-800">
            <Plus className="mr-2 h-4 w-4" />
            新規メニュー
          </Button>
        </div>
      </header>

      <section className="mb-5 grid overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm sm:grid-cols-4">
        <div className="border-b border-gray-200 px-5 py-4 sm:border-b-0 sm:border-r">
          <p className="text-xs font-medium text-gray-500">登録メニュー</p>
          <p className="mt-1 text-2xl font-bold text-gray-950">{recipes.length}<span className="ml-1 text-sm font-normal text-gray-500">品</span></p>
        </div>
        <div className="border-b border-gray-200 px-5 py-4 sm:border-b-0 sm:border-r">
          <p className="text-xs font-medium text-gray-500">確定{summary.costedCount}品の平均原価率</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{summary.averageRate.toFixed(1)}%</p>
        </div>
        <div className="border-b border-gray-200 px-5 py-4 sm:border-b-0 sm:border-r">
          <p className="text-xs font-medium text-gray-500">確定{summary.costedCount}品の合計原価</p>
          <p className="mt-1 text-2xl font-bold text-gray-950">{yen(summary.totalCost)}</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs font-medium text-gray-500">原価率が最も高い</p>
          <p className="mt-1 truncate text-base font-bold text-amber-700">{summary.highest?.name || "-"}</p>
          <p className="text-xs text-gray-500">{summary.highest ? `${summary.highest.cost_rate.toFixed(1)}%` : ""}</p>
          {summary.pendingCount > 0 && <p className="mt-1 text-xs font-medium text-amber-700">確認待ち {summary.pendingCount}品</p>}
        </div>
      </section>

      {showCreate && (
        <section className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-gray-950">新しいメニュー</h2>
            <Button variant="ghost" size="icon" onClick={() => setShowCreate(false)} aria-label="閉じる">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_220px_180px_auto]">
            <Input placeholder="メニュー名" value={newMenu.name} onChange={(event) => setNewMenu((prev) => ({ ...prev, name: event.target.value }))} />
            <Input placeholder="分類（例: 三大ラーメン）" value={newMenu.menu_group} onChange={(event) => setNewMenu((prev) => ({ ...prev, menu_group: event.target.value }))} />
            <Input type="number" inputMode="decimal" placeholder="販売価格（税込）" value={newMenu.selling_price} onChange={(event) => setNewMenu((prev) => ({ ...prev, selling_price: event.target.value }))} />
            <Button onClick={createRecipe} disabled={creating}>
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              作成
            </Button>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 p-4">
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input className="pl-9" placeholder="メニュー名を検索" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />読み込み中
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className="min-h-48 p-10 text-center text-gray-500">該当するメニューはありません</div>
        ) : (
          <>
            <div className="hidden lg:block">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="w-[34%] px-5 py-3">メニュー</th>
                    <th className="w-[14%] px-4 py-3 text-right">販売価格（税込）</th>
                    <th className="w-[14%] px-4 py-3 text-right">1食原価</th>
                    <th className="w-[14%] px-4 py-3 text-right">原価率</th>
                    <th className="w-[14%] px-4 py-3 text-right">粗利</th>
                    <th className="w-[10%] px-4 py-3 text-right">材料数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRecipes.map((recipe) => (
                    <tr key={recipe.id} className="cursor-pointer hover:bg-emerald-50/50" onClick={() => router.push(`/recipe/dining/${recipe.id}`)}>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-gray-950">{recipe.name}</p>
                          {(() => {
                            const meta = statusMeta[recipe.cost_status];
                            const StatusIcon = meta.icon;
                            return <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${meta.className}`}><StatusIcon className="h-3 w-3" />{meta.label}</span>;
                          })()}
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500">{recipe.menu_group || "分類なし"}</p>
                      </td>
                      <td className="px-4 py-4 text-right font-medium">{recipe.selling_price > 0 ? yen(recipe.selling_price) : "未登録"}</td>
                      <td className="px-4 py-4 text-right font-medium">{["complete", "needs_review"].includes(recipe.cost_status) ? yen(recipe.calculated_cost, 2) : "算定待ち"}</td>
                      <td className="px-4 py-4 text-right font-bold text-amber-700">{["complete", "needs_review"].includes(recipe.cost_status) ? `${recipe.cost_rate.toFixed(1)}%` : "-"}</td>
                      <td className="px-4 py-4 text-right font-bold text-emerald-700">{["complete", "needs_review"].includes(recipe.cost_status) ? yen(recipe.gross_profit, 2) : "-"}</td>
                      <td className="px-4 py-4 text-right text-gray-500">{recipe.recipe_items.length}件</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-gray-100 lg:hidden">
              {filteredRecipes.map((recipe) => (
                <button key={recipe.id} type="button" onClick={() => router.push(`/recipe/dining/${recipe.id}`)} className="block w-full p-4 text-left active:bg-gray-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-950">{recipe.name}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{recipe.menu_group || "分類なし"}・材料{recipe.recipe_items.length}件</p>
                      <p className={`mt-1 inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${statusMeta[recipe.cost_status].className}`}>{statusMeta[recipe.cost_status].label}</p>
                    </div>
                    <ChefHat className="h-5 w-5 shrink-0 text-emerald-600" />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-right">
                    <div><p className="text-[11px] text-gray-500">販売価格</p><p className="font-semibold">{recipe.selling_price > 0 ? yen(recipe.selling_price) : "未登録"}</p></div>
                    <div><p className="text-[11px] text-gray-500">1食原価</p><p className="font-semibold">{["complete", "needs_review"].includes(recipe.cost_status) ? yen(recipe.calculated_cost, 2) : "算定待ち"}</p></div>
                    <div><p className="text-[11px] text-gray-500">原価率</p><p className="font-bold text-amber-700">{["complete", "needs_review"].includes(recipe.cost_status) ? `${recipe.cost_rate.toFixed(1)}%` : "-"}</p></div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
