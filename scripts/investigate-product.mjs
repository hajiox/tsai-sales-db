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

const OLD_PRODUCT_ID = 'b9671a5c-7db9-46bd-a839-f1af511d5ede';
const NEW_NAME = 'チャーシュー 訳あり ラーメン屋が作る本物のチャーシュー訳アリ800g 小分け200g×4個セット';

// 誤登録product (「訳あり 個包装 200ｇ×4個 800g」) の完全IDを取得
const { data: wrongProd } = await sb.from('products')
    .select('id, name')
    .ilike('name', '%200ｇ×4個 800g%');

console.log('=== 誤登録商品 ===');
(wrongProd || []).forEach(p => console.log(`ID: ${p.id}\n  名前: ${p.name}`));

if (wrongProd && wrongProd.length > 0) {
    const wrongId = wrongProd[0].id;

    // 誤登録商品に売上・レシピ・マッピングが本当にないか最終確認
    const { count: salesCount } = await sb.from('web_sales_summary').select('*', { count: 'exact', head: true }).eq('product_id', wrongId);
    const { count: recipeCount } = await sb.from('recipes').select('*', { count: 'exact', head: true }).eq('linked_product_id', wrongId);

    console.log(`\n誤登録商品の紐付け確認:`);
    console.log(`  売上データ: ${salesCount}件`);
    console.log(`  レシピ: ${recipeCount}件`);

    if (salesCount === 0 && recipeCount === 0) {
        console.log('\n✅ 安全に削除可能です');
        console.log('削除実行中...');
        const { error: delErr } = await sb.from('products').delete().eq('id', wrongId);
        if (delErr) {
            console.error('❌ 削除エラー:', delErr.message);
        } else {
            console.log('✅ 誤登録商品を削除しました');
        }
    } else {
        console.log('\n⚠️  データが紐付いているので削除できません。手動確認が必要です。');
    }
} else {
    console.log('誤登録商品が見つかりませんでした（すでに削除済みかもしれません）');
}

// 旧商品をリネーム
console.log('\n=== 旧商品リネーム ===');
console.log(`変更前: チャーシュー 訳あり ラーメン屋が作る本物のチャーシュー訳アリ1Kg 小分け200g×5個セット`);
console.log(`変更後: ${NEW_NAME}`);

const { error: renameErr } = await sb.from('products')
    .update({ name: NEW_NAME })
    .eq('id', OLD_PRODUCT_ID);

if (renameErr) {
    console.error('❌ リネームエラー:', renameErr.message);
} else {
    console.log('✅ リネーム完了');
}

// 確認
const { data: check } = await sb.from('products').select('id, name').eq('id', OLD_PRODUCT_ID).single();
console.log('\n最終確認:');
console.log(`  ID: ${check?.id}`);
console.log(`  名前: ${check?.name}`);
