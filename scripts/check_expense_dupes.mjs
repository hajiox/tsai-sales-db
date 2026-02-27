import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve('C:/作業用/tsai-sales-db/.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    console.log('=== expenses テーブル全件取得 ===\n');

    // expenses 全件取得
    const { data: allExpenses, error } = await supabase
        .from('expenses')
        .select('*')
        .order('name');

    if (error) { console.log('Error:', error.message); return; }

    console.log(`全件数: ${allExpenses.length}\n`);

    // 名前でグループ化
    const grouped = {};
    for (const e of allExpenses) {
        if (!grouped[e.name]) grouped[e.name] = [];
        grouped[e.name].push(e);
    }

    // 重複のある名前だけ表示
    console.log('--- 重複あり ---');
    let dupeCount = 0;
    for (const [name, items] of Object.entries(grouped)) {
        if (items.length > 1) {
            dupeCount++;
            console.log(`\n「${name}」: ${items.length}件`);
            for (const e of items) {
                console.log(`  id=${e.id} | unit_price=${e.unit_price} | price=${e.price} | unit_qty=${e.unit_quantity} | tax_incl=${e.tax_included}`);
            }
        }
    }

    if (dupeCount === 0) {
        console.log('重複なし');
    }

    // recipe_items で expense_id (material_id) を持つものを確認
    // expense タイプのアイテムが expenses テーブルのIDをどのカラムで参照しているか確認
    console.log('\n\n--- recipe_items (item_type=expense) のサンプル ---');
    const { data: expenseItems } = await supabase
        .from('recipe_items')
        .select('id, recipe_id, item_name, item_type, cost, material_id, ingredient_id')
        .eq('item_type', 'expense')
        .limit(10);

    for (const i of expenseItems) {
        console.log(`  item_name=${i.item_name} | material_id=${i.material_id} | ingredient_id=${i.ingredient_id}`);
    }

    // 全 expense アイテムの material_id を確認（どの expense ID を参照しているか）
    console.log('\n\n--- recipe_items (item_type=expense) の material_id 参照先一覧 ---');
    const { data: allExpItems } = await supabase
        .from('recipe_items')
        .select('item_name, material_id')
        .eq('item_type', 'expense')
        .not('material_id', 'is', null);

    const refMap = {};
    for (const i of allExpItems || []) {
        if (!refMap[i.material_id]) refMap[i.material_id] = { name: i.item_name, count: 0 };
        refMap[i.material_id].count++;
    }

    for (const [matId, info] of Object.entries(refMap)) {
        // このIDがexpensesテーブルに存在するか確認
        const exists = allExpenses.find(e => e.id === matId);
        console.log(`  ${exists ? '✅' : '❌不明'} material_id=${matId} | name=${info.name} | 参照数=${info.count}`);
    }

    // 全expenses の名前一覧（重複なし含め）
    console.log('\n\n--- expenses テーブル全件一覧 ---');
    for (const e of allExpenses) {
        // このIDを参照しているrecipe_itemsの数
        const refCount = (allExpItems || []).filter(i => i.material_id === e.id).length;
        console.log(`  ${e.name} | id=${e.id} | unit_price=${e.unit_price} | ref=${refCount}件`);
    }
}

main().catch(console.error);
