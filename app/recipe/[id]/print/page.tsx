// app/recipe/[id]/print/page.tsx
// レシピ印刷プレビュー専用ページ（DocScannerのiframeから使用）

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface Recipe {
  id: string;
  name: string;
  category: string;
  is_intermediate: boolean;
  development_date: string | null;
  manufacturing_notes: string | null;
  filling_quantity: number | null;
  label_quantity: string | null;
  storage_method: string | null;
  sterilization_method: string | null;
  sterilization_temperature: string | null;
  sterilization_time: string | null;
  selling_price: number | null;
  total_cost: number | null;
  total_weight: number | null;
  ingredient_label?: string | null;
  yield_rate?: number | null;
}

interface RecipeItem {
  id: string;
  recipe_id: string;
  item_name: string;
  item_type: string;
  unit_quantity: number | string | null;
  unit_price: number | string | null;
  unit_weight: number | null;
  usage_amount: number | string | null;
  cost: number | string | null;
  tax_included?: boolean;
}

interface VersionInfo {
  version_number: number;
  version_note: string | null;
}

export default function RecipePrintPage() {
  const params = useParams();
  const id = params.id as string;
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [items, setItems] = useState<RecipeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [latestVersion, setLatestVersion] = useState<VersionInfo | null>(null);

  const batchSize1 = 400;
  const batchSize2 = 800;

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: recipeData } = await supabase
        .from("recipes")
        .select("*")
        .eq("id", id)
        .single();

      if (!recipeData) {
        setLoading(false);
        return;
      }
      setRecipe(recipeData);

      const { data: itemsData } = await supabase
        .from("recipe_items")
        .select("*")
        .eq("recipe_id", id)
        .order("id");

      if (itemsData) setItems(itemsData);

      // 最新バージョン取得
      const { data: versionData } = await supabase
        .from("recipe_versions")
        .select("version_number, version_note")
        .eq("recipe_id", id)
        .order("version_number", { ascending: false })
        .limit(1);

      if (versionData && versionData.length > 0) {
        setLatestVersion(versionData[0]);
      }

      setLoading(false);
    })();
  }, [id]);

  const formatNumber = (value?: number | null, decimals = 2, suffix = "") => {
    if (value === undefined || value === null) return "-";
    return `${value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
  };

  if (loading) return <div className="flex justify-center items-center h-screen text-gray-400">読み込み中...</div>;
  if (!recipe) return <div className="flex justify-center items-center h-screen text-gray-400">レシピが見つかりません</div>;

  // グループ化
  const groupedItems = [
    { title: "セット内容（商品）", type: "product", items: items.filter(i => i.item_type === "product") },
    { title: "原材料", type: "ingredient", items: items.filter(i => i.item_type === "ingredient") },
    { title: "中間加工品", type: "intermediate", items: items.filter(i => i.item_type === "intermediate") },
    { title: "資材・包材", type: "material", items: items.filter(i => i.item_type === "material") },
    { title: "諸経費", type: "expense", items: items.filter(i => i.item_type === "expense") },
  ];

  return (
    <div className="bg-white text-black text-sm p-4 m-0 w-full font-sans" style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div className="border-b border-black pb-0 mb-0">
        <h1 className="text-sm font-bold leading-none">{recipe.name}</h1>
        <div className="flex gap-3 text-[9px] text-gray-500">
          <span>カテゴリ: {recipe.category}</span>
          <span>開発日: {recipe.development_date || "-"}</span>
          <span>ID: {recipe.id.split("-")[0]}</span>
          {latestVersion && (
            <span>最新: v{latestVersion.version_number}</span>
          )}
        </div>
      </div>

      {/* Specs Row */}
      <div className="flex gap-2 mb-0 text-xs">
        <div className="border border-gray-400 rounded px-2 py-0.5">
          <div className="text-[9px] font-bold text-gray-500 mb-0">充填量</div>
          <div className="text-xs font-bold leading-tight">{recipe.filling_quantity ?? "-"} g</div>
        </div>
        <div className="border border-gray-400 rounded px-2 py-0.5">
          <div className="text-[9px] font-bold text-gray-500 mb-0">内容量（表記量）</div>
          <div className="text-xs font-bold leading-tight">{recipe.label_quantity || "-"}</div>
        </div>
        <div className="border border-gray-400 rounded px-2 py-0.5">
          <div className="text-[9px] font-bold text-gray-500 mb-0">保存方法</div>
          <div className="text-xs font-bold leading-tight">{recipe.storage_method || "-"}</div>
        </div>
        {recipe.sterilization_method && (
          <div className="border border-gray-400 rounded px-2 py-0.5">
            <div className="text-[9px] font-bold text-gray-500 mb-0">殺菌</div>
            <div className="text-lg font-bold">
              {recipe.sterilization_method}
              {recipe.sterilization_temperature && ` ${recipe.sterilization_temperature}℃`}
              {recipe.sterilization_time && ` ${recipe.sterilization_time}分`}
            </div>
          </div>
        )}
      </div>

      {/* Manufacturing Plan Table */}
      <div className="mb-3">
        <h2 className="text-xs font-bold border-b border-black pb-0 mb-0">製造計画（材料表）</h2>
        <div className="flex gap-4 mb-0 text-[10px] text-gray-600">
          <span>製造数 A: <strong className="text-black">{batchSize1}個</strong></span>
          <span>製造数 B: <strong className="text-black">{batchSize2}個</strong></span>
        </div>
      </div>

      {groupedItems
        .filter(g => g.type !== "material" && g.type !== "expense")
        .map((group, gIdx) =>
          group.items.length > 0 && (
            <div key={gIdx} className="mb-1">
              <div className="text-[10px] font-bold bg-gray-100 px-1 py-0 inline-block rounded mb-0">
                {group.title}
              </div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-400 text-gray-600">
                    <th className="text-left py-0 w-4 text-[10px]">#</th>
                    <th className="text-left py-0 text-[10px]">名称</th>
                    <th className="text-right py-0 w-16 text-[10px]">基本(1)</th>
                    <th className="text-right py-1 w-28">A ({batchSize1})</th>
                    <th className="text-right py-1 w-28">B ({batchSize2})</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map((item, idx) => {
                    const unitUsage = parseFloat(String(item.usage_amount)) || 0;
                    const unitQty = parseFloat(String(item.unit_quantity)) || 0;
                    const b1Usage = unitUsage * batchSize1;
                    const b1Bags = unitQty > 0 ? b1Usage / unitQty : 0;
                    const b2Usage = unitUsage * batchSize2;
                    const b2Bags = unitQty > 0 ? b2Usage / unitQty : 0;
                    const unit = (group.type === "product" || group.type === "intermediate") ? "個" : "g";

                    return (
                      <tr key={item.id} className="border-b border-gray-200">
                        <td className="py-0 text-gray-400 text-[10px]">{idx + 1}</td>
                        <td className="py-0 font-medium text-[10px] leading-tight">
                          {item.item_name}
                          {unitQty > 0 && group.type !== "product" && group.type !== "intermediate" && (
                            <span className="text-gray-400 ml-1">({formatNumber(unitQty, 0)}g/pk)</span>
                          )}
                        </td>
                        <td className="py-0 text-right font-mono text-[10px]">{formatNumber(unitUsage, 1)}{unit}</td>
                        <td className="py-0 text-right font-mono">
                          <span className="font-bold">{formatNumber(b1Usage, 0)}{unit}</span>
                          {b1Bags > 0 && group.type !== "product" && group.type !== "intermediate" && (
                            <span className="text-gray-500 ml-1">({formatNumber(b1Bags, 2)}pk)</span>
                          )}
                        </td>
                        <td className="py-0 text-right font-mono">
                          <span className="font-bold">{formatNumber(b2Usage, 0)}{unit}</span>
                          {b2Bags > 0 && group.type !== "product" && group.type !== "intermediate" && (
                            <span className="text-gray-500 ml-1">({formatNumber(b2Bags, 2)}pk)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-300 font-bold text-[10px]">
                    <td colSpan={2} className="py-1 text-right text-gray-500">計</td>
                    <td className="py-0 text-right font-mono text-[10px]">
                      {formatNumber(group.items.reduce((s, i) => s + (parseFloat(String(i.usage_amount)) || 0), 0), 0)
                        + (group.type === "product" || group.type === "intermediate" ? "個" : "g")}
                    </td>
                    <td className="py-0 text-right font-mono">
                      {formatNumber(group.items.reduce((s, i) => s + (parseFloat(String(i.usage_amount)) || 0) * batchSize1, 0), 0)
                        + (group.type === "product" || group.type === "intermediate" ? "個" : "g")}
                    </td>
                    <td className="py-0 text-right font-mono">
                      {formatNumber(group.items.reduce((s, i) => s + (parseFloat(String(i.usage_amount)) || 0) * batchSize2, 0), 0)
                        + (group.type === "product" || group.type === "intermediate" ? "個" : "g")}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* 中間加工品の全体重量 */}
              {group.type === "intermediate" && (
                <div className="mt-1 mb-2 border-t border-black pt-1">
                  <div className="flex justify-between items-center px-1">
                    <div className="text-[10px] font-bold">全体重量 (原材料 + 中間加工品)</div>
                    <div className="flex gap-4">
                      <div className="text-right">
                        <span className="text-[8px] text-gray-500 mr-1 uppercase">基本(1)</span>
                        <span className="font-mono font-bold text-[10px]">
                          {formatNumber(items.reduce((sum, it) => {
                            if (["ingredient", "intermediate", "product"].includes(it.item_type)) {
                              const usage = parseFloat(String(it.usage_amount)) || 0;
                              return sum + (it.item_type === "ingredient" ? usage : usage * (it.unit_weight || 0));
                            }
                            return sum;
                          }, 0), 1)}g
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[8px] text-gray-500 mr-1 uppercase">A ({batchSize1})</span>
                        <span className="font-mono font-bold text-[10px]">
                          {formatNumber(items.reduce((sum, it) => {
                            if (["ingredient", "intermediate", "product"].includes(it.item_type)) {
                              const usage = parseFloat(String(it.usage_amount)) || 0;
                              const weight = it.item_type === "ingredient" ? usage : usage * (it.unit_weight || 0);
                              return sum + (weight * batchSize1);
                            }
                            return sum;
                          }, 0), 0)}g
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[8px] text-gray-500 mr-1 uppercase">B ({batchSize2})</span>
                        <span className="font-mono font-bold text-[10px]">
                          {formatNumber(items.reduce((sum, it) => {
                            if (["ingredient", "intermediate", "product"].includes(it.item_type)) {
                              const usage = parseFloat(String(it.usage_amount)) || 0;
                              const weight = it.item_type === "ingredient" ? usage : usage * (it.unit_weight || 0);
                              return sum + (weight * batchSize2);
                            }
                            return sum;
                          }, 0), 0)}g
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        )}

      {/* Manufacturing Notes */}
      {recipe.manufacturing_notes && (
        <div className="mt-1 border-t border-gray-300 pt-0">
          <h3 className="text-[10px] font-bold text-gray-500 mb-0">製造メモ</h3>
          <p className="text-[10px] whitespace-pre-wrap leading-tight">{recipe.manufacturing_notes}</p>
        </div>
      )}
    </div>
  );
}
