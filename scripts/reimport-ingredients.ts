// scripts/reimport-ingredients.ts
// 材料・資材を正しく分類してDBに再インポート

import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://zrerpexdsaxqztqqrwwv.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyZXJwZXhkc2F4cXp0cXFyd3d2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTM2MDM5OCwiZXhwIjoyMDY0OTM2Mzk4fQ.t_EEN1j29ofXe20utLIV2GTzpEfu0dK8IZ9ZrrNU39Q";

const supabase = createClient(supabaseUrl, supabaseKey);

const RECIPE_DIR = "C:/Users/ts/OneDrive/Desktop/作業用/レシピ";

// 資材判定キーワード
const MATERIAL_KEYWORDS = [
    "袋", "容器", "パック", "パウチ", "ラベル", "シール", "箱", "カップ",
    "蓋", "フタ", "トレー", "トレイ", "ケース", "ボトル", "缶", "瓶",
    "紙", "段ボール", "ダンボール", "フィルム", "シュリンク", "包装", "梱包",
    "資材", "包材", "PP", "PE", "OPP", "ナイロン", "アルミ", "ビニール",
    "レトルト袋", "チャック", "ジップ", "スタンド", "ガゼット",
    "外装", "内袋", "シール機", "脱酸素", "乾燥剤", "タイ", "バンド",
    "クリップ", "封筒", "のし", "熨斗", "リボン", "テープ", "ストロー",
    "スプーン", "フォーク", "割り箸", "おしぼり", "ナプキン", "プレート",
    "中厚", "大角", "角袋", "平袋", "巻紙", "キャップ", "ペットボトル",
    "ウェルパック", "人件費", "クリスタルパック", "発送用"
];

function isMaterialItem(name: string): boolean {
    for (const kw of MATERIAL_KEYWORDS) {
        if (name.includes(kw)) {
            return true;
        }
    }
    // サイズ表記があるものも資材の可能性（180×250など）
    if (/\d+[×x]\d+/.test(name)) {
        return true;
    }
    return false;
}

