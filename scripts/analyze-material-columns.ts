// scripts/analyze-material-columns.ts
// 資材の列構造を詳細分析 - JSON出力版

import * as XLSX from "xlsx";
import * as fs from "fs";

const filePath = "C:/Users/ts/OneDrive/Desktop/作業用/レシピ/【重要】【製造】総合管理（新型）ネット専用.xlsx";
const wb = XLSX.readFile(filePath);

const result: any = { sheets: [], materials: [], ingredients: [] };

// パーフェクトラーメン系のシートを探す
const perfectSheet = wb.SheetNames.find(n => n.includes("IE-K") || (n.includes("S") && n.includes("喜多方")));
result.foundSheet = perfectSheet;

if (perfectSheet) {
    const sheet = wb.Sheets[perfectSheet];

    // ヘッダー行を探す
    let headerRow = -1;
    for (let r = 0; r <= 10; r++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c: 2 })];
        if (cell && String(cell.v).includes("材料名")) {
            headerRow = r;
            result.headerRow = r;

            // ヘッダー行の列
            const headers: any = {};
            for (let c = 0; c <= 15; c++) {
                const hCell = sheet[XLSX.utils.encode_cell({ r, c })];
                headers[`${String.fromCharCode(65 + c)}_${c}`] = hCell ? String(hCell.v) : "(empty)";
            }
            result.headers = headers;
            break;
        }
    }

    if (headerRow >= 0) {
        const range = XLSX.utils.decode_range(sheet["!ref"]!);

        // ブランド館ロゴシールを探す
        for (let r = headerRow + 1; r <= range.e.r; r++) {
            const nameCell = sheet[XLSX.utils.encode_cell({ r, c: 2 })];
            if (nameCell && (String(nameCell.v).includes("ブランド") || String(nameCell.v).includes("シール") || String(nameCell.v).includes("ラベル"))) {
                const row: any = { row: r, name: String(nameCell.v), columns: {} };
                for (let c = 0; c <= 15; c++) {
                    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
                    row.columns[String.fromCharCode(65 + c)] = cell ? cell.v : null;
                }
                result.materials.push(row);
            }
        }

        // 食材も見て比較
        let count = 0;
        for (let r = headerRow + 1; r <= range.e.r && count < 3; r++) {
            const nameCell = sheet[XLSX.utils.encode_cell({ r, c: 2 })];
            if (nameCell && nameCell.v && String(nameCell.v).length > 2 &&
                !String(nameCell.v).includes("合計") && !String(nameCell.v).includes("袋") &&
                !String(nameCell.v).includes("シール") && !String(nameCell.v).includes("ラベル") &&
                !String(nameCell.v).includes("保存") && !String(nameCell.v).includes("空白")) {
                const row: any = { row: r, name: String(nameCell.v), columns: {} };
                for (let c = 0; c <= 10; c++) {
                    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
                    row.columns[String.fromCharCode(65 + c)] = cell ? cell.v : null;
                }
                result.ingredients.push(row);
                count++;
            }
        }
    }
}

// JSONファイルに保存
fs.writeFileSync("material_analysis.json", JSON.stringify(result, null, 2), "utf8");
console.log("Analysis saved to material_analysis.json");
