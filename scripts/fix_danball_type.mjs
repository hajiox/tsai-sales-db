import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve('C:/作業用/tsai-sales-db/.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    console.log('=== 【発送用ダンボール】の expense→material 一括修正 ===\n');

    // 1. 対象の recipe_items を全取得
    let allItems = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('recipe_items')
            .select('id, recipe_id, item_name, item_type, cost, usage_amount, unit_quantity, unit_price')
            .eq('item_type', 'expense')
            .ilike('item_name', '%発送用ダンボール%')
            .range(from, from + pageSize - 1);

        if (error) { console.log('Error:', error.message); break; }
        allItems.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
    }

    console.log(`対象件数: ${allItems.length}件\n`);

    // ユニーク名別集計
    const byName = {};
    for (const item of allItems) {
        if (!byName[item.item_name]) byName[item.item_name] = 0;
        byName[item.item_name]++;
    }
    for (const [name, count] of Object.entries(byName)) {
        console.log(`  ${name}: ${count}件`);
    }

    // 2. materialsテーブルに対応するマスターが存在するか確認、なければ作成
    console.log('\n--- materials テーブルにマスター登録確認 ---');

    // 各ダンボール名でmaterialsを検索
    const danballNames = Object.keys(byName);
    const { data: existingMats } = await supabase
        .from('materials')
        .select('id, name, price, unit_quantity, tax_included')
        .ilike('name', '%発送用ダンボール%');

    console.log(`既存のmaterials: ${(existingMats || []).length}件`);
    for (const m of existingMats || []) {
        console.log(`  ${m.name} | price=${m.price} | unit_qty=${m.unit_quantity}`);
    }

    // Excelの資材総合データベースの正しい値:
    // 【発送用ダンボール】ネコポス: price=53.9(税込), unit_qty=5000
    // その他は各レシピのcost値をそのまま1個単価として使用

    // materialsに登録がないダンボールを新規追加
    const matNameMap = new Map((existingMats || []).map(m => [m.name, m.id]));

    const newMaterials = [
        { name: '【発送用ダンボール】チャーシュー800ｇ-1ｋｇ', price: 29.7, tax_included: true },
        { name: '【発送用ダンボール】パーフェクトラーメン1個', price: 61.6, tax_included: true },
        { name: '【発送用ダンボール】ネコポス', price: 53.9, tax_included: true },
        { name: '【発送用ダンボール】業務用ソース', price: 69.3, tax_included: true },
        { name: '【発送用ダンボール】カレー焼きそば', price: 93.5, tax_included: true },
        { name: '【発送用ダンボール】チャーシューメン2個', price: 300, tax_included: true },
        { name: '【発送用ダンボール】パーフェクトラーメン2個', price: 300, tax_included: true },
        { name: '【発送用ダンボール】チャーシューメン', price: 300, tax_included: true },
    ];

    for (const mat of newMaterials) {
        if (matNameMap.has(mat.name)) {
            console.log(`  ✅ 既存: ${mat.name}`);
            continue;
        }

        const { data: inserted, error } = await supabase
            .from('materials')
            .insert({
                name: mat.name,
                price: mat.price,
                unit_quantity: 1,
                tax_included: mat.tax_included
            })
            .select('id')
            .single();

        if (error) {
            console.log(`  ❌ 追加失敗(${mat.name}): ${error.message}`);
        } else {
            matNameMap.set(mat.name, inserted.id);
            console.log(`  ✅ 新規追加: ${mat.name} (id=${inserted.id})`);
        }
    }

    // 3. recipe_items の item_type を expense→material に一括変更
    console.log('\n--- item_type 一括変更: expense→material ---');

    let updatedCount = 0;
    let errorCount = 0;

    // バッチ処理（1件ずつだと遅いので、item_name別にまとめて更新）
    for (const name of danballNames) {
        const materialId = matNameMap.get(name) || null;

        const { data: updated, error } = await supabase
            .from('recipe_items')
            .update({
                item_type: 'material',
                material_id: materialId
            })
            .eq('item_type', 'expense')
            .eq('item_name', name)
            .select('id');

        if (error) {
            console.log(`  ❌ ${name}: ${error.message}`);
            errorCount++;
        } else {
            const count = updated?.length || 0;
            updatedCount += count;
            console.log(`  ✅ ${name}: ${count}件更新`);
        }
    }

    console.log(`\n合計: ${updatedCount}件更新, ${errorCount}件エラー`);

    // 4. 修正後の確認
    console.log('\n=== 修正後の確認 ===');

    // expense に「ダンボール」が残っていないことを確認
    const { data: remaining } = await supabase
        .from('recipe_items')
        .select('id')
        .eq('item_type', 'expense')
        .ilike('item_name', '%発送用ダンボール%');

    console.log(`expense に残っている「ダンボール」: ${remaining?.length || 0}件`);

    // material に変更済みの件数確認
    const { data: materialItems } = await supabase
        .from('recipe_items')
        .select('id')
        .eq('item_type', 'material')
        .ilike('item_name', '%発送用ダンボール%');

    console.log(`material に分類された「ダンボール」: ${materialItems?.length || 0}件`);

    if (remaining?.length === 0) {
        console.log('\n✅ 全ての【発送用ダンボール】が正しくmaterialに分類されました！');
    }
}

main().catch(console.error);
