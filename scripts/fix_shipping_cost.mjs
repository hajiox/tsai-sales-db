import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve('C:/作業用/tsai-sales-db/.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    console.log('=== 送料データ修正開始 ===\n');

    // ===== 1. recipe_items の異常値を修正 =====
    console.log('--- 1. recipe_items 異常値修正 ---');

    // 全「平均送料予測」recipe_itemsを正しい値に修正
    const { data: avgItems } = await supabase
        .from('recipe_items')
        .select('id, recipe_id, item_name, cost, usage_amount, unit_quantity, unit_price')
        .ilike('item_name', '%平均送料%');

    for (const item of avgItems) {
        const needsFix = item.cost !== 990 || item.unit_price !== 990 || item.usage_amount !== 1 || item.unit_quantity !== 1;
        if (needsFix) {
            console.log(`  修正: ${item.id} | 旧: cost=${item.cost}, usage=${item.usage_amount}, unit_qty=${item.unit_quantity}, unit_price=${item.unit_price}`);

            const { error } = await supabase
                .from('recipe_items')
                .update({
                    cost: 990,
                    usage_amount: 1,
                    unit_quantity: 1,
                    unit_price: 990,
                    tax_included: true
                })
                .eq('id', item.id);

            if (error) {
                console.log(`  ❌ エラー: ${error.message}`);
            } else {
                console.log(`  ✅ → cost=990, usage=1, unit_qty=1, unit_price=990`);
            }
        }
    }

    // ===== 2. expenses テーブルの重複削除 =====
    console.log('\n--- 2. expenses テーブル重複削除 ---');

    // 重複を削除する対象（1件だけ残す）
    const deduplicateTargets = [
        { name: '平均送料予測（冷凍冷蔵）', keepId: 'c93a0277-2f61-4cca-87cd-fdaeec4eeca9' },
        { name: 'ヤマト常温送料（平均）700円計算', keepId: '5581f17b-21fa-4f4b-8486-bc95b8f6bbe4' },
        { name: 'ヤマト冷凍冷蔵発送業務用大（平均予測）', keepId: 'c4e98f47-bc0e-4f60-89e8-d26b26d48dad' },
    ];

    for (const target of deduplicateTargets) {
        const { data: dupes } = await supabase
            .from('expenses')
            .select('id')
            .eq('name', target.name)
            .neq('id', target.keepId);

        if (dupes && dupes.length > 0) {
            const deleteIds = dupes.map(d => d.id);
            console.log(`  ${target.name}: ${dupes.length}件の重複を削除 (残すID: ${target.keepId})`);

            for (const id of deleteIds) {
                const { error } = await supabase
                    .from('expenses')
                    .delete()
                    .eq('id', id);

                if (error) {
                    console.log(`  ❌ 削除エラー(${id}): ${error.message}`);
                } else {
                    console.log(`  ✅ 削除: ${id}`);
                }
            }
        } else {
            console.log(`  ${target.name}: 重複なし`);
        }
    }

    // ===== 3. 修正結果の確認 =====
    console.log('\n--- 3. 修正結果確認 ---');

    // recipe_items確認
    const { data: fixedItems } = await supabase
        .from('recipe_items')
        .select(`
      id, item_name, cost, usage_amount, unit_quantity, unit_price,
      recipes:recipe_id(name)
    `)
        .ilike('item_name', '%平均送料%');

    console.log(`\n平均送料予測 recipe_items: ${fixedItems.length}件`);
    for (const i of fixedItems) {
        const ok = i.cost === 990 && i.unit_price === 990 && i.usage_amount === 1 && i.unit_quantity === 1;
        console.log(`  ${ok ? '✅' : '⚠️'} ${i.recipes?.name} | cost=${i.cost} | usage=${i.usage_amount} | unit_qty=${i.unit_quantity} | unit_price=${i.unit_price}`);
    }

    // expenses確認
    const { data: fixedExp } = await supabase
        .from('expenses')
        .select('id, name, unit_price, unit_quantity, tax_included')
        .or('name.ilike.%送料%,name.ilike.%平均%,name.ilike.%ヤマト%,name.ilike.%ネコポス%')
        .order('name');

    console.log(`\nexpenses テーブル（送料系）: ${fixedExp.length}件`);
    for (const e of fixedExp) {
        console.log(`  ${e.name} | unit_price=${e.unit_price} | tax_incl=${e.tax_included}`);
    }

    console.log('\n=== 修正完了 ===');
}

main().catch(console.error);
