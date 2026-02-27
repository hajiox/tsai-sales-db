import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve('C:/作業用/tsai-sales-db/.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    console.log('=== 中間加工品 unit_weight / intermediate_recipe_id 一括修正 ===\n');

    // 1. 中間部品レシピの一覧（name → レシピ情報）
    const { data: intRecipes } = await supabase
        .from('recipes')
        .select('id, name, total_weight, total_cost')
        .eq('is_intermediate', true);

    const recipeByName = {};
    for (const r of intRecipes || []) {
        recipeByName[r.name] = r;
    }

    // 2. 中間加工品のrecipe_items全件取得
    const { data: intItems } = await supabase
        .from('recipe_items')
        .select('id, item_name, unit_weight, unit_price, intermediate_recipe_id')
        .eq('item_type', 'intermediate');

    console.log(`対象: ${intItems?.length || 0}件\n`);

    let fixedCount = 0;
    let skippedCount = 0;

    for (const item of intItems || []) {
        const matchingRecipe = recipeByName[item.item_name];

        if (!matchingRecipe) {
            console.log(`⚠️ SKIP: "${item.item_name}" - 対応する中間部品レシピが見つかりません`);
            skippedCount++;
            continue;
        }

        const updates = {};
        let needsUpdate = false;

        // unit_weight が null または元レシピと異なる場合は修正
        if (item.unit_weight !== matchingRecipe.total_weight) {
            updates.unit_weight = matchingRecipe.total_weight;
            needsUpdate = true;
        }

        // intermediate_recipe_id が未設定の場合は設定
        if (!item.intermediate_recipe_id) {
            updates.intermediate_recipe_id = matchingRecipe.id;
            needsUpdate = true;
        }

        // unit_price が元レシピの total_cost と異なる場合は修正（丸め誤差も考慮）
        const currentPrice = parseFloat(String(item.unit_price)) || 0;
        const correctPrice = matchingRecipe.total_cost || 0;
        if (Math.abs(currentPrice - correctPrice) > 0.1) {
            updates.unit_price = correctPrice;
            needsUpdate = true;
        }

        if (needsUpdate) {
            const { error } = await supabase
                .from('recipe_items')
                .update(updates)
                .eq('id', item.id);

            if (error) {
                console.log(`❌ ${item.item_name}: ${error.message}`);
            } else {
                fixedCount++;
                const changes = Object.entries(updates).map(([k, v]) => `${k}=${v}`).join(', ');
                console.log(`✅ ${item.item_name}: ${changes}`);
            }
        }
    }

    // 3. product タイプも同様に修正
    console.log('\n--- product タイプの修正 ---');

    // 商品レシピの一覧
    const { data: prodRecipes } = await supabase
        .from('recipes')
        .select('id, name, total_weight, total_cost')
        .eq('is_intermediate', false);

    const prodByName = {};
    for (const r of prodRecipes || []) {
        prodByName[r.name] = r;
    }

    const { data: prodItems } = await supabase
        .from('recipe_items')
        .select('id, item_name, unit_weight, unit_price, intermediate_recipe_id')
        .eq('item_type', 'product');

    console.log(`対象: ${prodItems?.length || 0}件`);

    for (const item of prodItems || []) {
        const matchingRecipe = prodByName[item.item_name];

        if (!matchingRecipe) {
            console.log(`⚠️ SKIP: "${item.item_name}" - 対応する商品レシピが見つかりません`);
            continue;
        }

        const updates = {};
        let needsUpdate = false;

        if (item.unit_weight !== matchingRecipe.total_weight && matchingRecipe.total_weight) {
            updates.unit_weight = matchingRecipe.total_weight;
            needsUpdate = true;
        }

        if (!item.intermediate_recipe_id) {
            updates.intermediate_recipe_id = matchingRecipe.id;
            needsUpdate = true;
        }

        const currentPrice = parseFloat(String(item.unit_price)) || 0;
        const correctPrice = matchingRecipe.total_cost || 0;
        if (correctPrice > 0 && Math.abs(currentPrice - correctPrice) > 0.1) {
            updates.unit_price = correctPrice;
            needsUpdate = true;
        }

        if (needsUpdate) {
            const { error } = await supabase
                .from('recipe_items')
                .update(updates)
                .eq('id', item.id);

            if (error) {
                console.log(`❌ ${item.item_name}: ${error.message}`);
            } else {
                fixedCount++;
                const changes = Object.entries(updates).map(([k, v]) => `${k}=${v}`).join(', ');
                console.log(`✅ ${item.item_name}: ${changes}`);
            }
        }
    }

    console.log(`\n=== 完了: ${fixedCount}件修正, ${skippedCount}件スキップ ===`);
}

main().catch(console.error);
