import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve('C:/作業用/tsai-sales-db/.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    console.log('=== 中間加工品 recipe_items の既存データチェック ===\n');

    // 1. recipe_items テーブルのカラム確認
    const { data: sample } = await supabase
        .from('recipe_items')
        .select('*')
        .eq('item_type', 'intermediate')
        .limit(1);

    if (sample && sample.length > 0) {
        console.log('recipe_items カラム一覧:', Object.keys(sample[0]).join(', '));
        console.log('intermediate_recipe_id カラム存在:', 'intermediate_recipe_id' in sample[0]);
    }

    // 2. 全中間加工品の recipe_items を取得
    const { data: intItems } = await supabase
        .from('recipe_items')
        .select(`
      id, recipe_id, item_name, item_type, cost, usage_amount, unit_quantity, unit_price, unit_weight, intermediate_recipe_id,
      recipes:recipe_id(name)
    `)
        .eq('item_type', 'intermediate');

    console.log(`\n中間加工品 recipe_items 件数: ${intItems?.length || 0}\n`);

    // 3. 中間部品レシピの一覧（名前→total_weight, total_costのマップ）
    const { data: intermediateRecipes } = await supabase
        .from('recipes')
        .select('id, name, total_weight, total_cost')
        .eq('is_intermediate', true);

    const recipeMap = {};
    for (const r of intermediateRecipes || []) {
        recipeMap[r.name] = r;
    }
    console.log(`中間部品レシピ数: ${intermediateRecipes?.length || 0}`);
    for (const r of intermediateRecipes || []) {
        console.log(`  ${r.name} | total_weight=${r.total_weight} | total_cost=${r.total_cost}`);
    }

    // 4. 既存データの問題を特定
    console.log('\n--- 既存データの問題チェック ---');
    let needsFixCount = 0;

    for (const item of intItems || []) {
        const recipeName = item.recipes?.name || 'N/A';
        const matchingRecipe = recipeMap[item.item_name];

        const currentUnitWeight = item.unit_weight;
        const correctUnitWeight = matchingRecipe?.total_weight || null;
        const currentUnitPrice = item.unit_price;
        const correctUnitPrice = matchingRecipe?.total_cost || null;

        const weightOk = currentUnitWeight === correctUnitWeight;
        const priceOk = currentUnitPrice === correctUnitPrice;
        const hasIntRecipeId = !!item.intermediate_recipe_id;

        if (!weightOk || !priceOk || !hasIntRecipeId) {
            needsFixCount++;
            console.log(`\n⚠️ ${recipeName} → ${item.item_name}`);
            if (!weightOk) console.log(`  unit_weight: ${currentUnitWeight} → 正: ${correctUnitWeight}`);
            if (!priceOk) console.log(`  unit_price: ${currentUnitPrice} → 正: ${correctUnitPrice}`);
            if (!hasIntRecipeId) console.log(`  intermediate_recipe_id: ${item.intermediate_recipe_id} → 正: ${matchingRecipe?.id}`);
        } else {
            console.log(`✅ ${recipeName} → ${item.item_name} | OK`);
        }
    }

    console.log(`\n修正が必要: ${needsFixCount}件`);

    // 5. product タイプも確認
    const { data: prodItems } = await supabase
        .from('recipe_items')
        .select('id, recipe_id, item_name, item_type, cost, usage_amount, unit_weight, unit_price, intermediate_recipe_id')
        .eq('item_type', 'product');

    console.log(`\nproduct タイプ recipe_items 件数: ${prodItems?.length || 0}`);
    for (const item of prodItems || []) {
        console.log(`  ${item.item_name} | unit_weight=${item.unit_weight} | unit_price=${item.unit_price} | int_recipe_id=${item.intermediate_recipe_id}`);
    }
}

main().catch(console.error);
