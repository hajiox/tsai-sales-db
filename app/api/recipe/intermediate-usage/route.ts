import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET: 中間部品の逆引き（どの親レシピで使われているか）
export async function GET() {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // intermediate_recipe_id が設定されている全アイテムを取得
    const { data, error } = await supabase
        .from("recipe_items")
        .select("intermediate_recipe_id, recipe_id")
        .not("intermediate_recipe_id", "is", null);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 親レシピの名前を一括取得
    const parentIds = [...new Set((data || []).map(d => d.recipe_id))];
    const interIds = [...new Set((data || []).map(d => d.intermediate_recipe_id))];

    if (parentIds.length === 0) {
        return NextResponse.json({ usageMap: {} });
    }

    // 親レシピ名
    const { data: parentRecipes } = await supabase
        .from("recipes")
        .select("id, name")
        .in("id", parentIds);

    // 中間部品レシピ名
    const { data: interRecipes } = await supabase
        .from("recipes")
        .select("id, name")
        .in("id", interIds);

    const parentNameMap: Record<string, string> = {};
    (parentRecipes || []).forEach(r => { parentNameMap[r.id] = r.name; });

    const interNameMap: Record<string, string> = {};
    (interRecipes || []).forEach(r => { interNameMap[r.id] = r.name; });

    // usageMap: { "中間部品名": ["親レシピ1", "親レシピ2", ...] }
    const usageMap: Record<string, string[]> = {};
    (data || []).forEach(item => {
        const interName = interNameMap[item.intermediate_recipe_id];
        const parentName = parentNameMap[item.recipe_id];
        if (interName && parentName) {
            if (!usageMap[interName]) usageMap[interName] = [];
            if (!usageMap[interName].includes(parentName)) {
                usageMap[interName].push(parentName);
            }
        }
    });

    return NextResponse.json({ usageMap });
}
