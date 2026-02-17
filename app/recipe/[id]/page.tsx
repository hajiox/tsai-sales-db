// app/recipe/[id]/page.tsx
// レシピ詳細ページ - シングルページレイアウト & 印刷対応

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Edit, Save, Printer, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import NutritionDisplay, {
  NutritionData,
} from "../_components/NutritionDisplay";
import ItemNameSelect, { ItemCandidate } from "../_components/ItemNameSelect";
import InlineEdit from "../_components/InlineEdit";

// カテゴリー一覧
const CATEGORIES = [
  {
    value: "ネット専用",
    label: "ネット",
    color: "bg-blue-100 text-blue-800 border-blue-200",
  },
  {
    value: "自社",
    label: "自社",
    color: "bg-green-100 text-green-800 border-green-200",
  },
  {
    value: "OEM",
    label: "OEM",
    color: "bg-orange-100 text-orange-800 border-orange-200",
  },
  {
    value: "中間部品",
    label: "中間部品",
    color: "bg-purple-100 text-purple-800 border-purple-200",
  },
  {
    value: "終売",
    label: "終売",
    color: "bg-gray-500 text-white border-gray-600",
  },
  {
    value: "試作",
    label: "試作",
    color: "bg-gray-100 text-gray-800 border-gray-200",
  },
  {
    value: "Shopee",
    label: "Shopee",
    color: "bg-pink-100 text-pink-800 border-pink-200",
  },
];

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
  source_file: string | null;
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

