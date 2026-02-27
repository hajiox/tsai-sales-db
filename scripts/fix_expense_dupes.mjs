import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve('C:/作業用/tsai-sales-db/.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    console.log('=== expenses テーブル重複削除 ===\n');

    // 全件取得
    const { data: allExpenses } = await supabase
        .from('expenses')
        .select('*')
        .order('name, created_at');

    console.log(`修正前: ${allExpenses.length}件\n`);

    // 名前でグループ化
    const grouped = {};
    for (const e of allExpenses) {
        if (!grouped[e.name]) grouped[e.name] = [];
        grouped[e.name].push(e);
    }

    const deleteIds = [];

    for (const [name, items] of Object.entries(grouped)) {
        if (items.length <= 1) continue;

        // 「ネコポス送料」は値が異なる(209 vs 350)ので特別扱い
        // → 209円(税込)がExcel正値。350円(税抜)は旧データなので削除
        if (name === 'ネコポス送料') {
            const keep = items.find(e => e.unit_price === 209 && e.tax_included === true);
            const remove = items.filter(e => e.id !== keep.id);
            console.log(`「${name}」: keep unit_price=209(税込), remove ${remove.length}件 (unit_price=${remove.map(r => r.unit_price).join(',')})`);
            deleteIds.push(...remove.map(r => r.id));
            continue;
        }

        // 「製造人件費算出表（2024年6月集計）」: 全5件全てunit_price=null/0 → 1件だけ残す
        if (name === '製造人件費算出表（2024年6月集計）') {
            // unit_price=0のものか、最初のものを残す
            const keep = items.find(e => e.unit_price === 0) || items[0];
            const remove = items.filter(e => e.id !== keep.id);
            console.log(`「${name}」: keep 1件(unit_price=${keep.unit_price}), remove ${remove.length}件`);
            deleteIds.push(...remove.map(r => r.id));
            continue;
        }

        // 同名・同額の純粋な重複 → 最初の1件を残す
        const keep = items[0];
        const remove = items.slice(1);
        console.log(`「${name}」: keep 1件(id=${keep.id.substring(0, 8)}), remove ${remove.length}件`);
        deleteIds.push(...remove.map(r => r.id));
    }

    console.log(`\n削除対象: ${deleteIds.length}件\n`);

    // 削除実行
    let deletedCount = 0;
    for (const id of deleteIds) {
        const { error } = await supabase
            .from('expenses')
            .delete()
            .eq('id', id);

        if (error) {
            console.log(`  ❌ 削除失敗(${id}): ${error.message}`);
        } else {
            deletedCount++;
        }
    }
    console.log(`✅ ${deletedCount}/${deleteIds.length}件 削除完了`);

    // 修正後の一覧
    console.log('\n\n=== 修正後の expenses テーブル ===');
    const { data: afterExpenses } = await supabase
        .from('expenses')
        .select('id, name, unit_price, unit_quantity, tax_included')
        .order('name');

    console.log(`全件数: ${afterExpenses.length}件\n`);
    for (const e of afterExpenses) {
        console.log(`  ${e.name} | unit_price=${e.unit_price} | tax_incl=${e.tax_included}`);
    }

    // 名前重複が残っていないか確認
    const afterGrouped = {};
    for (const e of afterExpenses) {
        if (!afterGrouped[e.name]) afterGrouped[e.name] = 0;
        afterGrouped[e.name]++;
    }
    const dupes = Object.entries(afterGrouped).filter(([_, c]) => c > 1);
    if (dupes.length === 0) {
        console.log('\n✅ 重複なし！クリーン状態です。');
    } else {
        console.log('\n⚠️ まだ重複あり:');
        for (const [name, count] of dupes) {
            console.log(`  ${name}: ${count}件`);
        }
    }
}

main().catch(console.error);
