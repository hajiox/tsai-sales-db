import pg from "pg";
import * as fs from "fs";

const client = new pg.Client("postgresql://postgres.zrerpexdsaxqztqqrwwv:WAmas0831@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres");

async function main() {
    await client.connect();

    let output = "=== 修正後確認 ===\n\n";

    // 1. しらすふりかけの全アイテム
    const items = await client.query(
        `SELECT ri.item_name, ri.item_type, ri.cost
         FROM recipe_items ri
         JOIN recipes r ON r.id = ri.recipe_id
         WHERE r.name = '【なみえ】しらすふりかけ'
         ORDER BY ri.id`
    );
    output += "【なみえ】しらすふりかけ のアイテム:\n";
    for (const item of items.rows) {
        output += `  [${item.item_type}] "${item.item_name}" cost=${item.cost}\n`;
    }

    const recipe = await client.query(
        `SELECT total_cost FROM recipes WHERE name = '【なみえ】しらすふりかけ'`
    );
    output += `\ntotal_cost: ${recipe.rows[0]?.total_cost}\n`;

    // 2. 全体で表記量・充填量の残存確認
    const remaining = await client.query(
        `SELECT ri.item_name, count(*) as cnt
         FROM recipe_items ri
         WHERE ri.item_name IN ('表記量', '充填量', '保存方法', '原価合計', '合計')
         GROUP BY ri.item_name`
    );
    output += "\n残存する問題キーワード: ";
    if (remaining.rows.length === 0) {
        output += "なし ✓\n";
    } else {
        output += "\n";
        for (const row of remaining.rows) {
            output += `  "${row.item_name}": ${row.cnt} 件\n`;
        }
    }

    fs.writeFileSync("scripts/shirasu_verify_output.txt", output, "utf8");
    console.log(output);

    await client.end();
}

main().catch(console.error);