export default function RecipeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [items, setItems] = useState<RecipeItem[]>([]);
  const [taxRates, setTaxRates] = useState({
    ingredient: 1.08,
    material: 1.1,
  });

  useEffect(() => {
    const saved = localStorage.getItem("global_tax_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setTaxRates({
          ingredient: 1 + parsed.ingredient / 100,
          material: 1 + parsed.material / 100,
        });
      } catch (e) {
        console.error("Failed to parse tax settings", e);
      }
    }
  }, []);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [nutritionMap, setNutritionMap] = useState<
    Record<string, NutritionData>
  >({});

  // Deletion tracking
  const [deletedItemIds, setDeletedItemIds] = useState<Set<string>>(new Set());

  // Master Data
  const [ingredients, setIngredients] = useState<ItemCandidate[]>([]);
  const [materials, setMaterials] = useState<ItemCandidate[]>([]);
  const [intermediates, setIntermediates] = useState<ItemCandidate[]>([]);
  const [products, setProducts] = useState<ItemCandidate[]>([]);
  const [expenses, setExpenses] = useState<ItemCandidate[]>([]);

  // Batch calculation states
  const [batchSize1, setBatchSize1] = useState(400);
  const [batchSize2, setBatchSize2] = useState(800);

  useEffect(() => {
    if (params.id) {
      fetchRecipe(params.id as string);
      fetchMasterData();
    }
  }, [params.id]);

  const fetchMasterData = async () => {
    // Ingredients
    const { data: ingData } = await supabase
      .from("ingredients")
      .select(
        "id, name, unit_quantity, price, calories, protein, fat, carbohydrate, sodium, tax_included",
      );
    if (ingData) {
      setIngredients(
        ingData.map((i) => ({
          id: i.id,
          name: i.name,
          unit_quantity: i.unit_quantity ?? undefined,
          unit_price: i.price ?? undefined,
          tax_included: i.tax_included ?? true,
          nutrition: {
            calories: i.calories,
            protein: i.protein,
            fat: i.fat,
            carbohydrate: i.carbohydrate,
            sodium: i.sodium,
          },
        })),
      );
    }
    // Materials
    const { data: matData } = await supabase
      .from("materials")
      .select("id, name, unit_quantity, price, tax_included");
    if (matData) {
      setMaterials(
        matData.map((m) => ({
          id: m.id,
          name: m.name,
          unit_quantity: m.unit_quantity ?? undefined,
          unit_price: m.price ?? undefined,
          tax_included: m.tax_included ?? true,
        })),
      );
    }
    // Intermediates
    const { data: recipeData } = await supabase
      .from("recipes")
      .select("id, name, total_cost, total_weight")
      .eq("is_intermediate", true);
    if (recipeData) {
      setIntermediates(
        recipeData.map((r) => ({
          id: r.id,
          name: r.name,
          unit_quantity: 1,
          unit_weight: r.total_weight ?? undefined,
          unit_price: r.total_cost ?? undefined,
        })),
      );
    }
    // Products (Set Components) - Recipes that are NOT intermediate
    const { data: prodData } = await supabase
      .from("recipes")
      .select("id, name, total_cost, total_weight")
      .eq("is_intermediate", false);
    if (prodData) {
      setProducts(
        prodData.map((r) => ({
          id: r.id,
          name: r.name,
          unit_quantity: 1,
          unit_weight: r.total_weight ?? undefined,
          unit_price: r.total_cost ?? undefined,
        })),
      );
    }
    // Expenses (Hardcoded for now)
    setExpenses([
      { id: "exp-1", name: "ヤマト送料", unit_price: 950, unit_quantity: 1 },
      { id: "exp-2", name: "ネコポス送料", unit_price: 350, unit_quantity: 1 },
      {
        id: "exp-3",
        name: "コンパクト送料",
        unit_price: 550,
        unit_quantity: 1,
      },
      { id: "exp-4", name: "人件費", unit_price: 1200, unit_quantity: 1 },
      { id: "exp-5", name: "Amazon手数料", unit_price: 0, unit_quantity: 1 },
    ]);
  };

  const fetchRecipe = async (id: string) => {
    setLoading(true);

    const { data: recipeData, error: recipeError } = await supabase
      .from("recipes")
      .select("*")
      .eq("id", id)
      .single();

    if (recipeError || !recipeData) {
      console.error("Recipe fetch error:", recipeError);
      setLoading(false);
      return;
    }

    setRecipe(recipeData);

    const { data: itemsData } = await supabase
      .from("recipe_items")
      .select("*")
      .eq("recipe_id", id)
      .order("id");

    if (itemsData) {
      setItems(itemsData);

      const ingredientNames = itemsData
        .filter(
          (i) => i.item_type === "ingredient" || i.item_type === "intermediate",
        )
        .map((i) => i.item_name);

      if (ingredientNames.length > 0) {
        const { data: nutritionData } = await supabase
          .from("ingredients")
          .select("name, calories, protein, fat, carbohydrate, sodium")
          .in("name", ingredientNames);

        if (nutritionData) {
          const map: Record<string, NutritionData> = {};
          nutritionData.forEach((n) => {
            map[n.name] = {
              calories: n.calories,
              protein: n.protein,
              fat: n.fat,
              carbohydrate: n.carbohydrate,
              sodium: n.sodium,
            };
          });
          setNutritionMap(map);
        }
      }
    }

    setLoading(false);
  };

  const handleItemChange = (itemId: string, field: string, value: any) => {
    setItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id === itemId) {
          const updatedItem = { ...item, [field]: value };

          if (["usage_amount", "unit_quantity", "unit_price", "tax_included"].includes(field)) {
            const usage = parseFloat(String(updatedItem.usage_amount)) || 0;
            const qty = parseFloat(String(updatedItem.unit_quantity)) || 0;
            const price = parseFloat(String(updatedItem.unit_price)) || 0;

            const rate =
              updatedItem.item_type === "ingredient" &&
                !updatedItem.tax_included
                ? (1 + (taxRates.ingredient / 100))
                : updatedItem.item_type === "material" &&
                  !updatedItem.tax_included
                  ? (1 + (taxRates.material / 100))
                  : 1.0;

            if (qty !== 0) {
              updatedItem.cost = Math.round(usage * (price / qty) * rate);
            }
          }
          return updatedItem;
        }
        return item;
      }),
    );
    setHasChanges(true);
  };

  const addItem = (type: string) => {
    if (!recipe) return;
    const newItem: RecipeItem = {
      id: `temp-${Date.now()}-${Math.random()}`,
      recipe_id: recipe.id,
      item_name: "",
      item_type: type,
      unit_quantity: 0,
      unit_price: 0,
      unit_weight: 0,
      usage_amount: 0,
      cost: 0,
      tax_included: true,
    };
    setItems((prev) => [...prev, newItem]);
    setIsEditing(true);
    setHasChanges(true);
  };

  const deleteItem = (itemId: string) => {
    if (!itemId.startsWith("temp-")) {
      setDeletedItemIds((prev) => {
        const next = new Set(prev);
        next.add(itemId);
        return next;
      });
    }
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    setHasChanges(true);
  };

  const handleItemSelect = (
    itemId: string,
    selected: ItemCandidate | string,
  ) => {
    setItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id === itemId) {
          let updates: Partial<RecipeItem> = {};
          if (typeof selected === "string") {
            updates = { item_name: selected };
          } else {
            updates = {
              item_name: selected.name,
              unit_price: selected.unit_price || 0,
              unit_weight: selected.unit_weight || 0,
              unit_quantity:
                typeof selected.unit_quantity === "number"
                  ? selected.unit_quantity
                  : parseFloat(String(selected.unit_quantity)) || 0,
              tax_included: selected.tax_included !== false, // default true
            };

            if (selected.name === "Amazon手数料" && recipe?.selling_price) {
              updates.cost = Math.round(recipe.selling_price * 0.1);
              updates.usage_amount = 1;
              updates.unit_price = updates.cost;
            }
          }
          const updatedItem = { ...item, ...updates };

          if (
            updatedItem.usage_amount &&
            updatedItem.unit_price &&
            updatedItem.unit_quantity
          ) {
            const usage = parseFloat(String(updatedItem.usage_amount)) || 0;
            const qty = parseFloat(String(updatedItem.unit_quantity)) || 0;
            const price = parseFloat(String(updatedItem.unit_price)) || 0;

            const rate =
              updatedItem.item_type === "ingredient" &&
                !updatedItem.tax_included
                ? (1 + (taxRates.ingredient / 100))
                : updatedItem.item_type === "material" &&
                  !updatedItem.tax_included
                  ? (1 + (taxRates.material / 100))
                  : 1.0;

            if (qty !== 0) {
              updatedItem.cost = Math.round(usage * (price / qty) * rate);
            }
          }
          return updatedItem;
        }
        return item;
      }),
    );
    setHasChanges(true);
  };

  const handleRecipeChange = async (field: keyof Recipe, value: any) => {
    if (!recipe) return;

    const updatedRecipe = { ...recipe, [field]: value };
    setRecipe(updatedRecipe);

    if (field === "selling_price") {
      const newPrice =
        typeof value === "number" ? value : parseFloat(value) || 0;
      const feeItem = items.find((i) => i.item_name === "Amazon手数料");
      if (feeItem && newPrice > 0) {
        const newFee = Math.round(newPrice * 0.1);
        setItems((prev) =>
          prev.map((i) => {
            if (i.item_name === "Amazon手数料") {
              return {
                ...i,
                cost: newFee,
                unit_price: newFee,
                usage_amount: 1,
              };
            }
            return i;
          }),
        );
        setHasChanges(true);
      }
    }

    if (field === "category") {
      const isIntermediate = value === "中間部品";
      try {
        const { error } = await supabase
          .from("recipes")
          .update({
            category: value,
            is_intermediate: isIntermediate,
          })
          .eq("id", recipe.id);

        if (error) throw error;
        // Update local state
        setRecipe((prev) =>
          prev
            ? {
              ...prev,
              category: String(value),
              is_intermediate: isIntermediate,
            }
            : null,
        );
        toast.success("カテゴリーを更新しました");
      } catch (error) {
        console.error("Update error:", error);
        toast.error("カテゴリーの更新に失敗しました");
      }
      return;
    }

    try {
      const { error } = await supabase
        .from("recipes")
        .update({ [field]: value })
        .eq("id", recipe.id);

      if (error) throw error;
      toast.success("更新しました", { duration: 1000 });
    } catch (error) {
      console.error("Update error:", error);
      toast.error("更新に失敗しました");
    }
  };

  const saveChanges = async () => {
    if (!recipe) return;

    try {
      // 1. Delete removed items
      if (deletedItemIds.size > 0) {
        const { error: delError } = await supabase
          .from("recipe_items")
          .delete()
          .in("id", Array.from(deletedItemIds));
        if (delError) throw delError;
        setDeletedItemIds(new Set());
      }

      // 2. Process updates and inserts
      const newItems = items.filter((i) => i.id.startsWith("temp-"));
      const existingItems = items.filter((i) => !i.id.startsWith("temp-"));

      // Inserts
      if (newItems.length > 0) {
        const { error: insError } = await supabase.from("recipe_items").insert(
          newItems.map((item) => ({
            recipe_id: recipe.id,
            item_name: item.item_name,
            item_type: item.item_type,
            unit_quantity: item.unit_quantity,
            unit_price: item.unit_price,
            unit_weight: item.unit_weight,
            usage_amount: item.usage_amount,
            cost: item.cost,
            tax_included: item.tax_included ?? true
          })),
        );
        if (insError) throw insError;
      }

      // Updates
      for (const item of existingItems) {
        const { error: updError } = await supabase
          .from("recipe_items")
          .update({
            item_name: item.item_name,
            unit_quantity: item.unit_quantity,
            unit_price: item.unit_price,
            unit_weight: item.unit_weight,
            usage_amount: item.usage_amount,
            cost: item.cost,
            tax_included: item.tax_included ?? true
          })
          .eq("id", item.id);
        if (updError) throw updError;
      }

      const totalCost = items.reduce(
        (sum, item) => sum + (parseFloat(String(item.cost)) || 0),
        0,
      );

      const totalWeight = items.reduce((sum, item) => {
        // Items that contribute weight
        if (["ingredient", "intermediate", "product"].includes(item.item_type)) {
          const usage = parseFloat(String(item.usage_amount)) || 0;
          if (item.item_type === "ingredient") {
            return sum + usage;
          } else {
            // intermediate or product
            const unitWeight = item.unit_weight || 0;
            return sum + (usage * unitWeight);
          }
        }
        return sum;
      }, 0);

      await supabase
        .from("recipes")
        .update({
          total_cost: totalCost,
          total_weight: totalWeight,
          manufacturing_notes: recipe.manufacturing_notes,
          filling_quantity: recipe.filling_quantity,
          storage_method: recipe.storage_method,
          label_quantity: recipe.label_quantity,
          sterilization_method: recipe.sterilization_method,
          sterilization_temperature: recipe.sterilization_temperature,
          sterilization_time: recipe.sterilization_time,
          development_date: recipe.development_date,
        })
        .eq("id", recipe.id);

      setHasChanges(false);
      // Keep editing mode active

      // Reload to get real IDs
      fetchRecipe(recipe.id);
    } catch (error) {
      console.error(error);
      toast.error("保存に失敗しました");
    }
  };

  const formatNumber = (value?: number | null, decimals = 1, suffix = "") => {
    if (value === undefined || value === null) return "-";
    return `${value.toLocaleString(undefined, { maximumFractionDigits: decimals })}${suffix}`;
  };

  const formatCurrency = (value?: number | null) => {
    if (value === undefined || value === null) return "-";
    return `¥${Math.round(value).toLocaleString()}`;
  };

  const getTotals = () => {
    return {
      usage: items.reduce(
        (sum, item) => sum + (parseFloat(String(item.usage_amount)) || 0),
        0,
      ),
      cost: items.reduce(
        (sum, item) => sum + (parseFloat(String(item.cost)) || 0),
        0,
      ),
    };
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-screen text-gray-400">
        読み込み中...
      </div>
    );
  if (!recipe)
    return (
      <div className="flex justify-center items-center h-screen text-gray-400">
        レシピが見つかりません
      </div>
    );

  const totals = getTotals();
  // Calculate profit based on tax-excluded price (Standard accounting practice)
  const sellingPriceExTax = recipe.selling_price
    ? Math.round(recipe.selling_price / 1.08)
    : 0;
  const profit = sellingPriceExTax - totals.cost;
  const profitRate = sellingPriceExTax ? (profit / sellingPriceExTax) * 100 : 0;

  // Group items for display
  const groupedItems = [
    {
      title: "セット内容（商品）",
      type: "product",
      items: items.filter((i) => i.item_type === "product"),
      color: "bg-indigo-50 text-indigo-700 border-indigo-100",
      candidates: products,
    },
    {
      title: "原材料",
      type: "ingredient",
      items: items.filter((i) => i.item_type === "ingredient"),
      color: "bg-green-50 text-green-700 border-green-100",
      candidates: ingredients,
    },
    {
      title: "中間加工品",
      type: "intermediate",
      items: items.filter((i) => i.item_type === "intermediate"),
      color: "bg-purple-50 text-purple-700 border-purple-100",
      candidates: intermediates,
    },
    {
      title: "資材・包材",
      type: "material",
      items: items.filter((i) => i.item_type === "material"),
      color: "bg-orange-50 text-orange-700 border-orange-100",
      candidates: materials,
    },
    {
      title: "諸経費",
      type: "expense",
      items: items.filter((i) => i.item_type === "expense"),
      color: "bg-red-50 text-red-700 border-red-100",
      candidates: expenses,
    },
  ];

  return (
    <div className="min-h-screen bg-white text-gray-800 font-sans print:p-0">
      {/* Control Bar */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b px-6 py-3 flex justify-between items-center print:hidden">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/recipe")}
            className="text-gray-500 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            レシピ一覧
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="gap-2"
          >
            <Printer className="w-4 h-4" />
            A4印刷
          </Button>
          {hasChanges && (
            <Button
              size="sm"
              onClick={saveChanges}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Save className="w-4 h-4" />
              保存
            </Button>
          )}
        </div>
      </header>
      {/* Main Content - Screen Only */}
      <main className="max-w-[210mm] mx-auto p-8 print:hidden">
        {/* Header Section */}
        {/* Header Section (Recipe Name & Pricing Card) */}
        <div className="border-b-2 border-gray-800 pb-4 mb-6 flex justify-between items-end">
          <div>
            <div className="flex gap-2 mb-2">
              <Select
                value={recipe.category}
                onValueChange={(val) => handleRecipeChange("category", val)}
              >
                <SelectTrigger
                  className={`h-6 px-2 py-0 border rounded uppercase tracking-wider text-[10px] font-bold w-auto inline-flex items-center gap-1 ${CATEGORIES.find((c) => c.value === recipe.category)
                    ?.color || "border-gray-200 text-gray-500"
                    }`}
                >
                  <SelectValue>{recipe.category}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      <span className={`px-2 py-0.5 rounded ${cat.color}`}>
                        {cat.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {recipe.is_intermediate && (
                <span className="px-2 py-0.5 text-[10px] font-bold border border-purple-300 text-purple-700 rounded uppercase tracking-wider">
                  Middle
                </span>
              )}
            </div>
            <InlineEdit
              value={recipe.name}
              onSave={(val) => handleRecipeChange("name", val)}
              className="text-3xl font-extrabold text-gray-900 leading-tight w-full hover:bg-gray-50 rounded px-1 -ml-1 transition-colors"
              inputClassName="text-3xl font-extrabold text-gray-900 leading-tight"
            />
            <div className="flex gap-4 mt-2 text-xs text-gray-500 font-mono">
              <span>ID: {recipe.id.split("-")[0]}</span>
              <span>DEV: {recipe.development_date || "----/--/--"}</span>
              <span>UPD: {new Date().toLocaleDateString()}</span>
            </div>
          </div>
          {/* Hide old pricing display */}
          <div className="text-right hidden"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 items-start">
          {/* Specs Grid (Left) */}
          <div className="space-y-6">
            {/* Product Specs */}
            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1 mb-3">
                製品仕様
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-50 rounded border border-gray-100">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                    充填量 (g)
                  </div>
                  <div className="font-bold text-xl flex items-center gap-2">
                    <InlineEdit
                      type="number"
                      value={recipe.filling_quantity}
                      onSave={(val) =>
                        handleRecipeChange("filling_quantity", val)
                      }
                      className="text-right font-bold text-xl min-w-[3rem] justify-end"
                      inputClassName="text-right font-bold text-xl w-20"
                      placeholder="-"
                      suffix="g"
                    />
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded border border-gray-100">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                    表記量
                  </div>
                  <InlineEdit
                    type="number"
                    value={recipe.label_quantity}
                    onSave={(val) =>
                      handleRecipeChange("label_quantity", String(val))
                    }
                    className="font-bold text-xl w-full"
                    inputClassName="font-bold text-xl w-full"
                    placeholder="-"
                    suffix="g"
                  />
                </div>
                <div className="p-3 bg-gray-50 rounded border border-gray-100 col-span-2">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                    保存方法
                  </div>
                  <Select
                    value={recipe.storage_method || ""}
                    onValueChange={(val) =>
                      handleRecipeChange("storage_method", val)
                    }
                  >
                    <SelectTrigger className="h-7 border-none bg-transparent p-0 focus:ring-0 shadow-none font-bold text-xl">
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="常温">常温</SelectItem>
                      <SelectItem value="冷蔵">冷蔵</SelectItem>
                      <SelectItem value="冷凍">冷凍</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            {/* Manufacturing Specs */}
            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1 mb-3">
                製造条件
              </h3>
              <div className="bg-gray-50 p-3 rounded border border-gray-100">
                <div className="mb-3">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                    殺菌・加熱工程
                  </div>
                  <Select
                    value={recipe.sterilization_method || ""}
                    onValueChange={(val) =>
                      handleRecipeChange("sterilization_method", val)
                    }
                  >
                    <SelectTrigger className="h-7 border-none bg-transparent p-0 focus:ring-0 shadow-none font-bold text-lg">
                      <SelectValue placeholder="選択してください" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="レトルト">レトルト</SelectItem>
                      <SelectItem value="乾燥機">乾燥機</SelectItem>
                      <SelectItem value="ホット充填">ホット充填</SelectItem>
                      <SelectItem value="殺菌なし">殺菌なし</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(recipe.sterilization_method === "レトルト" ||
                  recipe.sterilization_method === "乾燥機") && (
                    <div className="flex gap-4 border-t pt-2 border-gray-200">
                      <div className="w-1/2">
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                          温度
                        </div>
                        <div className="flex items-center">
                          <InlineEdit
                            value={recipe.sterilization_temperature}
                            onSave={(val) =>
                              handleRecipeChange("sterilization_temperature", val)
                            }
                            className="font-bold text-lg min-w-[3rem]"
                            inputClassName="font-bold text-lg w-20"
                            placeholder="120"
                            type="number"
                          />
                          <span className="text-sm text-gray-500 ml-1">℃</span>
                        </div>
                      </div>
                      <div className="w-1/2">
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                          時間
                        </div>
                        <div className="flex items-center">
                          <InlineEdit
                            value={recipe.sterilization_time}
                            onSave={(val) =>
                              handleRecipeChange("sterilization_time", val)
                            }
                            className="font-bold text-lg min-w-[3rem]"
                            inputClassName="font-bold text-lg w-20"
                            placeholder="30"
                            type="number"
                          />
                          <span className="text-sm text-gray-500 ml-1">分</span>
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            </div>
          </div>
          {/* Right Column: Pricing & Simulation */}
          <div>
            {/* Pricing Header Card */}
            <div className="bg-gray-900 rounded-xl p-6 text-white mb-6 shadow-lg">
              <div className="flex justify-between items-start mb-2">
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  販売価格 (Selling Price)
                </div>
                <div className="text-xs bg-gray-800 px-2 py-1 rounded text-gray-300 flex items-center gap-1">
                  <span className="text-gray-400">税抜:</span>
                  <span className="font-bold">¥</span>
                  <InlineEdit
                    type="number"
                    value={sellingPriceExTax}
                    onSave={(val) => {
                      const taxExcluded =
                        typeof val === "string" ? parseFloat(val) : val;
                      const taxIncluded = Math.round(taxExcluded * 1.08);
                      handleRecipeChange(
                        "selling_price",
                        isNaN(taxIncluded) ? 0 : taxIncluded,
                      );
                    }}
                    className="font-bold min-w-[30px] justify-end"
                    inputClassName="bg-gray-700 text-white border-none w-16 text-right px-1 h-5 text-xs"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="flex items-baseline justify-end mb-4">
                <span
                  className="text-xs font-bold text-gray-500 mr-1"
                  style={{ alignSelf: "flex-end", marginBottom: "8px" }}
                >
                  税込
                </span>
                <span
                  className="font-medium text-gray-400 mr-1"
                  style={{
                    fontSize: "24px",
                    alignSelf: "flex-end",
                    marginBottom: "4px",
                  }}
                >
                  ¥
                </span>
                <InlineEdit
                  type="number"
                  value={recipe.selling_price}
                  onSave={(val) => handleRecipeChange("selling_price", val)}
                  style={{
                    fontSize: "48px",
                    lineHeight: "1.1",
                    height: "56px",
                  }}
                  className="font-bold tracking-tight text-white text-right w-full max-w-[220px] justify-end"
                  inputClassName="bg-gray-800 text-white border-none text-right px-2"
                  placeholder="0"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-800">
                <div>
                  <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">
                    原価 (Cost)
                  </div>
                  <div className="text-xl font-bold flex items-baseline gap-2">
                    {formatCurrency(totals.cost)}
                    <span className="text-xs font-normal text-gray-500">
                      (
                      {sellingPriceExTax && totals.cost
                        ? ((totals.cost / sellingPriceExTax) * 100).toFixed(1)
                        : "-"}
                      %)
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">
                    粗利益 (Profit)
                  </div>
                  <div
                    className={`text-xl font-bold flex items-baseline justify-end gap-2 ${profit > 0 ? "text-green-400" : "text-red-400"
                      }`}
                  >
                    {formatCurrency(profit)}
                    <span className="text-xs font-normal text-gray-500">
                      ({sellingPriceExTax ? profitRate.toFixed(1) : "-"}%)
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {/* Wholesale Simulation */}
            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">
                卸価格シミュレーション
              </h3>
              <div className="space-y-3">
                {[0.65, 0.7].map((rate) => {
                  const wholesalePrice = recipe.selling_price
                    ? Math.round(recipe.selling_price * rate)
                    : 0;
                  const wholesaleProfit = wholesalePrice - totals.cost;
                  const wholesaleMargin = wholesalePrice
                    ? (wholesaleProfit / wholesalePrice) * 100
                    : 0;

                  return (
                    <div
                      key={rate}
                      className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded">
                          {Math.round(rate * 100)}%
                        </div>
                        <div className="text-sm font-medium text-gray-900">
                          卸値: {formatCurrency(wholesalePrice)}
                        </div>
                      </div>
                      <div
                        className={`text-sm font-bold ${wholesaleProfit > 0 ? "text-gray-700" : "text-red-600"
                          }`}
                      >
                        利益: {formatCurrency(wholesaleProfit)}
                        <span className="text-xs font-normal text-gray-400 ml-1">
                          ({wholesaleMargin.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-12 gap-8">
          {/* Left Column: Ingredients (8 cols) ->
Now Expanded or Scrollable */}
          <div className="col-span-12 print:col-span-12">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h2 className="text-base font-bold text-gray-900 uppercase tracking-wider">
                製造計画（材料表）
              </h2>
              <div className="flex items-center gap-4 text-xs">
                <span className="font-mono text-gray-400">
                  {items.length} FILES
                </span>
              </div>
            </div>
            {/* Batch Settings (Only visible in edit/interact mode, but printed values persist) */}
            <div className="flex gap-4 mb-4 bg-gray-50 p-2 rounded print:hidden">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-gray-500">
                  製造数 A
                </label>
                <Input
                  type="number"
                  value={batchSize1}
                  onChange={(e) => setBatchSize1(parseInt(e.target.value) || 0)}
                  className="h-8 w-20 bg-white"
                />
                <span className="text-xs text-gray-500">個</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-gray-500">
                  製造数 B
                </label>
                <Input
                  type="number"
                  value={batchSize2}
                  onChange={(e) => setBatchSize2(parseInt(e.target.value) || 0)}
                  className="h-8 w-20 bg-white"
                />
                <span className="text-xs text-gray-500">個</span>
              </div>
            </div>
            <div className="space-y-8">
              {groupedItems.map((group, gIdx) => (
                <div key={gIdx} className="break-inside-avoid">
                  <div className="flex justify-between items-center mb-2">
                    <div
                      className={`text-[10px] font-bold px-2 py-0.5 inline-block rounded border ${group.color}`}
                    >
                      {group.title}
                    </div>
                    {isEditing && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs text-gray-500 hover:text-blue-600"
                        onClick={() => addItem(group.type)}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        追加
                      </Button>
                    )}
                  </div>
                  {group.items.length > 0 ? (
                    <table className="w-full text-sm table-fixed">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500">
                          <th className="text-left py-1 w-8 font-normal">#</th>
                          <th className="text-left py-1 w-40 font-normal">
                            名称
                          </th>
                          {/* 1 Unit */}
                          {/* 1 Unit */}
                          <th className="text-right py-1 w-20 font-bold text-gray-800 bg-gray-50">
                            基本(1)
                            {isEditing && (
                              <div className="flex justify-end mt-1 print:hidden">
                                <InlineEdit
                                  type="number"
                                  value={null}
                                  placeholder="%"
                                  onSave={(val) => {
                                    const percent = parseFloat(String(val));
                                    if (val === "") return;
                                    if (percent && percent > 0) {
                                      const scale = percent / 100;
                                      setItems((prev) =>
                                        prev.map((item) => {
                                          // Only update if item belongs to this group
                                          if (item.item_type === group.type) {
                                            const currentUsage =
                                              parseFloat(
                                                String(item.usage_amount),
                                              ) || 0;
                                            const newUsage =
                                              currentUsage * scale;

                                            // Recalculate cost if consistent with handleItemChange logic
                                            let updates: Partial<RecipeItem> = {
                                              usage_amount: newUsage,
                                            };
                                            if (
                                              [
                                                "ingredient",
                                                "intermediate",
                                              ].includes(item.item_type)
                                            ) {
                                              const qty =
                                                parseFloat(
                                                  String(item.unit_quantity),
                                                ) || 0;
                                              const price =
                                                parseFloat(
                                                  String(item.unit_price),
                                                ) || 0;
                                              if (qty !== 0) {
                                                updates.cost = Math.round(
                                                  newUsage * (price / qty),
                                                );
                                              }
                                            }
                                            return { ...item, ...updates };
                                          }
                                          return item;
                                        }),
                                      );
                                      setHasChanges(true);
                                      toast.success(
                                        `${group.title}の使用量を${percent}%に変更しました`,
                                      );
                                    }
                                  }}
                                  className="w-12 text-right bg-white border border-gray-200 rounded px-1 text-xs font-normal"
                                  inputClassName="w-12 text-right text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  suffix="%"
                                />
                              </div>
                            )}
                          </th>
                          {/* Batch 1 */}
                          <th className="text-right py-1 w-28 font-bold text-blue-700 bg-blue-50 border-l border-white">
                            {batchSize1}個分 <br />
                            <span className="text-xs font-normal text-gray-500">
                              使用量 | 袋数
                            </span>
                          </th>
                          {/* Batch 2 */}
                          <th className="text-right py-1 w-28 font-bold text-purple-700 bg-purple-50 border-l border-white">
                            {batchSize2}個分 <br />
                            <span className="text-xs font-normal text-gray-500">
                              使用量 | 袋数
                            </span>
                          </th>
                          {/* Cost */}
                          <th className="text-right py-1 w-20 font-normal text-gray-400">
                            原価(1)
                          </th>
                          {isEditing && <th className="w-8"></th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {group.items.map((item, idx) => {
                          const unitUsage =
                            parseFloat(String(item.usage_amount)) || 0;
                          const unitQty =
                            parseFloat(String(item.unit_quantity)) || 0;
                          const itemCost = parseFloat(String(item.cost)) || 0;
                          const isMaterialGroup =
                            group.type === "material" ||
                            group.type === "expense";

                          // Batch 1 Calcs
                          const b1Usage = unitUsage * batchSize1;
                          const b1Bags = unitQty > 0 ? b1Usage / unitQty : 0;

                          // Batch 2 Calcs
                          const b2Usage = unitUsage * batchSize2;
                          const b2Bags = unitQty > 0 ? b2Usage / unitQty : 0;

                          return (
                            <tr
                              key={item.id}
                              className="group hover:bg-gray-50/50"
                            >
                              <td className="py-2 text-gray-300 align-top">
                                {idx + 1}
                              </td>
                              <td className="py-2 font-medium text-gray-700 align-top pr-2">
                                {isEditing ? (
                                  <ItemNameSelect
                                    candidates={group.candidates}
                                    value={item.item_name}
                                    onSelect={(val) =>
                                      handleItemSelect(item.id, val)
                                    }
                                  />
                                ) : (
                                  <>
                                    <div className="flex items-center gap-2">
                                      {item.item_name}
                                      {isEditing && (['ingredient', 'material'].includes(item.item_type)) && (
                                        <button
                                          onClick={() => handleItemChange(item.id, 'tax_included', !item.tax_included)}
                                          className={`text-[9px] px-1 py-0 rounded font-bold border transition ${item.tax_included !== false ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}
                                          title={item.tax_included !== false ? '現在: 税込 (クリックで税抜へ)' : '現在: 税抜 (クリックで税込へ)'}
                                        >
                                          {item.tax_included !== false ? '込' : '抜'}
                                        </button>
                                      )}
                                      {!isEditing && item.tax_included === false && (['ingredient', 'material'].includes(item.item_type)) && (
                                        <span className="text-[9px] px-1 py-0 rounded font-bold border bg-gray-100 text-gray-400 border-gray-200">税抜</span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-gray-400 font-normal">
                                      {unitQty > 0 &&
                                        !isMaterialGroup &&
                                        group.type !== "product"
                                        ? `(${formatNumber(unitQty, 0)}g/pk)`
                                        : ""}
                                      {group.type === "product" && (
                                        <span className="ml-1 text-[10px] bg-indigo-100 text-indigo-700 px-1 rounded">
                                          商品
                                        </span>
                                      )}
                                    </div>
                                  </>
                                )}
                              </td>
                              {/* 1 Unit Usage */}
                              <td className="py-2 text-right font-mono text-gray-800 bg-gray-50/30 align-top">
                                {!isMaterialGroup ? (
                                  isEditing ? (
                                    <input
                                      type="number"
                                      className="w-full text-right border-b border-gray-200 focus:border-blue-500 outline-none bg-transparent"
                                      value={item.usage_amount || ""}
                                      onChange={(e) =>
                                        handleItemChange(
                                          item.id,
                                          "usage_amount",
                                          e.target.value,
                                        )
                                      }
                                    />
                                  ) : (
                                    <>
                                      <span className="font-bold">
                                        {formatNumber(unitUsage, 1)}
                                      </span>
                                      <span className="text-[10px] text-gray-400 block">
                                        {group.type === "product" || group.type === "intermediate" ? "個" : "g"}
                                      </span>
                                    </>
                                  )
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                              {/* Batch 1 */}
                              <td className="py-2 text-right font-mono text-blue-700 bg-blue-50/30 border-l border-gray-50 align-top">
                                {!isMaterialGroup ? (
                                  <>
                                    <div className="font-bold">
                                      {formatNumber(b1Usage, 0)}
                                      <span className="text-[10px] font-normal ml-0.5">
                                        {group.type === "product" || group.type === "intermediate" ? "個" : "g"}
                                      </span>
                                    </div>
                                    {b1Bags > 0 &&
                                      item.item_type !== "expense" &&
                                      group.type !== "product" && (
                                        <div className="text-[10px] text-blue-500 mt-0.5 font-bold">
                                          {formatNumber(b1Bags, 2)}{" "}
                                          <span className="font-normal opacity-70">
                                            pk
                                          </span>
                                        </div>
                                      )}
                                  </>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                              {/* Batch 2 */}
                              <td className="py-2 text-right font-mono text-purple-700 bg-purple-50/30 border-l border-gray-50 align-top">
                                {!isMaterialGroup ? (
                                  <>
                                    <div className="font-bold">
                                      {formatNumber(b2Usage, 0)}
                                      <span className="text-[10px] font-normal ml-0.5">
                                        g
                                      </span>
                                    </div>
                                    {b2Bags > 0 &&
                                      item.item_type !== "expense" && (
                                        <div className="text-[10px] text-purple-500 mt-0.5 font-bold">
                                          {formatNumber(b2Bags, 2)}{" "}
                                          <span className="font-normal opacity-70">
                                            pk
                                          </span>
                                        </div>
                                      )}
                                  </>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                              <td className="py-2 text-right font-mono text-gray-400 align-top">
                                {isMaterialGroup && isEditing ? (
                                  <input
                                    type="number"
                                    className="w-full text-right border-b border-gray-200 focus:border-blue-500 outline-none bg-transparent"
                                    value={item.cost || ""}
                                    onChange={(e) =>
                                      handleItemChange(
                                        item.id,
                                        "cost",
                                        e.target.value,
                                      )
                                    }
                                  />
                                ) : (
                                  formatCurrency(itemCost)
                                )}
                              </td>
                              {isEditing && (
                                <td className="py-2 text-center align-top">
                                  <button
                                    onClick={() => deleteItem(item.id)}
                                    className="text-gray-400 hover:text-red-500 p-1"
                                    title="削除"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                      {/* Group Subtotal */}
                      <tfoot className="border-t border-gray-100">
                        <tr>
                          <td
                            colSpan={2}
                            className="py-2 text-right text-[10px] text-gray-400 uppercase tracking-wider"
                          >
                            Total
                          </td>
                          <td className="py-2 text-right font-mono font-bold text-gray-700 bg-gray-50/50">
                            {group.type === "ingredient" ||
                              group.type === "intermediate" ||
                              group.type === "product"
                              ? formatNumber(
                                group.items.reduce(
                                  (sum, i) =>
                                    sum +
                                    (parseFloat(String(i.usage_amount)) || 0),
                                  0,
                                ),
                                0,
                              ) + (group.type === "product" || group.type === "intermediate" ? "個" : "g")
                              : "-"}
                          </td>
                          <td className="py-2 text-right font-mono font-bold text-blue-700 bg-blue-50/30 border-l border-gray-50">
                            {group.type === "ingredient" ||
                              group.type === "intermediate" ||
                              group.type === "product"
                              ? formatNumber(
                                group.items.reduce(
                                  (sum, i) =>
                                    sum +
                                    (parseFloat(String(i.usage_amount)) ||
                                      0) *
                                    batchSize1,
                                  0,
                                ),
                                0,
                              ) + (group.type === "product" || group.type === "intermediate" ? "個" : "g")
                              : "-"}
                          </td>
                          <td className="py-2 text-right font-mono font-bold text-purple-700 bg-purple-50/30 border-l border-gray-50">
                            {group.type === "ingredient" ||
                              group.type === "intermediate" ||
                              group.type === "product"
                              ? formatNumber(
                                group.items.reduce(
                                  (sum, i) =>
                                    sum +
                                    (parseFloat(String(i.usage_amount)) ||
                                      0) *
                                    batchSize2,
                                  0,
                                ),
                                0,
                              ) + (group.type === "product" || group.type === "intermediate" ? "個" : "g")
                              : "-"}
                          </td>
                          <td className="py-2 text-right font-mono font-bold text-gray-900">
                            {formatCurrency(
                              group.items.reduce(
                                (sum, i) =>
                                  sum + (parseFloat(String(i.cost)) || 0),
                                0,
                              ),
                            )}
                          </td>
                          {isEditing && <td></td>}
                        </tr>
                      </tfoot>
                    </table>
                  ) : (
                    <div className="text-sm text-gray-300 py-4 text-center border border-dashed rounded bg-gray-50/50">
                      アイテムがありません
                    </div>
                  )}
                  {group.type === "intermediate" && (
                    <div className="mt-4 mb-8 border-t-2 border-double border-gray-200 pt-4 px-2">
                      <div className="flex justify-start items-center gap-8">
                        <div className="text-sm font-bold text-gray-600">全体重量 (原材料 + 中間加工品)</div>
                        <div className="flex gap-12">
                          <div className="text-right">
                            <div className="text-[10px] text-gray-400 uppercase">基本(1)</div>
                            <div className="font-mono font-bold text-lg text-gray-800">
                              {formatNumber(items.reduce((sum, item) => {
                                if (["ingredient", "intermediate", "product"].includes(item.item_type)) {
                                  const usage = parseFloat(String(item.usage_amount)) || 0;
                                  return sum + (item.item_type === "ingredient" ? usage : usage * (item.unit_weight || 0));
                                }
                                return sum;
                              }, 0), 1)}g
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-blue-400 uppercase">{batchSize1}個分</div>
                            <div className="font-mono font-bold text-lg text-blue-700">
                              {formatNumber(items.reduce((sum, item) => {
                                if (["ingredient", "intermediate", "product"].includes(item.item_type)) {
                                  const usage = parseFloat(String(item.usage_amount)) || 0;
                                  const weight = item.item_type === "ingredient" ? usage : usage * (item.unit_weight || 0);
                                  return sum + (weight * batchSize1);
                                }
                                return sum;
                              }, 0), 0)}g
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-purple-400 uppercase">{batchSize2}個分</div>
                            <div className="font-mono font-bold text-lg text-purple-700">
                              {formatNumber(items.reduce((sum, item) => {
                                if (["ingredient", "intermediate", "product"].includes(item.item_type)) {
                                  const usage = parseFloat(String(item.usage_amount)) || 0;
                                  const weight = item.item_type === "ingredient" ? usage : usage * (item.unit_weight || 0);
                                  return sum + (weight * batchSize2);
                                }
                                return sum;
                              }, 0), 0)}g
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-12 gap-8 mt-8 border-t pt-8">
          {/* Bottom Section: Notes & Nutrition (Now Full Width split or separate) */}
          {/* Since table is wide, we move these to bottom */}

          <div className="col-span-12 md:col-span-7 print:col-span-7">
            {/* Manufacturing Notes */}
            <div className="break-inside-avoid bg-gray-50 p-4 rounded border border-gray-100 print:bg-white print:border-l-2 print:border-gray-200 print:border-t-0 print:border-r-0 print:border-b-0 print:rounded-none h-full">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Edit className="w-4 h-4" />
                製造メモ
              </h3>
              <textarea
                className="w-full h-full min-h-[150px] text-sm leading-relaxed bg-transparent border-none resize-none p-0 focus:ring-0 text-gray-700 placeholder:text-gray-300"
                value={recipe.manufacturing_notes || ""}
                onChange={(e) =>
                  setRecipe({ ...recipe, manufacturing_notes: e.target.value })
                }
                onBlur={(e) =>
                  handleRecipeChange("manufacturing_notes", e.target.value)
                }
                placeholder="製造プロセスや注意点を記載..."
              />
            </div>
          </div>
          <div className="col-span-12 md:col-span-5 print:hidden">
            {/* Nutrition */}
            <div className="break-inside-avoid">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 border-b pb-1">
                栄養成分表示
              </h3>
              <NutritionDisplay
                items={items.map((item) => ({
                  item_name: item.item_name,
                  item_type: item.item_type,
                  usage_amount: parseFloat(String(item.usage_amount)) || 0,
                  nutrition: nutritionMap[item.item_name],
                }))}
                compact={true}
                fillingQuantity={Number(recipe.filling_quantity)}
              />
            </div>
          </div>
        </div>
      </main>
      {/* ====== Print-Only Layout ====== */}
      <div className="hidden print:block p-0 m-0 w-full text-black text-sm">
        {/* Print Header */}
        <div className="border-b border-black pb-0 mb-0">
          <h1 className="text-sm font-bold leading-none">{recipe.name}</h1>
          <div className="flex gap-3 text-[9px] text-gray-500">
            <span>カテゴリ: {recipe.category}</span>
            <span>開発日: {recipe.development_date || "-"}</span>
            <span>ID: {recipe.id.split("-")[0]}</span>
          </div>
        </div>
        {/* Print Specs Row */}
        <div className="flex gap-2 mb-0 text-xs">
          <div className="border border-gray-400 rounded px-2 py-0.5">
            <div className="text-[9px] font-bold text-gray-500 mb-0">
              充填量
            </div>
            <div className="text-xs font-bold leading-tight">
              {recipe.filling_quantity ?? "-"} g
            </div>
          </div>
          <div className="border border-gray-400 rounded px-2 py-0.5">
            <div className="text-[9px] font-bold text-gray-500 mb-0">
              表記量
            </div>
            <div className="text-xs font-bold leading-tight">
              {recipe.label_quantity || "-"}
            </div>
          </div>
          <div className="border border-gray-400 rounded px-2 py-0.5">
            <div className="text-[9px] font-bold text-gray-500 mb-0">
              保存方法
            </div>
            <div className="text-xs font-bold leading-tight">
              {recipe.storage_method || "-"}
            </div>
          </div>
          {recipe.sterilization_method && (
            <div className="border border-gray-400 rounded px-2 py-0.5">
              <div className="text-[9px] font-bold text-gray-500 mb-0">
                殺菌
              </div>
              <div className="text-lg font-bold">
                {recipe.sterilization_method}
                {recipe.sterilization_temperature &&
                  ` ${recipe.sterilization_temperature}℃`}
                {recipe.sterilization_time && ` ${recipe.sterilization_time}分`}
              </div>
            </div>
          )}
        </div>
        {/* Print Manufacturing Plan Table */}
        <div className="mb-3">
          <h2 className="text-xs font-bold border-b border-black pb-0 mb-0">
            製造計画（材料表）
          </h2>
          <div className="flex gap-4 mb-0 text-[10px] text-gray-600">
            <span>
              製造数 A: <strong className="text-black">{batchSize1}個</strong>
            </span>
            <span>
              製造数 B: <strong className="text-black">{batchSize2}個</strong>
            </span>
          </div>
        </div>
        {groupedItems
          .filter((g) => g.type !== "material" && g.type !== "expense")
          .map(
            (group, gIdx) =>
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
                        <th className="text-right py-0 w-16 text-[10px]">
                          基本(1)
                        </th>
                        <th className="text-right py-1 w-28">
                          A ({batchSize1})
                        </th>
                        <th className="text-right py-1 w-28">
                          B ({batchSize2})
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((item, idx) => {
                        const unitUsage =
                          parseFloat(String(item.usage_amount)) || 0;
                        const unitQty =
                          parseFloat(String(item.unit_quantity)) || 0;
                        const b1Usage = unitUsage * batchSize1;
                        const b1Bags = unitQty > 0 ? b1Usage / unitQty : 0;
                        const b2Usage = unitUsage * batchSize2;
                        const b2Bags = unitQty > 0 ? b2Usage / unitQty : 0;
                        const unit = (group.type === "product" || group.type === "intermediate") ? "個" : "g";

                        return (
                          <tr
                            key={item.id}
                            className="border-b border-gray-200"
                          >
                            <td className="py-0 text-gray-400 text-[10px]">
                              {idx + 1}
                            </td>
                            <td className="py-0 font-medium text-[10px] leading-tight">
                              {item.item_name}
                              {unitQty > 0 && group.type !== "product" && group.type !== "intermediate" && (
                                <span className="text-gray-400 ml-1">
                                  ({formatNumber(unitQty, 0)}g/pk)
                                </span>
                              )}
                            </td>
                            <td className="py-0 text-right font-mono text-[10px]">
                              {formatNumber(unitUsage, 1)}
                              {unit}
                            </td>
                            <td className="py-0 text-right font-mono">
                              <span className="font-bold">
                                {formatNumber(b1Usage, 0)}
                                {unit}
                              </span>
                              {b1Bags > 0 && group.type !== "product" && group.type !== "intermediate" && (
                                <span className="text-gray-500 ml-1">
                                  ({formatNumber(b1Bags, 2)}pk)
                                </span>
                              )}
                            </td>
                            <td className="py-0 text-right font-mono">
                              <span className="font-bold">
                                {formatNumber(b2Usage, 0)}
                                {unit}
                              </span>
                              {b2Bags > 0 && group.type !== "product" && group.type !== "intermediate" && (
                                <span className="text-gray-500 ml-1">
                                  ({formatNumber(b2Bags, 2)}pk)
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-300 font-bold text-[10px]">
                        <td
                          colSpan={2}
                          className="py-1 text-right text-gray-500"
                        >
                          計
                        </td>
                        <td className="py-0 text-right font-mono text-[10px]">
                          {formatNumber(
                            group.items.reduce(
                              (s, i) =>
                                s + (parseFloat(String(i.usage_amount)) || 0),
                              0,
                            ),
                            0,
                          ) + (group.type === "product" || group.type === "intermediate" ? "個" : "g")}
                        </td>
                        <td className="py-0 text-right font-mono">
                          {formatNumber(
                            group.items.reduce(
                              (s, i) =>
                                s +
                                (parseFloat(String(i.usage_amount)) || 0) *
                                batchSize1,
                              0,
                            ),
                            0,
                          ) + (group.type === "product" || group.type === "intermediate" ? "個" : "g")}
                        </td>
                        <td className="py-0 text-right font-mono">
                          {formatNumber(
                            group.items.reduce(
                              (s, i) =>
                                s +
                                (parseFloat(String(i.usage_amount)) || 0) *
                                batchSize2,
                              0,
                            ),
                            0,
                          ) + (group.type === "product" || group.type === "intermediate" ? "個" : "g")}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  {group.type === "intermediate" && (
                    <div className="mt-1 mb-2 border-t border-black pt-1">
                      <div className="flex justify-between items-center px-1">
                        <div className="text-[10px] font-bold">全体重量 (原材料 + 中間加工品)</div>
                        <div className="flex gap-4">
                          <div className="text-right">
                            <span className="text-[8px] text-gray-500 mr-1 uppercase">基本(1)</span>
                            <span className="font-mono font-bold text-[10px]">
                              {formatNumber(items.reduce((sum, item) => {
                                if (["ingredient", "intermediate", "product"].includes(item.item_type)) {
                                  const usage = parseFloat(String(item.usage_amount)) || 0;
                                  return sum + (item.item_type === "ingredient" ? usage : usage * (item.unit_weight || 0));
                                }
                                return sum;
                              }, 0), 1)}g
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[8px] text-gray-500 mr-1 uppercase">A ({batchSize1})</span>
                            <span className="font-mono font-bold text-[10px]">
                              {formatNumber(items.reduce((sum, item) => {
                                if (["ingredient", "intermediate", "product"].includes(item.item_type)) {
                                  const usage = parseFloat(String(item.usage_amount)) || 0;
                                  const weight = item.item_type === "ingredient" ? usage : usage * (item.unit_weight || 0);
                                  return sum + (weight * batchSize1);
                                }
                                return sum;
                              }, 0), 0)}g
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[8px] text-gray-500 mr-1 uppercase">B ({batchSize2})</span>
                            <span className="font-mono font-bold text-[10px]">
                              {formatNumber(items.reduce((sum, item) => {
                                if (["ingredient", "intermediate", "product"].includes(item.item_type)) {
                                  const usage = parseFloat(String(item.usage_amount)) || 0;
                                  const weight = item.item_type === "ingredient" ? usage : usage * (item.unit_weight || 0);
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

        {/* Print Notes */}
        {recipe.manufacturing_notes && (
          <div className="mt-1 border-t border-gray-300 pt-0">
            <h3 className="text-[10px] font-bold text-gray-500 mb-0">
              製造メモ
            </h3>
            <p className="text-[10px] whitespace-pre-wrap leading-tight">
              {recipe.manufacturing_notes}
            </p>
          </div>
        )}
      </div>
      <style jsx global>
        {`
          @media print {
            @page {
              size: A4 landscape;
              margin: 8mm;
            }
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              background: white;
              font-size: 11px;
            }
            thead {
              display: table-header-group;
            }
            ::-webkit-scrollbar {
              display: none;
            }
          }
        `}
      </style>
    </div>
  );
}
