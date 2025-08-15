/**
 * TSA 財務分析システム
 * 決算月インポートAPI
 * ver.1 (2025-08-15 JST)
 * - 決算用CSV（13月データ）専用処理
 * - closing_adjustmentsテーブルに保存
 * 
 * ファイル: /app/api/general-ledger/import-closing/route.ts
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as iconv from "iconv-lite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * 文字コード自動判定
 */
function detectEncoding(buffer: Buffer): string {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return "utf-8";
  }
  
  try {
    const utf8Text = buffer.toString("utf-8");
    if (utf8Text.includes("総勘定元帳") || utf8Text.includes("決算")) {
      return "utf-8";
    }
  } catch {}
  
  return "shift_jis";
}

/**
 * CSVパース
 */
function parseCSV(text: string): { headers: string[], rows: string[][] } {
  const lines = text.split(/\r?\n/);
  const headers = lines[0]?.split(/[,\t]/) || [];
  const rows = lines.slice(1)
    .filter(line => line.trim())
    .map(line => line.split(/[,\t]/));
  return { headers, rows };
}

/**
 * 調整タイプを判定
 */
function determineAdjustmentType(description: string): string {
  if (description.includes("減価償却")) return "減価償却";
  if (description.includes("引当") || description.includes("引き当て")) return "引当金";
  if (description.includes("税")) return "税効果";
  if (description.includes("棚卸")) return "棚卸調整";
  if (description.includes("未払") || description.includes("未収")) return "経過勘定";
  if (description.includes("振替")) return "損益振替";
  return "期末調整";
}

export async function POST(req: NextRequest) {
  const stage = { current: "init" };
  
  try {
    stage.current = "parse-form";
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const fiscalYear = formData.get("fiscalYear") || new Date().getFullYear();
    
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
    
    stage.current = "save-raw";
    // RAW保存（決算用として識別可能に）
    await supabase.from("gl_raw_uploads").insert({
      yyyymm: `${fiscalYear}13`, // 13月として保存
      file_name: file.name,
      encoding,
      size: buffer.length,
      content: text
    });
    
    stage.current = "parse-csv";
    const { headers, rows } = parseCSV(text);
    
    stage.current = "process-data";
    // 既存の決算データを削除
    await supabase
      .from("closing_adjustments")
      .delete()
      .eq("fiscal_year", fiscalYear);
    
    // 決算調整データ処理
    const adjustments = [];
    const accountMaster = new Map();
    let currentAccount = { code: "", name: "" };
    let rowNumber = 0;
    
    for (const row of rows) {
      // タイトル行スキップ
      if (row[0]?.includes("総勘定元帳")) continue;
      
      // 勘定科目の更新（元帳主科目コード：列7、主科目名：列8）
      const accountCode = row[7]?.trim();
      if (accountCode && accountCode !== "") {
        currentAccount.code = accountCode;
        currentAccount.name = row[8]?.trim() || "";
        accountMaster.set(accountCode, currentAccount.name);
      }
      
      // 取引月が13（決算月）のデータのみ処理
      const month = row[4]?.trim();
      if (month !== "13") continue;
      
      const description = row[35]?.trim() || "";
      
      // 集計行（※印）は重要な決算情報の可能性があるので含める
      // ただし前月繰越は除外
      if (description.includes("前月繰越")) continue;
      
      rowNumber++;
      
      // 決算調整データ作成
      adjustments.push({
        fiscal_year: Number(fiscalYear),
        fiscal_month: 7,
        account_code: currentAccount.code,
        account_name: currentAccount.name,
        adjustment_type: determineAdjustmentType(description),
        counter_account: row[22]?.trim() || "",
        description: description,
        debit_amount: parseInt(row[36]?.replace(/,/g, "") || "0"),
        credit_amount: parseInt(row[37]?.replace(/,/g, "") || "0"),
        balance: parseInt(row[38]?.replace(/,/g, "") || "0"),
        row_no: rowNumber
      });
    }
    
    stage.current = "insert-adjustments";
    // 決算調整データ挿入（バッチ処理）
    if (adjustments.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < adjustments.length; i += batchSize) {
        const batch = adjustments.slice(i, i + batchSize);
        await supabase.from("closing_adjustments").insert(batch);
      }
    }
    
    // 勘定科目マスタの更新（新規科目があれば）
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
    
    return NextResponse.json({
      ok: true,
      message: "決算データインポート完了",
      stats: {
        fiscalYear: Number(fiscalYear),
        adjustments: adjustments.length,
        accounts: masterData.length,
        types: [...new Set(adjustments.map(a => a.adjustment_type))]
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
