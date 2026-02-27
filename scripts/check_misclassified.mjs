import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve('C:/作業用/tsai-sales-db/.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    console.log('=== 諸経費に誤分類されている資材アイテムの調査 ===\n');

    // 1. recipe_items で item_type='expense' かつ名前に「ダンボール」「段ボール」「箱」「袋」「シール」「ラベル」等の資材系キーワードを含むものを全取得
    const materialKeywords = ['ダンボール', '段ボール', '箱', 'レトルト袋', 'ナイロン', 'ポリ', 'シール', 'ラベル', '包装', '容器', 'パウチ', 'ビン', '瓶', 'カップ', 'トレー'];

    // まずexpenseタイプのアイテムを全件取得
    let allExpenseItems = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('recipe_items')
            .select('id, recipe_id, item_name, item_type, cost, usage_amount, unit_quantity, unit_price, material_id')
            .eq('item_type', 'expense')
            .range(from, from + pageSize - 1);

        if (error) { console.log('Error:', error.message); break; }
        allExpenseItems.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
    }

    console.log(`expense タイプのrecipe_items 総数: ${allExpenseItems.length}件\n`);

    // 資材系キーワードにマッチするものを抽出
    const misclassified = allExpenseItems.filter(item =>
        materialKeywords.some(kw => item.item_name.includes(kw))
    );

    // ユニークなitem_name別にグループ化
    const byName = {};
    for (const item of misclassified) {
        if (!byName[item.item_name]) byName[item.item_name] = [];
        byName[item.item_name].push(item);
    }

    console.log(`--- 資材として分類すべきアイテム（expense→material） ---`);
    console.log(`ユニーク名: ${Object.keys(byName).length}種類, 合計: ${misclassified.length}件\n`);

    for (const [name, items] of Object.entries(byName)) {
        console.log(`「${name}」: ${items.length}件 | cost例=${items[0].cost} | unit_price=${items[0].unit_price} | unit_qty=${items[0].unit_quantity}`);
    }

    // 2. 逆に、materialsテーブルにこれらの対応アイテムが存在するか確認
    console.log('\n--- materials テーブルでの「発送用ダンボール」確認 ---');
    const { data: matDanball } = await supabase
        .from('materials')
        .select('id, name, price, unit_price, unit_quantity, tax_included')
        .ilike('name', '%ダンボール%');

    for (const m of matDanball || []) {
        console.log(`  [materials] ${m.name} | price=${m.price} | unit_qty=${m.unit_quantity} | tax_incl=${m.tax_included}`);
    }

    // 3. レシピ名も確認
    console.log('\n--- 誤分類アイテムを持つレシピ一覧 ---');
    const recipeIds = [...new Set(misclassified.map(i => i.recipe_id))];

    // レシピ名を取得
    const { data: recipes } = await supabase
        .from('recipes')
        .select('id, name')
        .in('id', recipeIds);

    const recipeMap = {};
    for (const r of recipes || []) {
        recipeMap[r.id] = r.name;
    }

    for (const item of misclassified) {
        console.log(`  ${recipeMap[item.recipe_id] || item.recipe_id} | ${item.item_name} | cost=${item.cost} | type=${item.item_type}`);
    }

    // 4. その他、expense に入るべきでないアイテムがないか全件チェック
    console.log('\n--- expense全アイテムのユニーク名一覧 ---');
    const uniqueNames = {};
    for (const item of allExpenseItems) {
        if (!uniqueNames[item.item_name]) uniqueNames[item.item_name] = 0;
        uniqueNames[item.item_name]++;
    }

    for (const [name, count] of Object.entries(uniqueNames).sort((a, b) => a[0].localeCompare(b[0]))) {
        // 資材系かどうか判定
        const isMat = materialKeywords.some(kw => name.includes(kw));
        console.log(`  ${isMat ? '⚠️資材' : '  '} ${name}: ${count}件`);
    }
}

main().catch(console.error);
