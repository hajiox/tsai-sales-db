// app/api/recipe/estimates/impact/route.ts
// 材料価格変更時の影響レシピ一覧と原価変動を返す

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { searchParams } = new URL(request.url);
    const ingredientId = searchParams.get("ingredientId");
    const newPrice = parseFloat(searchParams.get("newPrice") || "0");
    const targetTable = searchParams.get("targetTable") || "ingredient"; // "ingredient" or "material"

    if (!ingredientId) {
        return NextResponse.json({ error: "ingredientId is required" }, { status: 400 });
    }

    // 現在の材料の価格を取得
    const table = targetTable === "material" ? "materials" : "ingredients";
    const { data: currentItem } = await supabase
        .from(table)
        .select("id, name, price, unit_quantity")
        .eq("id", ingredientId)
        .single();

    if (!currentItem) {
        return NextResponse.json({ error: "材料が見つかりません" }, { status: 404 });
    }

    const currentPrice = currentItem.price || 0;
    const priceDiff = newPrice - currentPrice;

    // この材料を使っているレシピアイテムを検索
    const idColumn = targetTable === "material" ? "material_id" : "ingredient_id";
    const { data: recipeItems, error } = await supabase
        .from("recipe_items")
        .select("id, recipe_id, item_name, usage_amount, unit_quantity, unit_price, cost, tax_included")
        .eq(idColumn, ingredientId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!recipeItems || recipeItems.length === 0) {
        return NextResponse.json({
            ingredientName: currentItem.name,
            currentPrice,
            newPrice,
            priceDiff,
            affectedRecipes: [],
        });
    }

    // レシピIDの一覧を取得
    const recipeIds = [...new Set(recipeItems.map(ri => ri.recipe_id))];

    const { data: recipes } = await supabase
        .from("recipes")
        .select("id, name, selling_price, is_intermediate")
        .in("id", recipeIds);

    const recipeMap = new Map((recipes || []).map(r => [r.id, r]));

    // レシピごとに影響を計算
    const affectedRecipes = recipeIds.map(recipeId => {
        const recipe = recipeMap.get(recipeId);
        if (!recipe) return null;

        const itemsInRecipe = recipeItems.filter(ri => ri.recipe_id === recipeId);
        
        // この材料による現在の原価合計と新原価合計を計算
        let currentCostFromItem = 0;
        let newCostFromItem = 0;

        for (const ri of itemsInRecipe) {
            const usage = parseFloat(String(ri.usage_amount)) || 0;
            const unitQty = parseFloat(String(ri.unit_quantity)) || 1;

            // 現在の原価（DBに保存されているcost）
            currentCostFromItem += parseFloat(String(ri.cost)) || 0;

            // 新価格での原価を計算
            // usage_amount(g) / unit_quantity(g) × newPrice
            if (unitQty > 0) {
                newCostFromItem += Math.round((usage / unitQty) * newPrice);
            }
        }

        const costDiff = newCostFromItem - currentCostFromItem;

        return {
            recipeId,
            recipeName: recipe.name,
            isIntermediate: recipe.is_intermediate,
            sellingPrice: recipe.selling_price,
            usageItems: itemsInRecipe.map(ri => ({
                itemName: ri.item_name,
                usageAmount: parseFloat(String(ri.usage_amount)) || 0,
            })),
            currentCostFromItem: Math.round(currentCostFromItem),
            newCostFromItem: Math.round(newCostFromItem),
            costDiff: Math.round(costDiff),
        };
    }).filter(Boolean);

    return NextResponse.json({
        ingredientName: currentItem.name,
        currentPrice: Math.round(currentPrice),
        newPrice: Math.round(newPrice),
        priceDiff: Math.round(priceDiff),
        affectedRecipes,
    });
}
