import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve('C:/作業用/tsai-sales-db/.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    // 1. 異常値の平均送料予測を持つレシピを特定
    console.log('=== 異常値のrecipe_itemsを持つレシピ ===');
    const abnormalIds = [
        '07d38dfb-50d4-4d1e-9883-027c8d069a31',
        '40ae316f-d54a-4904-b5f6-a12574ce9f5f'
    ];

    for (const recipeId of abnormalIds) {
        const { data: recipe } = await supabase
            .from('recipes')
            .select('id, name')
            .eq('id', recipeId)
            .single();

        if (recipe) {
            console.log(`\nレシピ: ${recipe.name} (${recipe.id})`);
        }

        // このレシピの全recipe_itemsを表示（送料関連のみ）
        const { data: items } = await supabase
            .from('recipe_items')
            .select('id, item_name, item_type, cost, usage_amount, unit_quantity, unit_price, tax_included')
            .eq('recipe_id', recipeId)
            .or('item_name.ilike.%送料%,item_name.ilike.%平均%')

        for (const i of items) {
            console.log(`  ${JSON.stringify(i)}`);
        }
    }

    // 2. 全recipe_itemsの「平均送料予測」を一覧
    console.log('\n=== 全「平均送料予測」recipe_items ===');
    const { data: allItems } = await supabase
        .from('recipe_items')
        .select(`
      id, recipe_id, item_name, item_type, cost, usage_amount, unit_quantity, unit_price, tax_included,
      recipes:recipe_id(name)
    `)
        .ilike('item_name', '%平均送料%');

    if (allItems) {
        for (const i of allItems) {
            const recipeName = i.recipes?.name || 'N/A';
            const isAbnormal = i.cost > 1500 || i.unit_price === null ? '⚠️ 異常' : '✅ 正常';
            console.log(`${isAbnormal} | ${recipeName} | cost=${i.cost} | usage=${i.usage_amount} | unit_qty=${i.unit_quantity} | unit_price=${i.unit_price} | tax_incl=${i.tax_included}`);
        }
    }

    // 3. Excelの正しい値をまとめる
    console.log('\n=== Excel正しい値 ===');
    console.log('平均送料予測（冷凍・冷蔵）: 税込990円 / 税抜900円');
    console.log('ネコポス送料: 税込209円 / 税抜190円');
    console.log('ヤマト常温送料: 税込770円 / 税抜700円');
    console.log('ヤマト冷凍冷蔵業務用大: 税込1320円 / 税抜1200円');

    // 4. expenses テーブルの重複を確認
    console.log('\n=== expenses テーブル重複一覧（全送料系） ===');
    const { data: allExp } = await supabase
        .from('expenses')
        .select('id, name, unit_price, unit_quantity, tax_included')
        .or('name.ilike.%送料%,name.ilike.%平均%,name.ilike.%ヤマト%,name.ilike.%ネコポス%')
        .order('name');

    for (const e of allExp) {
        console.log(`  ${e.name} | id=${e.id} | unit_price=${e.unit_price} | tax_incl=${e.tax_included}`);
    }
}

main().catch(console.error);
