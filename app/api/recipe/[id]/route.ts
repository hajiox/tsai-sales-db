// app/api/recipe/[id]/route.ts
// レシピ詳細・更新・削除API

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// GET: レシピ詳細取得
export async function GET(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const { data, error } = await supabase
            .from("recipes")
            .select(`
        *,
        category:recipe_categories(*),
        ingredients:recipe_ingredients(
          *,
          ingredient:ingredients(*)
        )
      `)
            .eq("id", params.id)
            .single();

        if (error) {
            if (error.code === "PGRST116") {
                return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
            }
            console.error("Recipe fetch error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Calculate nutrition totals
        const nutritionTotals = {
            calories: 0,
            protein: 0,
            fat: 0,
            carbohydrate: 0,
            sodium: 0,
        };

        data.ingredients?.forEach((ing: any) => {
            if (ing.calories) nutritionTotals.calories += ing.calories;
            if (ing.protein) nutritionTotals.protein += ing.protein;
            if (ing.fat) nutritionTotals.fat += ing.fat;
            if (ing.carbohydrate) nutritionTotals.carbohydrate += ing.carbohydrate;
            if (ing.sodium) nutritionTotals.sodium += ing.sodium;
        });

        return NextResponse.json({
            data: {
                ...data,
                nutrition_totals: nutritionTotals,
            },
        });
    } catch (error) {
        console.error("Recipe detail API error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// PUT: レシピ更新
export async function PUT(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const body = await request.json();

        const { data: recipe, error: recipeError } = await supabase
            .from("recipes")
            .update({
                name: body.name,
                category_id: body.category_id,
                development_date: body.development_date,
                selling_price_incl_tax: body.selling_price_incl_tax,
                selling_price_excl_tax: body.selling_price_excl_tax,
                production_quantity: body.production_quantity,
                status: body.status,
                updated_at: new Date().toISOString(),
            })
            .eq("id", params.id)
            .select()
            .single();

        if (recipeError) {
            console.error("Recipe update error:", recipeError);
            return NextResponse.json({ error: recipeError.message }, { status: 500 });
        }

        // Update ingredients if provided
        if (body.ingredients) {
            // Delete existing ingredients
            await supabase
                .from("recipe_ingredients")
                .delete()
                .eq("recipe_id", params.id);

            // Insert new ingredients
            if (body.ingredients.length > 0) {
                const ingredientData = body.ingredients.map((ing: any, index: number) => ({
                    recipe_id: params.id,
                    ingredient_id: ing.ingredient_id,
                    ingredient_name: ing.ingredient_name,
                    usage_amount: ing.usage_amount,
                    calculated_cost: ing.calculated_cost,
                    percentage: ing.percentage,
                    display_order: index + 1,
                    calories: ing.calories,
                    protein: ing.protein,
                    fat: ing.fat,
                    carbohydrate: ing.carbohydrate,
                    sodium: ing.sodium,
                }));

                await supabase
                    .from("recipe_ingredients")
                    .insert(ingredientData);

                // Recalculate totals
                const totalCost = ingredientData.reduce((sum: number, ing: any) =>
                    sum + (ing.calculated_cost || 0), 0);
                const totalWeight = ingredientData.reduce((sum: number, ing: any) =>
                    sum + (ing.usage_amount || 0), 0);

                await supabase
                    .from("recipes")
                    .update({
                        total_cost: totalCost,
                        unit_cost: totalCost / (body.production_quantity || recipe.production_quantity || 400),
                        total_weight: totalWeight,
                    })
                    .eq("id", params.id);
            }
        }

        return NextResponse.json({ data: recipe });
    } catch (error) {
        console.error("Recipe update API error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// DELETE: レシピ削除
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // recipe_ingredients will be deleted by CASCADE
        const { error } = await supabase
            .from("recipes")
            .delete()
            .eq("id", params.id);

        if (error) {
            console.error("Recipe delete error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Recipe delete API error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
