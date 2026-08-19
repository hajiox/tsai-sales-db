import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type DiningItemRow = {
  id: string;
  name: string;
  item_type: "food" | "material";
  purchase_quantity: number | string;
  yield_quantity: number | string;
  price_incl_tax: number | string;
  unit: string;
  notes: string | null;
  source_file: string | null;
  source_sheet: string | null;
  source_reference: string | null;
  sort_order: number;
};

type DiningRecipeRow = {
  id: string;
  name: string;
  menu_group: string | null;
  selling_price: number | string;
  serving_yield: number | string;
  serving_unit: string;
  is_intermediate: boolean;
  is_active: boolean;
  notes: string | null;
  source_file: string | null;
  source_sheet: string | null;
  source_reference: string | null;
  sort_order: number;
};

type DiningRecipeItemRow = {
  id: string;
  recipe_id: string;
  dining_item_id: string | null;
  intermediate_recipe_id: string | null;
  quantity: number | string;
  unit: string;
  notes: string | null;
  sort_order: number;
};

type CostStatus = "complete" | "needs_review" | "recipe_missing" | "price_missing" | "selling_price_missing";

const asNumber = (value: unknown) => Number(value || 0);

async function loadDiningData() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const [recipesResult, itemsResult, recipeItemsResult] = await Promise.all([
    supabase.from("dining_recipes").select("*").order("sort_order").order("name"),
    supabase.from("dining_items").select("*").order("sort_order").order("name"),
    supabase.from("dining_recipe_items").select("*").order("sort_order"),
  ]);

  if (recipesResult.error) throw recipesResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (recipeItemsResult.error) throw recipeItemsResult.error;

  const recipes = (recipesResult.data || []) as DiningRecipeRow[];
  const items = (itemsResult.data || []) as DiningItemRow[];
  const recipeItems = (recipeItemsResult.data || []) as DiningRecipeItemRow[];
  const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const recipeItemsMap = new Map<string, DiningRecipeItemRow[]>();

  recipeItems.forEach((item) => {
    const current = recipeItemsMap.get(item.recipe_id) || [];
    current.push(item);
    recipeItemsMap.set(item.recipe_id, current);
  });

  type RecipeCalculation = { batchCost: number; unitCost: number };
  const memo = new Map<string, RecipeCalculation>();
  const calculateRecipe: (recipeId: string, trail?: Set<string>) => RecipeCalculation = (recipeId, trail = new Set<string>()) => {
    const cached = memo.get(recipeId);
    if (cached) return cached;
    if (trail.has(recipeId)) return { batchCost: 0, unitCost: 0 };

    const recipe = recipeMap.get(recipeId);
    if (!recipe) return { batchCost: 0, unitCost: 0 };

    const nextTrail = new Set(trail);
    nextTrail.add(recipeId);
    const batchCost: number = (recipeItemsMap.get(recipeId) || []).reduce<number>((sum, row) => {
      const quantity = asNumber(row.quantity);
      if (row.dining_item_id) {
        const item = itemMap.get(row.dining_item_id);
        if (!item) return sum;
        const yieldQuantity = asNumber(item.yield_quantity);
        return sum + (yieldQuantity > 0 ? asNumber(item.price_incl_tax) / yieldQuantity * quantity : 0);
      }
      if (row.intermediate_recipe_id) {
        return sum + calculateRecipe(row.intermediate_recipe_id, nextTrail).unitCost * quantity;
      }
      return sum;
    }, 0);
    const servingYield = asNumber(recipe.serving_yield);
    const result: RecipeCalculation = { batchCost, unitCost: servingYield > 0 ? batchCost / servingYield : 0 };
    memo.set(recipeId, result);
    return result;
  };

  const enrichedRecipes = recipes.map((recipe) => {
    const calculation = calculateRecipe(recipe.id);
    const sellingPrice = asNumber(recipe.selling_price);
    const detailedItems = (recipeItemsMap.get(recipe.id) || []).map((row) => {
      const master = row.dining_item_id ? itemMap.get(row.dining_item_id) : null;
      const intermediate = row.intermediate_recipe_id ? recipeMap.get(row.intermediate_recipe_id) : null;
      const unitCost = master
        ? asNumber(master.yield_quantity) > 0
          ? asNumber(master.price_incl_tax) / asNumber(master.yield_quantity)
          : 0
        : row.intermediate_recipe_id
          ? calculateRecipe(row.intermediate_recipe_id).unitCost
          : 0;
      return {
        ...row,
        quantity: asNumber(row.quantity),
        source_name: master?.name || intermediate?.name || "未設定",
        source_type: master ? master.item_type : "intermediate",
        unit_cost: unitCost,
        calculated_cost: unitCost * asNumber(row.quantity),
        price_missing: Boolean(
          master
          && asNumber(master.price_incl_tax) <= 0
          && !/(?:水|煮汁)/.test(master.name)
          && !/(?:原価0|提供品|無償提供|支給品)/.test(master.notes || ""),
        ),
      };
    });

    let costStatus: CostStatus = "complete";
    if (!recipe.is_intermediate && detailedItems.length === 0) {
      costStatus = "recipe_missing";
    } else if (detailedItems.some((item) => item.price_missing)) {
      costStatus = "price_missing";
    } else if (!recipe.is_intermediate && sellingPrice <= 0) {
      costStatus = "selling_price_missing";
    } else if (/(?:概算|未定量|仮配合|要確認)/.test(recipe.notes || "")
      || detailedItems.some((item) => /(?:概算|未定量|仮配合|要確認)/.test(item.notes || ""))) {
      costStatus = "needs_review";
    }

    return {
      ...recipe,
      selling_price: sellingPrice,
      serving_yield: asNumber(recipe.serving_yield),
      calculated_cost: calculation.batchCost,
      unit_cost: calculation.unitCost,
      cost_rate: sellingPrice > 0 ? calculation.batchCost / sellingPrice * 100 : 0,
      gross_profit: sellingPrice - calculation.batchCost,
      cost_status: costStatus,
      recipe_items: detailedItems,
    };
  });

  return {
    recipes: enrichedRecipes.filter((recipe) => !recipe.is_intermediate && recipe.is_active),
    intermediates: enrichedRecipes.filter((recipe) => recipe.is_intermediate),
    items: items.map((item) => ({
      ...item,
      purchase_quantity: asNumber(item.purchase_quantity),
      yield_quantity: asNumber(item.yield_quantity),
      price_incl_tax: asNumber(item.price_incl_tax),
      unit_cost: asNumber(item.yield_quantity) > 0
        ? asNumber(item.price_incl_tax) / asNumber(item.yield_quantity)
        : 0,
    })),
  };
}

