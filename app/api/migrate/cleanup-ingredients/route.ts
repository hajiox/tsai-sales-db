// app/api/migrate/cleanup-ingredients/route.ts
// 【P】と【商品】の食材を整理するマイグレーションAPI

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const logs: string[] = [];

    try {
        // ========================================
        // STEP 1: 【商品】recipe_items を product タイプに変換
        // ========================================
        logs.push("=== STEP 1: 【商品】recipe_items を product タイプに変換 ===");

        // Get all recipe_items that reference 【商品】
        const { data: allRecipeItems } = await supabase
            .from("recipe_items")
            .select("id, recipe_id, item_name, item_type, unit_quantity, unit_price, usage_amount, cost");

        const productRecipeItems = (allRecipeItems || []).filter(
            (ri) => ri.item_name.includes("【商品】")
        );

        // Get all non-intermediate recipes to match against
        const { data: allRecipes } = await supabase
            .from("recipes")
            .select("id, name, total_cost, total_weight")
            .eq("is_intermediate", false);

        for (const ri of productRecipeItems) {
            // Extract the base product name (remove 【商品】prefix)
            const baseName = ri.item_name.replace("【商品】", "").trim();

            // Find matching recipe
            const matchingRecipe = (allRecipes || []).find(
                (r) => r.name === baseName
            );

            if (matchingRecipe) {
                // Update to product type with recipe reference
                const { error } = await supabase
                    .from("recipe_items")
                    .update({
                        item_name: matchingRecipe.name,
                        item_type: "product",
                        unit_quantity: 1,
                        unit_price: matchingRecipe.total_cost || 0,
                        unit_weight: matchingRecipe.total_weight || 0,
                        // cost stays: usage_amount * total_cost
                        cost: (ri.usage_amount || 0) * (matchingRecipe.total_cost || 0),
                    })
                    .eq("id", ri.id);

                if (error) {
                    logs.push(`  ❌ ${ri.item_name} -> 更新失敗: ${error.message}`);
                } else {
                    logs.push(
                        `  ✅ ${ri.item_name} -> product「${matchingRecipe.name}」×${ri.usage_amount} (原価: ${((ri.usage_amount || 0) * (matchingRecipe.total_cost || 0)).toFixed(2)})`
                    );
                }
            } else {
                logs.push(`  ⚠️ ${ri.item_name} -> 対応レシピ「${baseName}」が見つかりません（スキップ）`);
            }
        }

        // ========================================
        // STEP 2: 【P】recipe_items を intermediate タイプに統一
        // ========================================
        logs.push("\n=== STEP 2: 【P】recipe_items の item_type を intermediate に統一 ===");

        // Get all intermediate recipes
        const { data: intermediateRecipes } = await supabase
            .from("recipes")
            .select("id, name, total_cost, total_weight")
            .eq("is_intermediate", true);

        const pRecipeItems = (allRecipeItems || []).filter(
            (ri) => ri.item_name.includes("【P】") && ri.item_type === "ingredient"
        );

        for (const ri of pRecipeItems) {
            // Find matching intermediate recipe
            const matchingRecipe = (intermediateRecipes || []).find(
                (r) => r.name === ri.item_name
            );

            if (matchingRecipe) {
                const { error } = await supabase
                    .from("recipe_items")
                    .update({
                        item_type: "intermediate",
                        unit_quantity: 1,
                        unit_price: matchingRecipe.total_cost || 0,
                        unit_weight: matchingRecipe.total_weight || 0,
                    })
                    .eq("id", ri.id);

                if (error) {
                    logs.push(`  ❌ ${ri.item_name} -> 更新失敗: ${error.message}`);
                } else {
                    logs.push(`  ✅ ${ri.item_name} -> intermediate に変更（レシピ一致）`);
                }
            } else {
                // No matching recipe - just change type to intermediate, keep existing data
                const { error } = await supabase
                    .from("recipe_items")
                    .update({ item_type: "intermediate" })
                    .eq("id", ri.id);

                if (error) {
                    logs.push(`  ❌ ${ri.item_name} -> 更新失敗: ${error.message}`);
                } else {
                    logs.push(`  ⚠️ ${ri.item_name} -> intermediate に変更（対応レシピなし、データ維持）`);
                }
            }
        }

        // ========================================
        // STEP 3: 【P】食材を ingredients テーブルから削除
        // ========================================
        logs.push("\n=== STEP 3: 【P】食材を ingredients テーブルから削除 ===");

        const { data: pIngredients } = await supabase
            .from("ingredients")
            .select("id, name")
            .like("name", "%【P】%");

        if (pIngredients && pIngredients.length > 0) {
            const pIds = pIngredients.map((i) => i.id);
            const { error } = await supabase
                .from("ingredients")
                .delete()
                .in("id", pIds);

            if (error) {
                logs.push(`  ❌ 削除失敗: ${error.message}`);
            } else {
                logs.push(`  ✅ ${pIngredients.length}件の【P】食材を削除`);
                pIngredients.forEach((i) => logs.push(`    - ${i.name}`));
            }
        }

        // ========================================
        // STEP 4: 【商品】食材を ingredients テーブルから削除
        // ========================================
        logs.push("\n=== STEP 4: 【商品】食材を ingredients テーブルから削除 ===");

        const { data: productIngredients } = await supabase
            .from("ingredients")
            .select("id, name")
            .like("name", "%【商品】%");

        if (productIngredients && productIngredients.length > 0) {
            const productIds = productIngredients.map((i) => i.id);
            const { error } = await supabase
                .from("ingredients")
                .delete()
                .in("id", productIds);

            if (error) {
                logs.push(`  ❌ 削除失敗: ${error.message}`);
            } else {
                logs.push(`  ✅ ${productIngredients.length}件の【商品】食材を削除`);
                productIngredients.forEach((i) => logs.push(`    - ${i.name}`));
            }
        }

        // ========================================
        // Summary
        // ========================================
        const { data: remainingIngredients } = await supabase
            .from("ingredients")
            .select("id", { count: "exact" });

        logs.push(`\n=== 完了 ===`);
        logs.push(`残り食材数: ${remainingIngredients?.length || 0}件`);

        return NextResponse.json({
            success: true,
            logs,
        });
    } catch (error: any) {
        logs.push(`\n❌ エラー: ${error.message}`);
        return NextResponse.json(
            { success: false, error: error.message, logs },
            { status: 500 }
        );
    }
}
