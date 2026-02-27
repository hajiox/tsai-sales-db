import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve('C:/作業用/tsai-sales-db/.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    // 1. expenses テーブルの全送料関連データ（IDも含む）
    console.log('=== expenses テーブル全送料関連 ===');
    const { data: expenses } = await supabase
        .from('expenses')
        .select('*')
        .or('name.ilike.%送料%,name.ilike.%平均%,name.ilike.%ヤマト%,name.ilike.%ネコポス%')
        .order('name');

    for (const e of expenses) {
        console.log(JSON.stringify({
            id: e.id,
            name: e.name,
            price: e.price,
            unit_price: e.unit_price,
            unit_quantity: e.unit_quantity,
            tax_included: e.tax_included
        }));
    }

    // 2. recipe_items で送料関連を全取得（カラム構造確認のため）
    console.log('\n=== recipe_items 送料関連（最初の5件のフル構造） ===');
    const { data: items, error } = await supabase
        .from('recipe_items')
        .select('*')
        .or('item_name.ilike.%送料%,item_name.ilike.%平均送料%')
        .limit(5);

    if (error) {
        console.log('Error:', error.message);
    } else if (items.length > 0) {
        console.log('カラム一覧:', Object.keys(items[0]).join(', '));
        for (const i of items) {
            console.log(JSON.stringify(i));
        }
    }

    // 3. recipe_items で「平均送料予測」を全取得
    console.log('\n=== recipe_items「平均送料予測」全件 ===');
    const { data: avgItems } = await supabase
        .from('recipe_items')
        .select('id, recipe_id, item_name, item_type, cost, usage_amount, unit_quantity, unit_price')
        .ilike('item_name', '%平均送料%');

    if (avgItems) {
        console.log(`件数: ${avgItems.length}`);
        // ユニークなcost値を確認
        const uniqueCosts = [...new Set(avgItems.map(i => i.cost))];
        const uniqueUnitPrices = [...new Set(avgItems.map(i => i.unit_price))];
        const uniqueUsages = [...new Set(avgItems.map(i => i.usage_amount))];
        const uniqueUnitQty = [...new Set(avgItems.map(i => i.unit_quantity))];
        console.log('  ユニークcost:', uniqueCosts);
        console.log('  ユニークunit_price:', uniqueUnitPrices);
        console.log('  ユニークusage_amount:', uniqueUsages);
        console.log('  ユニークunit_quantity:', uniqueUnitQty);

        // 異常値を持つものを表示
        for (const i of avgItems) {
            if (i.cost > 1500 || i.cost < 0 || i.unit_price > 1500) {
                console.log('  異常値:', JSON.stringify(i));
            }
        }
    }

    // 4. expensesの「平均送料予測」の全データ（重複確認）
    console.log('\n=== expenses「平均送料予測」重複確認 ===');
    const { data: avgExpenses } = await supabase
        .from('expenses')
        .select('*')
        .ilike('name', '%平均送料%');

    if (avgExpenses) {
        console.log(`件数: ${avgExpenses.length}`);
        for (const e of avgExpenses) {
            console.log(JSON.stringify({
                id: e.id,
                name: e.name,
                price: e.price,
                unit_price: e.unit_price,
                unit_quantity: e.unit_quantity,
                tax_included: e.tax_included
            }));
        }
    }

    // 5. materials テーブルの「平均送料予測」
    console.log('\n=== materials「平均送料予測」確認 ===');
    const { data: matAvg } = await supabase
        .from('materials')
        .select('*')
        .ilike('name', '%平均送料%');

    if (matAvg) {
        console.log(`件数: ${matAvg.length}`);
        for (const m of matAvg) {
            console.log(JSON.stringify({
                id: m.id,
                name: m.name,
                price: m.price,
                unit_price: m.unit_price,
                unit_quantity: m.unit_quantity,
                tax_included: m.tax_included
            }));
        }
    }
}

main().catch(console.error);
