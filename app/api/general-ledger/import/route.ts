/**
* TSA 財務分析システム
* 総勘定元帳インポートAPI
* ver.42 (2025-08-15 JST)
* - 通常月CSV形式に対応（元帳主科目コード形式）
* - カラム番号を正しい位置に修正
* 
* ファイル: /app/api/general-ledger/import/route.ts
*/

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as iconv from "iconv-lite";

// Node.js runtime強制（Edge Runtimeでの文字コード問題回避）
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const supabase = createClient(
 process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })(),
 process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })()
);

/**
* 文字コード自動判定
*/
function detectEncoding(buffer: Buffer): string {
 // BOMチェック
 if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
   return "utf-8";
 }
 
 // 簡易的な判定：日本語文字列を含むかチェック
 try {
   const utf8Text = buffer.toString("utf-8");
   if (utf8Text.includes("総勘定元帳") || utf8Text.includes("勘定科目")) {
     return "utf-8";
   }
 } catch {}
 
 return "shift_jis";
}

/**
* 年月のゆるい解釈
*/
function parseYearMonth(yearRaw: any, monthRaw: any): string {
 let year = Number(String(yearRaw).replace(/[年令和]/g, "").trim());
 let month = Number(String(monthRaw).replace(/[月]/g, "").trim());
 
 // 令和対応
 if (String(yearRaw).includes("令和") || year < 100) {
   if (year < 100) year = year + 2018; // 令和元年 = 2019
 }
 
 // 全角数字対応
 const zenToHan = (str: string) => str.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xfee0));
 if (isNaN(year)) year = Number(zenToHan(String(yearRaw)));
 if (isNaN(month)) month = Number(zenToHan(String(monthRaw)));
 
 // 範囲チェック
 if (year < 2020 || year > 2030) year = new Date().getFullYear();
 if (month < 1 || month > 13) month = new Date().getMonth() + 1;
 
 return `${year}${String(month).padStart(2, "0")}`;
}

/**
* CSVパース（シンプル版）
*/
function parseCSV(text: string): { headers: string[], rows: string[][] } {
 const lines = text.split(/\r?\n/);
 const headers = lines[0]?.split(/[,\t]/) || [];
 const rows = lines.slice(1)
   .filter(line => line.trim())
   .map(line => line.split(/[,\t]/));
 return { headers, rows };
}

export async function POST(req: NextRequest) {
 const stage = { current: "init" };
 
 try {
   stage.current = "parse-form";
   const formData = await req.formData();
   const file = formData.get("file") as File;
   
   // 年月の取得（複数のキー名に対応）
   const yearRaw = formData.get("year") || formData.get("targetYear") || 
                   formData.get("reportMonth")?.toString().split("-")[0];
   const monthRaw = formData.get("month") || formData.get("period") || 
                    formData.get("reportMonth")?.toString().split("-")[1];
   
   if (!file) {
     return NextResponse.json({ 
       ok: false, 
       stage: stage.current,
       error: "ファイルが選択されていません" 
     }, { status: 400 });
   }
   
   stage.current = "read-file";
   const buffer = Buffer.from(await file.arrayBuffer());
   const encoding = detectEncoding(buffer);
   const text = iconv.decode(buffer, encoding);
   
   stage.current = "parse-yyyymm";
   const yyyymm = parseYearMonth(yearRaw, monthRaw);
   const reportMonth = `${yyyymm.slice(0,4)}-${yyyymm.slice(4,6)}-01`;
   
   stage.current = "save-raw";
   // RAW保存
   await supabase.from("gl_raw_uploads").insert({
     yyyymm,
     file_name: file.name,
     encoding,
     size: buffer.length,
     content: text
   });
   
   stage.current = "parse-csv";
   const { headers, rows } = parseCSV(text);
   
   // ヘッダーの重複対応
   const headerMap = new Map<string, number>();
   headers.forEach((h, i) => {
     const count = headerMap.get(h) || 0;
     if (count > 0) {
       headers[i] = `${h}_${count + 1}`;
     }
     headerMap.set(h, count + 1);
   });
   
   stage.current = "process-data";
   // 既存データ削除
   await supabase
     .from("general_ledger")
     .delete()
     .eq("report_month", reportMonth);
   
   // データ処理（通常月CSV形式対応）
   const transactions = [];
   const accountMaster = new Map();
   let currentAccount = { code: "", name: "" };
   
   for (const row of rows) {
     // タイトル行・集計行スキップ（摘要欄の※印をチェック）
     if (row[0]?.includes("総勘定元帳") || row[35]?.includes("※")) continue;
     
     // 勘定科目の更新（元帳主科目コード：列7、主科目名：列8）
     const accountCode = row[7]?.trim();
     if (accountCode && accountCode !== "") {
       currentAccount.code = accountCode;
       currentAccount.name = row[8]?.trim() || "";
       accountMaster.set(accountCode, currentAccount.name);
     }
     
     // 日付構築（取引年：列3、取引月：列4、取引日：列5）
     const year = row[3]?.trim();
     const month = row[4]?.trim();
     const day = row[5]?.trim();
     
     // 日付が揃っていない行はスキップ
     if (!year || !month || !day) continue;
     
     // 日付フォーマット整形
     const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
     
     // 取引データ作成
     transactions.push({
       report_month: reportMonth,
       account_code: currentAccount.code,
       transaction_date: dateStr,
       counter_account: row[22]?.trim() || "",  // 相手主科目コード
       description: row[35]?.trim() || "",       // 摘要
       debit_amount: parseInt(row[36]?.replace(/,/g, "") || "0"),  // 借方金額
       credit_amount: parseInt(row[37]?.replace(/,/g, "") || "0"), // 貸方金額
       balance: parseInt(row[38]?.replace(/,/g, "") || "0"),       // 残高
       sheet_no: 1,
       row_no: transactions.length + 1
     });
   }
   
   stage.current = "upsert-master";
   // 勘定科目マスタ更新
   const masterData = Array.from(accountMaster.entries()).map(([code, name]) => ({
     account_code: code,
     account_name: name,
     account_type: "未分類",
     is_active: true
   }));
   
   if (masterData.length > 0) {
     await supabase
       .from("account_master")
       .upsert(masterData, { onConflict: "account_code" });
   }
   
   stage.current = "insert-transactions";
   // 取引データ挿入（バッチ処理）
   const batchSize = 500;
   for (let i = 0; i < transactions.length; i += batchSize) {
     const batch = transactions.slice(i, i + batchSize);
     await supabase.from("general_ledger").insert(batch);
   }
   
   stage.current = "update-balance";
   // 月次残高更新
   await supabase.rpc("update_monthly_balance", { target_month: reportMonth });
   
   return NextResponse.json({
     ok: true,
     message: "インポート完了",
     stats: {
       yyyymm,
       reportMonth,
       encoding,
       accounts: masterData.length,
       transactions: transactions.length
     }
   });
   
 } catch (error: any) {
   console.error(`Error at stage ${stage.current}:`, error);
   return NextResponse.json({
     ok: false,
     stage: stage.current,
     error: error.message || "処理中にエラーが発生しました",
     detail: error.toString()
   }, { status: 500 });
 }
}
