// scripts/create-recipe-tables.ts
// レシピテーブル作成スクリプト

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing environment variables");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTables() {
    console.log("Creating recipe tables...");

    // 1. recipe_categories テーブル
    const { error: catError } = await supabase.rpc("exec_sql", {
        sql: `
      CREATE TABLE IF NOT EXISTS recipe_categories (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `,
    });

    if (catError) {
        console.log("Using insert approach for categories...");
    }

    // まず既存のカテゴリを確認
    const { data: existingCats } = await supabase
        .from("recipe_categories")
        .select("name");

    if (!existingCats || existingCats.length === 0) {
        // カテゴリ作成
        const categories = [
            { name: "ネット専用", description: "ネット販売専用商品" },
            { name: "Shopee台湾", description: "Shopee台湾向け商品" },
            { name: "霊山", description: "霊山工場製造商品" },
            { name: "季の郷湯ら里", description: "季の郷湯ら里向け商品" },
            { name: "裏磐梯", description: "裏磐梯向け商品" },
            { name: "その他", description: "その他のカテゴリ" },
        ];

        for (const cat of categories) {
            const { error } = await supabase.from("recipe_categories").insert(cat);
            if (error && !error.message.includes("duplicate")) {
                console.error(`Failed to insert category ${cat.name}:`, error.message);
            } else {
                console.log(`✓ Category: ${cat.name}`);
            }
        }
    } else {
        console.log("Categories already exist:", existingCats.length);
    }

    // 材料カテゴリ
    const { data: existingIngCats } = await supabase
        .from("ingredient_categories")
        .select("name");

    if (!existingIngCats || existingIngCats.length === 0) {
        const ingCategories = [
            { name: "肉類" },
            { name: "野菜・果物" },
            { name: "調味料" },
            { name: "油脂類" },
            { name: "粉類" },
            { name: "スパイス" },
            { name: "資材" },
            { name: "その他" },
        ];

        for (const cat of ingCategories) {
            const { error } = await supabase.from("ingredient_categories").insert(cat);
            if (error && !error.message.includes("duplicate")) {
                console.error(`Failed to insert ingredient category ${cat.name}:`, error.message);
            } else {
                console.log(`✓ Ingredient Category: ${cat.name}`);
            }
        }
    } else {
        console.log("Ingredient categories already exist:", existingIngCats.length);
    }

    console.log("Done!");
}

createTables().catch(console.error);
