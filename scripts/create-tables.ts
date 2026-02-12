// scripts/create-tables.ts
// テーブル作成スクリプト

import { createClient } from "@supabase/supabase-js";

// Supabase接続情報
const supabaseUrl = "https://zrerpexdsaxqztqqrwwv.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyZXJwZXhkc2F4cXp0cXFyd3d2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTM2MDM5OCwiZXhwIjoyMDY0OTM2Mzk4fQ.t_EEN1j29ofXe20utLIV2GTzpEfu0dK8IZ9ZrrNU39Q";

const supabase = createClient(supabaseUrl, supabaseKey);

const CREATE_TABLES_SQL = `
-- 1. レシピカテゴリテーブル
CREATE TABLE IF NOT EXISTS recipe_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 材料カテゴリテーブル
CREATE TABLE IF NOT EXISTS ingredient_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 材料マスターテーブル
CREATE TABLE IF NOT EXISTS ingredients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id UUID REFERENCES ingredient_categories(id),
    name VARCHAR(200) NOT NULL,
    unit_quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    price_incl_tax DECIMAL(10,2),
    price_excl_tax DECIMAL(10,2),
    price_per_gram DECIMAL(10,6),
    calories DECIMAL(10,2),
    protein DECIMAL(10,2),
    fat DECIMAL(10,2),
    carbohydrate DECIMAL(10,2),
    sodium DECIMAL(10,2),
    supplier VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. レシピテーブル
CREATE TABLE IF NOT EXISTS recipes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id UUID REFERENCES recipe_categories(id),
    name VARCHAR(200) NOT NULL,
    development_date DATE,
    selling_price_incl_tax DECIMAL(10,2),
    selling_price_excl_tax DECIMAL(10,2),
    production_quantity INTEGER DEFAULT 400,
    total_cost DECIMAL(10,2),
    unit_cost DECIMAL(10,2),
    total_weight DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'active',
    source_file VARCHAR(200),
    source_sheet VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. レシピ材料関連テーブル
CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES ingredients(id),
    ingredient_name VARCHAR(200),
    usage_amount DECIMAL(10,4),
    calculated_cost DECIMAL(10,4),
    percentage DECIMAL(5,2),
    display_order INTEGER,
    calories DECIMAL(10,2),
    protein DECIMAL(10,2),
    fat DECIMAL(10,2),
    carbohydrate DECIMAL(10,2),
    sodium DECIMAL(10,2)
);
`;

async function createTables() {
    console.log("Creating tables...");

    // Supabase RPCでSQL実行（管理者権限が必要）
    // RPCが使えない場合は直接REST APIを使う

    // テーブルが存在するかチェック
    const { data: existingTables, error: checkError } = await supabase
        .from("recipe_categories")
        .select("id")
        .limit(1);

    if (!checkError) {
        console.log("Tables already exist. Checking data...");

        // カテゴリデータを確認
        const { data: categories } = await supabase
            .from("recipe_categories")
            .select("*");

        if (!categories || categories.length === 0) {
            console.log("Inserting category data...");
            await insertCategories();
        } else {
            console.log(`Found ${categories.length} categories`);
        }
        return;
    }

    console.log("Tables do not exist. Please run the SQL in Supabase Dashboard.");
    console.log("\nSQL to execute:");
    console.log(CREATE_TABLES_SQL);
}

async function insertCategories() {
    // レシピカテゴリ
    const recipeCategories = [
        { name: "ネット専用", description: "ネット販売専用商品" },
        { name: "Shopee台湾", description: "Shopee台湾向け商品" },
        { name: "霊山", description: "霊山工場製造商品" },
        { name: "季の郷湯ら里", description: "季の郷湯ら里向け商品" },
        { name: "裏磐梯", description: "裏磐梯向け商品" },
        { name: "その他", description: "その他のカテゴリ" },
    ];

    for (const cat of recipeCategories) {
        const { error } = await supabase
            .from("recipe_categories")
            .upsert(cat, { onConflict: "name" });
        if (!error) {
            console.log(`  ✓ Category: ${cat.name}`);
        }
    }

    // 材料カテゴリ
    const ingredientCategories = [
        { name: "肉類" },
        { name: "野菜・果物" },
        { name: "調味料" },
        { name: "油脂類" },
        { name: "粉類" },
        { name: "スパイス" },
        { name: "資材" },
        { name: "その他" },
    ];

    for (const cat of ingredientCategories) {
        const { error } = await supabase
            .from("ingredient_categories")
            .upsert(cat, { onConflict: "name" });
        if (!error) {
            console.log(`  ✓ Ingredient Category: ${cat.name}`);
        }
    }
}

createTables().catch(console.error);
