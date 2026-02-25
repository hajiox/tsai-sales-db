import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const raw = readFileSync('.env.local', 'utf8');
const env = {};
for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
}

const sb = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

const CORRECT_ID = 'b9671a5c-7db9-46bd-a839-f1af511d5ede';
const WRONG_ID = '19b8abc6-bb2e-401f-9a05-ca4242b5f7dd';

// product_price_history の付け替え（カラム名なしで件数確認）
console.log('[STEP 4] product_price_history の付け替え...');
const { count: phCount, error: phCountErr } = await sb
    .from('product_price_history')
    .select('*', { count: 'exact', head: true })
    .eq('product_id', WRONG_ID);

if (phCountErr) {
    console.error('❌ 確認エラー:', phCountErr.message);
    process.exit(1);
}
console.log(`  対象: ${phCount ?? 0}件`);

if (phCount && phCount > 0) {
    const { error: phUpdErr } = await sb
        .from('product_price_history')
        .update({ product_id: CORRECT_ID })
        .eq('product_id', WRONG_ID);

    if (phUpdErr) {
        console.error('❌ 更新エラー:', phUpdErr.message);
        process.exit(1);
    }
    console.log('  ✅ product_price_history を付け替えました');
} else {
    console.log('  （対象なし）');
}

// 他のFKテーブルも念のため確認
const otherTables = [
    'amazon_product_mapping', 'rakuten_product_mapping', 'yahoo_product_mapping',
    'mercari_product_mapping', 'base_product_mapping', 'qoo10_product_mapping',
];
for (const table of otherTables) {
    try {
        const { count } = await sb.from(table).select('*', { count: 'exact', head: true }).eq('product_id', WRONG_ID);
        if (count && count > 0) {
            console.log(`  ⚠️  ${table}: ${count}件 → 付け替え中`);
            const { error } = await sb.from(table).update({ product_id: CORRECT_ID }).eq('product_id', WRONG_ID);
            if (error) console.error(`  ❌ ${table}:`, error.message);
            else console.log(`  ✅ ${table} 完了`);
        }
    } catch (_) { }
}

// 誤登録商品を削除
console.log('\n[STEP 3] 誤登録商品を削除...');
const { error: delErr } = await sb.from('products').delete().eq('id', WRONG_ID);
if (delErr) {
    console.error('❌ 削除エラー:', delErr.message);
    process.exit(1);
}
console.log('  ✅ 誤登録商品を削除しました');

// 最終確認
console.log('\n=== 最終確認 ===');
const { data: finalProd } = await sb.from('products').select('id, name').eq('id', CORRECT_ID).single();
const { count: finalRecipe } = await sb.from('recipes').select('*', { count: 'exact', head: true }).eq('linked_product_id', CORRECT_ID);
const { count: finalSales } = await sb.from('web_sales_summary').select('*', { count: 'exact', head: true }).eq('product_id', CORRECT_ID);
const { data: gone } = await sb.from('products').select('id').eq('id', WRONG_ID).maybeSingle();

console.log(`商品名: ${finalProd?.name}`);
console.log(`レシピ紐付け: ${finalRecipe}件`);
console.log(`売上データ: ${finalSales}件`);
console.log(`誤登録商品: ${gone ? '❌ まだ存在' : '✅ 削除確認済み'}`);
console.log('\n✅ 全処理が完了しました');
