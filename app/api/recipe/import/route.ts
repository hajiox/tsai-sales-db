// app/api/recipe/import/route.ts
// Excelインポート API

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface ImportResult {
    fileName: string;
    sheetName: string;
    status: "success" | "error" | "skipped";
    message: string;
    recipeName?: string;
}

// ヘッダー行を探す関数
function findHeaderRow(sheet: XLSX.WorkSheet): number {
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
    for (let row = 0; row <= Math.min(10, range.e.r); row++) {
        const cellA = sheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
        if (cellA && cellA.v === "NO") {
            return row;
        }
    }
    return 4; // デフォルト
}

// 商品名を抽出する関数
function extractProductName(sheet: XLSX.WorkSheet): string | null {
    // B2, C2, B3, C3 あたりを探す
    const candidates = [
        sheet["B2"], sheet["C2"], sheet["B3"], sheet["C3"],
        sheet["A2"], sheet["A3"]
    ];

    for (const cell of candidates) {
        if (cell && cell.v && typeof cell.v === "string" && cell.v.length > 2) {
            // 「商品名」などのラベルではなく、実際の商品名か確認
            if (!cell.v.includes("商品名") && !cell.v.includes("開発日") && !cell.v.includes("価格")) {
                return cell.v;
            }
        }
    }
    return null;
}

// 開発日を抽出する関数
function extractDevelopmentDate(sheet: XLSX.WorkSheet): string | null {
    // D2, E2, D3, E3 あたりを探す
    for (let row = 1; row <= 5; row++) {
        for (let col = 0; col <= 10; col++) {
            const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
            if (cell && cell.t === "n" && cell.v > 40000 && cell.v < 50000) {
                // Excelの日付シリアル値
                const date = XLSX.SSF.parse_date_code(cell.v);
                return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
            }
        }
    }
    return null;
}

// 材料データを抽出する関数
function extractIngredients(sheet: XLSX.WorkSheet, headerRow: number): any[] {
    const ingredients: any[] = [];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");

    // ヘッダーの列インデックスを特定
    let colMap: Record<string, number> = {};
    for (let col = 0; col <= range.e.c; col++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c: col })];
        if (cell && cell.v) {
            const header = String(cell.v).trim();
            if (header === "材料名") colMap["name"] = col;
            if (header.includes("使用量") || header.includes("1本使用量")) colMap["usage"] = col;
            if (header.includes("原価") || header.includes("1本原価")) colMap["cost"] = col;
            if (header === "％" || header.includes("配合")) colMap["percentage"] = col;
            if (header.includes("熱量")) colMap["calories"] = col;
            if (header.includes("タンパク")) colMap["protein"] = col;
            if (header.includes("脂質")) colMap["fat"] = col;
            if (header.includes("炭水化物")) colMap["carbohydrate"] = col;
            if (header.includes("食塩")) colMap["sodium"] = col;
        }
    }

    // 材料データを読み取り
    for (let row = headerRow + 1; row <= Math.min(range.e.r, headerRow + 50); row++) {
        const nameCell = sheet[XLSX.utils.encode_cell({ r: row, c: colMap["name"] || 1 })];
        if (!nameCell || !nameCell.v) continue;

        const name = String(nameCell.v).trim();
        if (!name || name === "合計" || name === "小計" || name.includes("---")) continue;

        const getValue = (colKey: string): number | null => {
            const col = colMap[colKey];
            if (col === undefined) return null;
            const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
            if (!cell || cell.v === undefined) return null;
            const val = parseFloat(cell.v);
            return isNaN(val) ? null : val;
        };

        ingredients.push({
            ingredient_name: name,
            usage_amount: getValue("usage"),
            calculated_cost: getValue("cost"),
            percentage: getValue("percentage"),
            calories: getValue("calories"),
            protein: getValue("protein"),
            fat: getValue("fat"),
            carbohydrate: getValue("carbohydrate"),
            sodium: getValue("sodium"),
        });
    }

    return ingredients;
}

