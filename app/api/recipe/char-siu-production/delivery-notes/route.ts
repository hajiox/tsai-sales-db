export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import {
  adminDeliveryNoteScan,
  DELIVERY_NOTE_MATERIALS,
  isCompleteDeliveryNoteScan,
  normalizeDeliveryNoteItems,
} from "@/lib/char-siu-delivery-note";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

type PendingRow = {
  id: string;
  doc_scanner_doc_id: string;
  counterparty_name: string | null;
  doc_date: string | null;
  item_name: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  amount: number | null;
  tax_rate: number | null;
  source_type: string | null;
  created_at: string;
};

export async function GET(request: Request) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;

    const productionDate = normalizeDate(new URL(request.url).searchParams.get("productionDate"));
    let scanQuery = supabase
      .from("char_siu_delivery_note_scans")
      .select("id,status,document_date,target_production_date,source_kind,doc_scanner_doc_id,file_names,extracted_items,created_at")
      .in("status", ["needs_review", "ready"])
      .is("used_run_id", null)
      .order("created_at", { ascending: false })
      .limit(30);
    if (productionDate) scanQuery = scanQuery.eq("target_production_date", productionDate);

    const [scanResult, pendingResult] = await Promise.all([
      scanQuery,
      supabase
        .from("pending_estimate_items")
        .select("id,doc_scanner_doc_id,counterparty_name,doc_date,item_name,quantity,unit,unit_price,amount,tax_rate,source_type,created_at")
        .in("source_type", ["receipt", "delivery_slip"])
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);
    if (scanResult.error) throw scanResult.error;
    if (pendingResult.error) throw pendingResult.error;

    const scans = scanResult.data || [];
    const importedDocIds = new Set(scans.map((scan) => scan.doc_scanner_doc_id).filter(Boolean));
    const grouped = new Map<string, PendingRow[]>();
    for (const row of (pendingResult.data || []) as PendingRow[]) {
      if (!row.doc_scanner_doc_id || !matchesTargetMaterial(row.item_name)) continue;
      const rows = grouped.get(row.doc_scanner_doc_id) || [];
      rows.push(row);
      grouped.set(row.doc_scanner_doc_id, rows);
    }

    const docScannerDocuments = [...grouped.entries()]
      .filter(([docId]) => !importedDocIds.has(docId))
      .map(([docId, rows]) => ({
        docId,
        counterpartyName: rows[0]?.counterparty_name || "取引先不明",
        documentDate: rows[0]?.doc_date || null,
        sourceType: rows[0]?.source_type || "receipt",
        receivedAt: rows[0]?.created_at || null,
        items: rows.map((row) => ({
          id: row.id,
          name: row.item_name,
          quantity: row.quantity,
          unit: row.unit,
          unitPrice: row.unit_price,
          amount: row.amount,
          taxRate: row.tax_rate,
        })),
      }));

    return NextResponse.json({
      success: true,
      scans: scans.map(adminDeliveryNoteScan),
      docScannerDocuments,
    });
  } catch (error: any) {
    console.error("char siu delivery-note inbox GET error:", error);
    return NextResponse.json({ success: false, error: error.message || "納品書の受信一覧を取得できませんでした" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;
    const token = await getToken({ req: request as any });
    const body = await request.json().catch(() => ({}));
    const docId = String(body.docScannerDocId || "").trim();
    const targetProductionDate = normalizeDate(body.targetProductionDate);
    if (!docId || !targetProductionDate) {
      return NextResponse.json({ success: false, error: "DocScanner書類と製造日を指定してください" }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("char_siu_delivery_note_scans")
      .select("id,status,document_date,target_production_date,source_kind,doc_scanner_doc_id,file_names,extracted_items,created_at")
      .eq("doc_scanner_doc_id", docId)
      .eq("target_production_date", targetProductionDate)
      .is("used_run_id", null)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return NextResponse.json({ success: true, scan: adminDeliveryNoteScan(existing) });

    const { data: rows, error: rowError } = await supabase
      .from("pending_estimate_items")
      .select("id,doc_scanner_doc_id,counterparty_name,doc_date,item_name,quantity,unit,unit_price,amount,tax_rate,source_type,created_at")
      .eq("doc_scanner_doc_id", docId)
      .in("source_type", ["receipt", "delivery_slip"])
      .order("created_at", { ascending: true });
    if (rowError) throw rowError;
    if (!rows?.length) {
      return NextResponse.json({ success: false, error: "DocScannerの明細が見つかりません" }, { status: 404 });
    }

    const extractedItems = await extractDocScannerItems(rows as PendingRow[]);
    const { data: inserted, error: insertError } = await supabase
      .from("char_siu_delivery_note_scans")
      .insert({
        source_kind: "doc_scanner",
        doc_scanner_doc_id: docId,
        target_production_date: targetProductionDate,
        document_date: rows[0]?.doc_date || null,
        file_names: [`DocScanner ${docId.slice(0, 8)}`],
        status: "needs_review",
        extracted_items: extractedItems,
        error_message: isCompleteDeliveryNoteScan(extractedItems) ? null : "単価または仕入数量の確認が必要です",
        created_by: String(token?.email || ""),
      })
      .select("id,status,document_date,target_production_date,source_kind,doc_scanner_doc_id,file_names,extracted_items,created_at")
      .single();
    if (insertError) throw insertError;
    return NextResponse.json({ success: true, scan: adminDeliveryNoteScan(inserted) });
  } catch (error: any) {
    console.error("char siu DocScanner import error:", error);
    return NextResponse.json({ success: false, error: error.message || "DocScannerから取り込めませんでした" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const unauthorized = await requireAuthorized(request);
    if (unauthorized) return unauthorized;
    const token = await getToken({ req: request as any });
    const body = await request.json().catch(() => ({}));
    const scanId = String(body.scanId || "").trim();
    const targetProductionDate = normalizeDate(body.targetProductionDate);
    const extractedItems = normalizeDeliveryNoteItems((Array.isArray(body.items) ? body.items : []).map((item: any) => ({
      material_key: item.key,
      source_item_name: item.sourceItemName,
      purchase_unit_quantity_g: item.purchaseUnitQuantityG,
      purchase_price_tax_included: item.purchasePriceTaxIncluded,
      tax_rate: item.taxRate,
      confidence: item.confidence ?? 1,
      evidence: item.evidence || "管理者確認",
    })));
    if (!scanId || !targetProductionDate) {
      return NextResponse.json({ success: false, error: "納品書と製造日を指定してください" }, { status: 400 });
    }
    if (!isCompleteDeliveryNoteScan(extractedItems)) {
      return NextResponse.json({ success: false, error: "豚バラ肉・ネギ・生姜の仕入数量と税込価格を入力してください" }, { status: 400 });
    }

    const { data: updated, error } = await supabase
      .from("char_siu_delivery_note_scans")
      .update({
        target_production_date: targetProductionDate,
        extracted_items: extractedItems,
        status: "ready",
        error_message: null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: String(token?.email || ""),
      })
      .eq("id", scanId)
      .is("used_run_id", null)
      .select("id,status,document_date,target_production_date,source_kind,doc_scanner_doc_id,file_names,extracted_items,created_at")
      .maybeSingle();
    if (error) throw error;
    if (!updated) return NextResponse.json({ success: false, error: "納品書が使用済みか、見つかりません" }, { status: 409 });
    return NextResponse.json({ success: true, scan: adminDeliveryNoteScan(updated) });
  } catch (error: any) {
    console.error("char siu delivery-note review error:", error);
    return NextResponse.json({ success: false, error: error.message || "納品書を確定できませんでした" }, { status: 500 });
  }
}

async function extractDocScannerItems(rows: PendingRow[]) {
  const relevantRows = rows.filter((row) => matchesTargetMaterial(row.item_name));
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (apiKey && relevantRows.length) {
    try {
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      });
      const result = await model.generateContent(buildDocScannerPrompt(relevantRows));
      const parsed = JSON.parse((await result.response).text().replace(/```json/gi, "").replace(/```/g, "").trim());
      const normalized = normalizeDeliveryNoteItems(parsed.items);
      if (normalized.length) return normalized;
    } catch (error) {
      console.warn("DocScanner delivery-note normalization fell back to deterministic parsing:", error);
    }
  }
  return normalizeDeliveryNoteItems(relevantRows.map(fallbackExtractedItem).filter(Boolean));
}

function fallbackExtractedItem(row: PendingRow) {
  const definition = DELIVERY_NOTE_MATERIALS.find((item) => item.aliases.some((alias) => normalizeName(row.item_name).includes(normalizeName(alias))));
  const quantityG = parseWeightG(row.item_name, row.unit);
  const rawPrice = positiveNumber(row.unit_price) || (positiveNumber(row.amount) && positiveNumber(row.quantity)
    ? positiveNumber(row.amount) / positiveNumber(row.quantity)
    : 0);
  if (!definition || !quantityG || !rawPrice) return null;
  const taxRate = normalizeTaxRate(row.tax_rate);
  const price = row.source_type === "receipt" ? rawPrice : rawPrice * (1 + taxRate);
  return {
    material_key: definition.key,
    source_item_name: row.item_name,
    purchase_unit_quantity_g: quantityG,
    purchase_price_tax_included: price,
    tax_rate: taxRate,
    confidence: 0.6,
    evidence: `${row.item_name} / ${row.quantity ?? "-"}${row.unit || ""} / ${rawPrice}円`,
  };
}

function buildDocScannerPrompt(rows: PendingRow[]) {
  return `
DocScannerが読み取った納品書またはレシート明細から、チャーシュー製造に使う3材料の仕入単位を正規化してください。

対象:
${DELIVERY_NOTE_MATERIALS.map((item) => `- ${item.key}: ${item.name} (${item.aliases.join("、")})`).join("\n")}

明細JSON:
${JSON.stringify(rows.map((row) => ({
  item_name: row.item_name,
  quantity: row.quantity,
  unit: row.unit,
  unit_price: row.unit_price,
  amount: row.amount,
  tax_rate: row.tax_rate,
  source_type: row.source_type,
})), null, 2)}

ルール:
- 推測で金額を作らない。数量または価格を確定できない材料は出力しない。
- purchase_unit_quantity_g は unit_price 1単位に対応する重量(g)。kg単価なら1000。
- source_type=receipt のunit_priceは税込として扱う。
- source_type=delivery_slip のunit_priceは税抜として扱い、食品税率（明記がなければ8%）を加算して税込価格にする。
- 同じ材料が複数ある場合はチャーシュー原料として最も明確な行を1つ選ぶ。

JSONのみ:
{"items":[{"material_key":"pork_belly|green_onion|ginger","source_item_name":"原文","purchase_unit_quantity_g":1000,"purchase_price_tax_included":1080,"tax_rate":0.08,"confidence":0.9,"evidence":"根拠"}]}`;
}

function matchesTargetMaterial(value: string) {
  const normalized = normalizeName(value);
  return DELIVERY_NOTE_MATERIALS.some((item) => item.aliases.some((alias) => normalized.includes(normalizeName(alias))));
}

function normalizeName(value: unknown) {
  return String(value || "").toLowerCase().replace(/[\s　（）()・_-]/g, "");
}

function parseWeightG(name: string, unit: string | null) {
  const text = String(name || "").replace(/,/g, "");
  const kg = text.match(/(\d+(?:\.\d+)?)\s*(?:kg|ｋｇ|キログラム)/i);
  if (kg) return Number(kg[1]) * 1000;
  const gram = text.match(/(\d+(?:\.\d+)?)\s*(?:g|ｇ|グラム)/i);
  if (gram) return Number(gram[1]);
  if (/kg|ｋｇ|キログラム/i.test(String(unit || ""))) return 1000;
  return 0;
}

function normalizeTaxRate(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.08;
  return number > 1 ? number / 100 : Math.max(0, number);
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeDate(value: unknown) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

async function requireAuthorized(request: Request) {
  const token = await getToken({ req: request as any });
  if (!token || token.email !== "aizubrandhall@gmail.com") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
