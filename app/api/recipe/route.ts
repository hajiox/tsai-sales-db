// app/api/recipe/route.ts
// レシピ一覧・作成API

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// GET: レシピ一覧取得
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const category = searchParams.get("category");
        const search = searchParams.get("search");
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "50");
        const offset = (page - 1) * limit;

        let query = supabase
            .from("recipes")
            .select(`
        id,
        name,
        development_date,
        selling_price,
        category,
        is_intermediate,
        series_code,
        jan_code,
        shelf_life,
        storage_method,
        case_quantity,
        case_size,
        lot_size,
        total_cost,
        total_weight,
        production_quantity,
        label_quantity,
        net_content_unit,
        linked_wholesale_product_id,
        linked_oem_product_id,
        recipe_items!recipe_items_recipe_id_fkey(count)
      `, { count: "exact" })
            .order("name")
            .range(offset, offset + limit - 1);

        if (category && category !== "all") {
            query = query.eq("category", category);
        }

        if (search) {
            query = query.ilike("name", `%${search}%`);
        }

        const { data, error, count } = await query;

        if (error) {
            console.error("Recipe fetch error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Calculate profit margin
        const processed = data?.map((r: any) => ({
            ...r,
            category_name: r.category,
            ingredient_count: r.recipe_items?.[0]?.count || 0,
            // 後方互換性: selling_price_incl_tax = selling_price
            selling_price_incl_tax: r.selling_price,
            selling_price_excl_tax: r.selling_price ? Math.round(r.selling_price / 1.08) : null,
            unit_cost: r.total_cost && r.production_quantity
                ? r.total_cost / r.production_quantity
                : r.total_cost || null,
            profit_margin: r.selling_price && r.total_cost
                ? ((r.selling_price - (r.total_cost / (r.production_quantity || 400))) / r.selling_price * 100)
                : null,
        }));

        return NextResponse.json({
            data: processed,
            // 見積連携用: recipesキーでも返す
            recipes: processed,
            pagination: {
                page,
                limit,
                total: count || 0,
                total_pages: Math.ceil((count || 0) / limit),
            },
        });
    } catch (error) {
        console.error("Recipe API error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// POST: 新規レシピ作成
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const { data: recipe, error: recipeError } = await supabase
            .from("recipes")
            .insert({
                name: body.name,
                category_id: body.category_id,
                development_date: body.development_date,
                selling_price_incl_tax: body.selling_price_incl_tax,
                selling_price_excl_tax: body.selling_price_excl_tax,
                production_quantity: body.production_quantity || 400,
                status: body.status || "active",
                source_file: body.source_file,
                source_sheet: body.source_sheet,
            })
            .select()
            .single();

        if (recipeError) {
            console.error("Recipe create error:", recipeError);
            return NextResponse.json({ error: recipeError.message }, { status: 500 });
        }

        // Insert ingredients if provided
        if (body.ingredients && body.ingredients.length > 0) {
            const ingredientData = body.ingredients.map((ing: any, index: number) => ({
                recipe_id: recipe.id,
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

            const { error: ingError } = await supabase
                .from("recipe_ingredients")
                .insert(ingredientData);

            if (ingError) {
                console.error("Ingredient insert error:", ingError);
                // Don't fail the whole request, just log
            }

            // Calculate totals
            const totalCost = ingredientData.reduce((sum: number, ing: any) =>
                sum + (ing.calculated_cost || 0), 0);
            const totalWeight = ingredientData.reduce((sum: number, ing: any) =>
                sum + (ing.usage_amount || 0), 0);

            await supabase
                .from("recipes")
                .update({
                    total_cost: totalCost,
                    unit_cost: totalCost / (body.production_quantity || 400),
                    total_weight: totalWeight,
                })
                .eq("id", recipe.id);
        }

        return NextResponse.json({ data: recipe }, { status: 201 });
    } catch (error) {
        console.error("Recipe create API error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