// カテゴリを判定する関数
async function determineCategory(sheetName: string, productName: string): Promise<string | null> {
    const { data: categories } = await supabase
        .from("recipe_categories")
        .select("id, name");

    if (!categories) return null;

    const text = (sheetName + " " + productName).toLowerCase();

    for (const cat of categories) {
        const catName = cat.name.toLowerCase();
        if (text.includes(catName) ||
            (catName.includes("ネット") && text.includes("shopee")) ||
            (catName.includes("ネット") && text.includes("p】"))) {
            return cat.id;
        }
    }

    // 特定パターンでの判定
    if (text.includes("霊山")) {
        const reizan = categories.find(c => c.name.includes("霊山"));
        if (reizan) return reizan.id;
    }
    if (text.includes("shopee") || text.includes("台湾")) {
        const shopee = categories.find(c => c.name.includes("Shopee") || c.name.includes("台湾"));
        if (shopee) return shopee.id;
    }

    // デフォルトは「その他」
    const other = categories.find(c => c.name === "その他");
    return other?.id || null;
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const files = formData.getAll("files") as File[];

        const results: ImportResult[] = [];

        for (const file of files) {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: "array" });

            for (const sheetName of workbook.SheetNames) {
                // スキップするシート
                if (sheetName.includes("原価計算") ||
                    sheetName.includes("データベース") ||
                    sheetName.includes("加工記録") ||
                    sheetName === "卸商品原価") {
                    results.push({
                        fileName: file.name,
                        sheetName,
                        status: "skipped",
                        message: "システムシートのためスキップ",
                    });
                    continue;
                }

                const sheet = workbook.Sheets[sheetName];
                if (!sheet || !sheet["!ref"]) {
                    results.push({
                        fileName: file.name,
                        sheetName,
                        status: "skipped",
                        message: "空のシート",
                    });
                    continue;
                }

                try {
                    const productName = extractProductName(sheet) || sheetName;

                    // 既存チェック
                    const { data: existing } = await supabase
                        .from("recipes")
                        .select("id")
                        .eq("name", productName)
                        .single();

                    if (existing) {
                        results.push({
                            fileName: file.name,
                            sheetName,
                            status: "skipped",
                            message: "同名のレシピが既に存在します",
                            recipeName: productName,
                        });
                        continue;
                    }

                    const developmentDate = extractDevelopmentDate(sheet);
                    const headerRow = findHeaderRow(sheet);
                    const ingredients = extractIngredients(sheet, headerRow);
                    const categoryId = await determineCategory(sheetName, productName);

                    // 総原価を計算
                    const totalCost = ingredients.reduce((sum, ing) =>
                        sum + (ing.calculated_cost || 0), 0);

                    // レシピを作成
                    const { data: recipe, error: recipeError } = await supabase
                        .from("recipes")
                        .insert({
                            name: productName,
                            development_date: developmentDate,
                            category_id: categoryId,
                            source_file: file.name,
                            source_sheet: sheetName,
                            total_cost: totalCost,
                            unit_cost: totalCost / 400, // デフォルト製造数
                            production_quantity: 400,
                            status: "active",
                        })
                        .select("id")
                        .single();

                    if (recipeError) {
                        throw new Error(recipeError.message);
                    }

                    // 材料を登録
                    if (ingredients.length > 0) {
                        const ingredientData = ingredients.map((ing, index) => ({
                            recipe_id: recipe.id,
                            ingredient_name: ing.ingredient_name,
                            usage_amount: ing.usage_amount,
                            calculated_cost: ing.calculated_cost,
                            percentage: ing.percentage,
                            display_order: index + 1,
                            calories: ing.calories,
                            protein: ing.protein,
                            fat: ing.fat,
                            carbohydrate: ing.carbohydrate,
                            sodium: ing.sodium,
                        }));

                        await supabase
                            .from("recipe_ingredients")
                            .insert(ingredientData);
                    }

                    results.push({
                        fileName: file.name,
                        sheetName,
                        status: "success",
                        message: `${ingredients.length}件の材料をインポート`,
                        recipeName: productName,
                    });
                } catch (error: any) {
                    results.push({
                        fileName: file.name,
                        sheetName,
                        status: "error",
                        message: error.message || "インポートエラー",
                    });
                }
            }
        }

        return NextResponse.json({ results });
    } catch (error: any) {
        console.error("Import API error:", error);
        return NextResponse.json(
            { error: error.message || "Internal server error" },
            { status: 500 }
        );
    }
}
