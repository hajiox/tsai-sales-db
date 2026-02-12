// scripts/remove-person-materials.ts
// 資材から人名・非資材アイテムを削除

import pg from "pg";
const { Client } = pg;

const connectionString = "postgresql://postgres.zrerpexdsaxqztqqrwwv:WAmas0831@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";

async function main() {
    const client = new Client({ connectionString });
    await client.connect();

    // まず全material項目を確認
    const allMaterials = await client.query(
        `SELECT DISTINCT item_name, COUNT(*) as cnt FROM recipe_items 
     WHERE item_type = 'material' GROUP BY item_name ORDER BY item_name`
    );

    console.log("=== All material item names ===\n");
    allMaterials.rows.forEach(r => {
        console.log(`  "${r.item_name}" (${r.cnt}件)`);
    });
    console.log(`\nTotal unique: ${allMaterials.rows.length}\n`);

    // 正当な資材パターン（包装、ラベル、シール、箱、瓶、袋、レトルト、キャップ、ティーバッグ etc）
    const validPatterns = [
        /パック/, /袋/, /瓶/, /箱/, /ラベル/, /シール/, /シュリンク/, /ロール/,
        /キャップ/, /テープ/, /レトルト/, /ティーバッグ/, /クリスタル/, /巻紙/,
        /封印/, /ネット/, /OPP/, /カレー/, /ふりかけ/, /ドレッシング/, /ソース/,
        /ウェルパック/, /シリカゲル/, /脱酸素/, /スープ/, /内職/, /原材料/,
        /ブランド/, /紙袋/, /ナイロン/, /ストレート/, /小袋/, /贈答/,
        /噴火/, /スパイス/, /酒塩/, /EDK/, /HS-/, /63RTS/, /カウパック/,
        /すうもも/, /仕入/, /RTS/,
    ];

    const invalidItems: string[] = [];
    allMaterials.rows.forEach(r => {
        const name = r.item_name;
        const isValid = validPatterns.some(p => p.test(name));
        if (!isValid) {
            invalidItems.push(name);
        }
    });

    console.log("=== Items to REMOVE (not matching material patterns) ===\n");
    invalidItems.forEach(name => {
        console.log(`  ❌ "${name}"`);
    });
    console.log(`\nTotal to remove: ${invalidItems.length}\n`);

    if (invalidItems.length > 0) {
        // 削除実行
        for (const name of invalidItems) {
            const result = await client.query(
                `DELETE FROM recipe_items WHERE item_type = 'material' AND item_name = $1`,
                [name]
            );
            console.log(`  Deleted "${name}": ${result.rowCount} rows`);
        }

        // 影響を受けたレシピの総原価を再計算
        console.log("\n  Recalculating recipe totals...");
        const recipes = await client.query(`SELECT DISTINCT id FROM recipes`);
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
        console.log("  ✓ Totals recalculated");
    }

    await client.end();
}

main().catch(console.error);
