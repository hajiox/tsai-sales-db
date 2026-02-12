// scripts/find-cost-items.ts
// 人件費、送料、電気代などを探す

import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

const RECIPE_DIR = "C:/Users/ts/OneDrive/Desktop/作業用/レシピ";
const filePath = path.join(RECIPE_DIR, "【重要】【製造】総合管理（新型）ネット専用.xlsx");

const wb = XLSX.readFile(filePath);

// いくつかのレシピシートを確認
const keywords = ["人件", "送料", "電気", "ヤマト", "佐川", "宅急便", "配送", "光熱", "水道", "ガス", "賃", "資材・"];

const found: any[] = [];

for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet["!ref"]) continue;

    const range = XLSX.utils.decode_range(sheet["!ref"]!);

    for (let r = 0; r <= Math.min(range.e.r, 70); r++) {
        for (let c = 0; c <= Math.min(range.e.c, 10); c++) {
            const cell = sheet[XLSX.utils.encode_cell({ r, c })];
            if (cell && typeof cell.v === "string") {
                const val = String(cell.v);
                for (const kw of keywords) {
                    if (val.includes(kw)) {
                        // 周辺セルも確認（価格を探す）
                        let price = null;
                        for (let dc = 1; dc <= 5; dc++) {
                            const nextCell = sheet[XLSX.utils.encode_cell({ r, c: c + dc })];
                            if (nextCell && typeof nextCell.v === "number" && nextCell.v > 0) {
                                price = nextCell.v;
                                break;
                            }
                        }
                        found.push({
                            sheet: sheetName,
                            cell: XLSX.utils.encode_cell({ r, c }),
                            value: val,
                            price: price
                        });
                        break;
                    }
                }
            }
        }
    }
}

// 重複除去
const unique = found.filter((f, i, arr) =>
    arr.findIndex(x => x.sheet === f.sheet && x.value === f.value) === i
);

// JSONで保存
fs.writeFileSync("cost_items_found.json", JSON.stringify(unique, null, 2), "utf8");
console.log(`Found ${unique.length} cost items, saved to cost_items_found.json`);