export async function GET(request: NextRequest) {
  try {
    const data = await loadDiningData();
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json(data);

    const recipe = [...data.recipes, ...data.intermediates].find((row) => row.id === id);
    if (!recipe) return NextResponse.json({ error: "メニューレシピが見つかりません" }, { status: 404 });
    return NextResponse.json({ recipe, items: data.items, intermediates: data.intermediates });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const body = await request.json();
    if (body.action === "create_recipe") {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ error: "メニュー名を入力してください" }, { status: 400 });
      const { data, error } = await supabase
        .from("dining_recipes")
        .insert({
          name,
          menu_group: body.menu_group || null,
          selling_price: asNumber(body.selling_price),
          serving_yield: asNumber(body.serving_yield) || 1,
          serving_unit: body.serving_unit || "食",
          is_intermediate: body.is_intermediate === true,
          is_active: body.is_active !== false,
          notes: body.notes || null,
          sort_order: asNumber(body.sort_order),
        })
        .select("id")
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, id: data.id });
    }

    if (body.action === "add_item") {
      if (!body.recipe_id || (!body.dining_item_id && !body.intermediate_recipe_id)) {
        return NextResponse.json({ error: "レシピと追加する材料を選択してください" }, { status: 400 });
      }
      const { data: maxRows, error: maxError } = await supabase
        .from("dining_recipe_items")
        .select("sort_order")
        .eq("recipe_id", body.recipe_id)
        .order("sort_order", { ascending: false })
        .limit(1);
      if (maxError) throw maxError;
      const nextSort = (maxRows?.[0]?.sort_order || 0) + 1;
      const { data, error } = await supabase
        .from("dining_recipe_items")
        .insert({
          recipe_id: body.recipe_id,
          dining_item_id: body.dining_item_id || null,
          intermediate_recipe_id: body.intermediate_recipe_id || null,
          quantity: asNumber(body.quantity),
          unit: body.unit || "g",
          notes: body.notes || null,
          sort_order: nextSort,
        })
        .select("id")
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, id: data.id });
    }

    return NextResponse.json({ error: "未対応の操作です" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const body = await request.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });

    if (body.entity === "recipe") {
      const allowed = ["name", "menu_group", "selling_price", "serving_yield", "serving_unit", "notes", "sort_order", "is_active"];
      const updates = Object.fromEntries(allowed.filter((key) => key in body.data).map((key) => [key, body.data[key]]));
      const { error } = await supabase.from("dining_recipes").update(updates).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (body.entity === "recipe_item") {
      const allowed = ["dining_item_id", "intermediate_recipe_id", "quantity", "unit", "notes", "sort_order"];
      const updates = Object.fromEntries(allowed.filter((key) => key in body.data).map((key) => [key, body.data[key]]));
      const { error } = await supabase.from("dining_recipe_items").update(updates).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "更新対象が不正です" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const id = request.nextUrl.searchParams.get("id");
    const entity = request.nextUrl.searchParams.get("entity");
    if (!id) return NextResponse.json({ error: "IDが必要です" }, { status: 400 });
    const table = entity === "recipe" ? "dining_recipes" : "dining_recipe_items";
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
