// scripts/import-ingredients.ts
// レシピ材料から材料マスターを抽出してインポート

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://zrerpexdsaxqztqqrwwv.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyZXJwZXhkc2F4cXp0cXFyd3d2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTM2MDM5OCwiZXhwIjoyMDY0OTM2Mzk4fQ.t_EEN1j29ofXe20utLIV2GTzpEfu0dK8IZ9ZrrNU39Q";

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("=== Importing Ingredients from Recipe Data ===\n");

    // 1. まずカテゴリを確認・作成
    const categories = [
        { name: "肉類" },
        { name: "野菜・果物" },
        { name: "調味料" },
        { name: "油脂類" },
        { name: "粉類" },
        { name: "スパイス" },
        { name: "資材" },
        { name: "その他" },
    ];

    console.log("Creating ingredient categories...");
    for (const cat of categories) {
        const { data: existing } = await supabase
            .from("ingredient_categories")
            .select("id")
            .eq("name", cat.name)
            .single();

        if (!existing) {
            await supabase.from("ingredient_categories").insert(cat);
            console.log(`  ✓ Created: ${cat.name}`);
        }
    }

    // カテゴリマップ取得
    const { data: catData } = await supabase
        .from("ingredient_categories")
        .select("*");
    const categoryMap = new Map(catData?.map(c => [c.name, c.id]) || []);

    // デフォルトカテゴリ
    const defaultCategoryId = categoryMap.get("その他");

    // 2. recipe_ingredientsからユニークな材料を抽出
    console.log("\nExtracting unique ingredients from recipes...");

    const { data: recipeIngredients, error } = await supabase
        .from("recipe_ingredients")
        .select("ingredient_name, usage_amount, calculated_cost, calories, protein, fat, carbohydrate, sodium");

    if (error) {
        console.error("Error fetching recipe ingredients:", error);
        return;
    }

    // 材料名でグループ化して平均値を計算
    const ingredientMap = new Map<string, {
        count: number;
        totalCalories: number;
        totalProtein: number;
        totalFat: number;
        totalCarb: number;
        totalSodium: number;
    }>();

    for (const ri of recipeIngredients || []) {
        if (!ri.ingredient_name) continue;

        const name = ri.ingredient_name.trim();
        if (!name) continue;

        const existing = ingredientMap.get(name) || {
            count: 0,
            totalCalories: 0,
            totalProtein: 0,
            totalFat: 0,
            totalCarb: 0,
            totalSodium: 0,
        };

        existing.count++;
        if (ri.calories) existing.totalCalories += ri.calories;
        if (ri.protein) existing.totalProtein += ri.protein;
        if (ri.fat) existing.totalFat += ri.fat;
        if (ri.carbohydrate) existing.totalCarb += ri.carbohydrate;
        if (ri.sodium) existing.totalSodium += ri.sodium;

        ingredientMap.set(name, existing);
    }

    console.log(`Found ${ingredientMap.size} unique ingredients`);

    // 3. 材料マスターにインサート
    console.log("\nInserting into ingredients table...");

    let inserted = 0;
    let skipped = 0;

    for (const [name, data] of ingredientMap) {
        // 既存チェック
        const { data: existing } = await supabase
            .from("ingredients")
            .select("id")
            .eq("name", name)
            .single();

        if (existing) {
            skipped++;
            continue;
        }

        // カテゴリ推定
        let categoryId = defaultCategoryId;
        const nameLower = name.toLowerCase();

        if (nameLower.includes("豚") || nameLower.includes("鶏") || nameLower.includes("牛") ||
            nameLower.includes("肉") || nameLower.includes("ベーコン") || nameLower.includes("ハム")) {
            categoryId = categoryMap.get("肉類");
        } else if (nameLower.includes("野菜") || nameLower.includes("玉ねぎ") || nameLower.includes("にんじん") ||
            nameLower.includes("トマト") || nameLower.includes("りんご") || nameLower.includes("もも")) {
            categoryId = categoryMap.get("野菜・果物");
        } else if (nameLower.includes("醤油") || nameLower.includes("みりん") || nameLower.includes("酒") ||
            nameLower.includes("塩") || nameLower.includes("砂糖") || nameLower.includes("味噌") ||
            nameLower.includes("ソース") || nameLower.includes("酢")) {
            categoryId = categoryMap.get("調味料");
        } else if (nameLower.includes("油") || nameLower.includes("オイル") || nameLower.includes("バター")) {
            categoryId = categoryMap.get("油脂類");
        } else if (nameLower.includes("粉") || nameLower.includes("澱粉") || nameLower.includes("片栗")) {
            categoryId = categoryMap.get("粉類");
        } else if (nameLower.includes("胡椒") || nameLower.includes("ペッパー") || nameLower.includes("スパイス") ||
            nameLower.includes("カレー") || nameLower.includes("唐辛子")) {
            categoryId = categoryMap.get("スパイス");
        } else if (nameLower.includes("袋") || nameLower.includes("容器") || nameLower.includes("パック") ||
            nameLower.includes("ラベル") || nameLower.includes("シール")) {
            categoryId = categoryMap.get("資材");
        }

        // 平均栄養値を計算
        const avgCalories = data.count > 0 ? data.totalCalories / data.count : null;
        const avgProtein = data.count > 0 ? data.totalProtein / data.count : null;
        const avgFat = data.count > 0 ? data.totalFat / data.count : null;
        const avgCarb = data.count > 0 ? data.totalCarb / data.count : null;
        const avgSodium = data.count > 0 ? data.totalSodium / data.count : null;

        const { error: insertError } = await supabase
            .from("ingredients")
            .insert({
                name,
                category_id: categoryId,
                unit_quantity: 1000, // デフォルト1kg
                calories: avgCalories,
                protein: avgProtein,
                fat: avgFat,
                carbohydrate: avgCarb,
                sodium: avgSodium,
            });

        if (insertError) {
            console.error(`  ✗ Error inserting ${name}:`, insertError.message);
        } else {
            inserted++;
            if (inserted % 50 === 0) {
                console.log(`  ... ${inserted} ingredients inserted`);
            }
        }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Inserted: ${inserted}`);
    console.log(`Skipped (already exists): ${skipped}`);
    console.log(`Total unique ingredients: ${ingredientMap.size}`);
}

main().catch(console.error);
