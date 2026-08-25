import { NextRequest, NextResponse } from "next/server";
import { getLabelCheckAdminClient, getLabelCheckUserEmail } from "@/lib/label-check/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = new Set(["ネット専用", "自社", "OEM"]);

export async function GET(request: NextRequest) {
  const email = await getLabelCheckUserEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = getLabelCheckAdminClient();
    const id = request.nextUrl.searchParams.get("id")?.trim();
    if (id) {
      const { data: recipe, error } = await supabase
        .from("recipes")
        .select("id, name, category, shelf_life, raw_materials_ocr")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!recipe) return NextResponse.json({ error: "レシピが見つかりません" }, { status: 404 });

      const { data: ingredients } = await supabase
        .from("recipe_ingredients")
        .select("ingredients(name, raw_materials)")
        .eq("recipe_id", id)
        .limit(30);
      const ingredientRows = (ingredients || []) as unknown as Array<{
        ingredients: { name: string; raw_materials: string | null } | null;
      }>;
      return NextResponse.json({
        recipe: {
          ...recipe,
          ingredient_names: ingredientRows.map((row) => row.ingredients?.name).filter(Boolean),
          has_raw_materials: Boolean(recipe.raw_materials_ocr) || ingredientRows.some((row) => Boolean(row.ingredients?.raw_materials)),
        },
      });
    }

    const categoryParam = request.nextUrl.searchParams.get("category")?.trim() || "ネット専用";
    const category = CATEGORIES.has(categoryParam) ? categoryParam : "ネット専用";
    const queryText = request.nextUrl.searchParams.get("q")?.trim().slice(0, 100) || "";
    let query = supabase
      .from("recipes")
      .select("id, name, category, shelf_life, raw_materials_ocr")
      .eq("category", category)
      .order("name")
      .limit(80);
    if (queryText) query = query.ilike("name", `%${escapeLike(queryText)}%`);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ recipes: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "レシピを取得できません";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function escapeLike(value: string) {
  return value.replace(/[%,_()]/g, " ").replace(/\s+/g, " ").trim();
}