async function main() {
    console.log("=== Reimporting Ingredients with Correct Classification ===\n");

    // 1. 既存データをクリア
    console.log("Clearing existing ingredients...");
    await supabase.from("ingredients").delete().neq("id", "00000000-0000-0000-0000-000000000000");

    // 2. カテゴリを確認・作成
    const categories = [
        { name: "肉類", type: "food" },
        { name: "野菜・果物", type: "food" },
        { name: "調味料", type: "food" },
        { name: "油脂類", type: "food" },
        { name: "粉類", type: "food" },
        { name: "スパイス", type: "food" },
        { name: "その他", type: "food" },
        { name: "包装資材", type: "material" },
        { name: "発送資材", type: "material" },
        { name: "ラベル・シール", type: "material" },
        { name: "容器・瓶", type: "material" },
        { name: "その他資材", type: "material" },
    ];

    console.log("Creating/updating categories...");
    for (const cat of categories) {
        const { data: existing } = await supabase
            .from("ingredient_categories")
            .select("id")
            .eq("name", cat.name)
            .single();

        if (!existing) {
            await supabase.from("ingredient_categories").insert({ name: cat.name });
            console.log(`  ✓ Created: ${cat.name}`);
        }
    }

    // カテゴリマップ取得
    const { data: catData } = await supabase.from("ingredient_categories").select("*");
    const categoryMap = new Map(catData?.map(c => [c.name, c.id]) || []);

    // 3. Excelから材料を抽出
    console.log("\nExtracting items from Excel files...");

    const files = fs.readdirSync(RECIPE_DIR).filter(f => f.endsWith('.xlsx'));
    const allItems = new Map<string, { isMaterial: boolean }>();

    for (const file of files) {
        const filePath = path.join(RECIPE_DIR, file);
        const workbook = XLSX.readFile(filePath);

        for (const sheetName of workbook.SheetNames) {
            if (sheetName.includes("製造") || sheetName.includes("総合") ||
                sheetName === "Sheet1" || sheetName === "Sheet2") {
                continue;
            }

            const sheet = workbook.Sheets[sheetName];
            if (!sheet['!ref']) continue;

            const range = XLSX.utils.decode_range(sheet['!ref']);

            // ヘッダー行を探す
            let headerRow = -1;
            for (let r = 0; r <= Math.min(range.e.r, 20); r++) {
                for (let c = 0; c <= range.e.c; c++) {
                    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
                    if (cell && String(cell.v).includes("材料名")) {
                        headerRow = r;
                        break;
                    }
                }
                if (headerRow >= 0) break;
            }

            if (headerRow < 0) continue;

            // 材料名カラムを特定
            let nameCol = -1;
            for (let c = 0; c <= range.e.c; c++) {
                const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c })];
                if (cell && String(cell.v).includes("材料名")) {
                    nameCol = c;
                    break;
                }
            }

            if (nameCol < 0) continue;

            // 材料名を抽出
            for (let r = headerRow + 1; r <= range.e.r; r++) {
                const cell = sheet[XLSX.utils.encode_cell({ r, c: nameCol })];
                if (!cell || !cell.v) continue;

                const name = String(cell.v).trim();
                if (!name || name === "0" || name.length < 2) continue;

                allItems.set(name, { isMaterial: isMaterialItem(name) });
            }
        }
    }

    console.log(`Found ${allItems.size} unique items`);

    // 4. DBにインサート
    console.log("\nInserting into database...");

    let foodCount = 0;
    let materialCount = 0;

    for (const [name, info] of allItems) {
        // カテゴリ決定
        let categoryId: string | undefined;

        if (info.isMaterial) {
            // 資材の詳細カテゴリ分け
            if (name.includes("ラベル") || name.includes("シール")) {
                categoryId = categoryMap.get("ラベル・シール");
            } else if (name.includes("瓶") || name.includes("容器") || name.includes("カップ") ||
                name.includes("ペットボトル") || name.includes("ボトル")) {
                categoryId = categoryMap.get("容器・瓶");
            } else if (name.includes("発送") || name.includes("ダンボール") || name.includes("段ボール")) {
                categoryId = categoryMap.get("発送資材");
            } else if (name.includes("袋") || name.includes("パック") || name.includes("パウチ") ||
                name.includes("巻紙") || name.includes("フィルム") || name.includes("箱")) {
                categoryId = categoryMap.get("包装資材");
            } else {
                categoryId = categoryMap.get("その他資材");
            }
            materialCount++;
        } else {
            // 食材の詳細カテゴリ分け
            const nameLower = name.toLowerCase();
            if (nameLower.includes("豚") || nameLower.includes("鶏") || nameLower.includes("牛") ||
                nameLower.includes("肉") || nameLower.includes("ベーコン") || nameLower.includes("ハム") ||
                nameLower.includes("チャーシュー")) {
                categoryId = categoryMap.get("肉類");
            } else if (nameLower.includes("野菜") || nameLower.includes("玉ねぎ") || nameLower.includes("にんじん") ||
                nameLower.includes("トマト") || nameLower.includes("りんご") || nameLower.includes("もも") ||
                nameLower.includes("葱") || nameLower.includes("生姜") || nameLower.includes("にんにく")) {
                categoryId = categoryMap.get("野菜・果物");
            } else if (nameLower.includes("醤油") || nameLower.includes("みりん") || nameLower.includes("酒") ||
                nameLower.includes("塩") || nameLower.includes("砂糖") || nameLower.includes("味噌") ||
                nameLower.includes("ソース") || nameLower.includes("酢") || nameLower.includes("スープ")) {
                categoryId = categoryMap.get("調味料");
            } else if (nameLower.includes("油") || nameLower.includes("オイル") || nameLower.includes("バター") ||
                nameLower.includes("ラード") || nameLower.includes("背脂")) {
                categoryId = categoryMap.get("油脂類");
            } else if (nameLower.includes("粉") || nameLower.includes("澱粉") || nameLower.includes("片栗") ||
                nameLower.includes("麺") || nameLower.includes("小麦")) {
                categoryId = categoryMap.get("粉類");
            } else if (nameLower.includes("胡椒") || nameLower.includes("ペッパー") || nameLower.includes("スパイス") ||
                nameLower.includes("カレー") || nameLower.includes("唐辛子") || nameLower.includes("ハーブ")) {
                categoryId = categoryMap.get("スパイス");
            } else {
                categoryId = categoryMap.get("その他");
            }
            foodCount++;
        }

        const { error: insertError } = await supabase
            .from("ingredients")
            .insert({
                name,
                category_id: categoryId,
                unit_quantity: 1000,
            });

        if (insertError) {
            console.error(`  ✗ Error: ${name}`);
        }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Food items: ${foodCount}`);
    console.log(`Material items: ${materialCount}`);
    console.log(`Total: ${allItems.size}`);
}

main().catch(console.error);
