// scripts/remove-person-names.ts
// 資材マスターとrecipe_itemsから人名を削除

import pg from "pg";
const { Client } = pg;

const connectionString = "postgresql://postgres.zrerpexdsaxqztqqrwwv:WAmas0831@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";

// ブラウザ調査で特定された人名リスト
const PERSON_NAMES = [
    "佐藤智哉", "大川原麻衣子", "宗像みなみ", "山口光子",
    "本名英子", "松崎正恵", "森結芽", "渡部 瞳", "渡部 紗矢香",
    "猪俣 彩", "畑中 美香", "石井 瑞季", "芳賀 加南子",
    "芳賀 美枝", "荒関 由貴", "鈴木 健之",
    "渡部瞳", "渡部紗矢香", "猪俣彩", "畑中美香",
    "石井瑞季", "芳賀加南子", "芳賀美枝", "荒関由貴", "鈴木健之",
];

async function main() {
    const client = new Client({ connectionString });
    await client.connect();

    console.log("=== Removing Person Names ===\n");

    // 1. materialsテーブルの全データを取得
    const matResult = await client.query(
        `SELECT id, name, price FROM materials ORDER BY name`
    );

    const personMaterials: { id: string; name: string }[] = [];

    for (const row of matResult.rows) {
        const name = row.name;
        if (PERSON_NAMES.some(pn => name.includes(pn))) {
            personMaterials.push({ id: row.id, name: row.name });
        }
    }

    console.log(`  Materials table total: ${matResult.rows.length}`);
    console.log(`  Materials with person names: ${personMaterials.length}`);
    personMaterials.forEach(m => console.log(`    ❌ ${m.name}`));

    // 2. recipe_itemsで人名パターンを探す
    const itemResult = await client.query(
        `SELECT DISTINCT item_name, COUNT(*) as cnt FROM recipe_items 
     WHERE item_type = 'material' GROUP BY item_name ORDER BY item_name`
    );

    const personItems: string[] = [];
    for (const row of itemResult.rows) {
        const name = row.item_name;
        if (PERSON_NAMES.some(pn => name.includes(pn))) {
            personItems.push(name);
        }
    }

    console.log(`\n  Recipe items with person names: ${personItems.length}`);
    personItems.forEach(n => console.log(`    ❌ ${n}`));

    // 3. materialsテーブルから人名を削除
    if (personMaterials.length > 0) {
        for (const m of personMaterials) {
            await client.query(`DELETE FROM materials WHERE id = $1`, [m.id]);
        }
        console.log(`\n  ✓ Deleted ${personMaterials.length} person names from materials table`);
    }

    // 4. recipe_itemsから人名を削除
    if (personItems.length > 0) {
        for (const name of personItems) {
            const result = await client.query(
                `DELETE FROM recipe_items WHERE item_type = 'material' AND item_name = $1`,
                [name]
            );
            console.log(`  Deleted "${name}" from recipe_items: ${result.rowCount} rows`);
        }
    }

    // 5. もし人名が見つからない場合、全材料名を表示
    if (personMaterials.length === 0 && personItems.length === 0) {
        console.log("\n  ⚠ No exact matches. Listing ALL material names for inspection:");
        matResult.rows.forEach(r => {
            console.log(`    "${r.name}"`);
        });
    }

    // 6. 総原価を再計算
    console.log("\n  Recalculating recipe totals...");
    const recipes = await client.query(`SELECT id FROM recipes`);
    for (const recipe of recipes.rows) {
        const { rows } = await client.query(
            `SELECT COALESCE(SUM(cost), 0) as total FROM recipe_items WHERE recipe_id = $1`,
            [recipe.id]
        );
        await client.query(
            `UPDATE recipes SET total_cost = $1 WHERE id = $2`,
            [rows[0].total, recipe.id]
        );
    }
    console.log(`  ✓ ${recipes.rows.length} recipe totals recalculated`);

    console.log("\n=== Done ===");
    await client.end();
}

main().catch(console.error);
