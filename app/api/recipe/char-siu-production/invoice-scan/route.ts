export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@supabase/supabase-js";
import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import {
  DELIVERY_NOTE_MATERIALS,
  isCompleteDeliveryNoteScan,
  normalizeDeliveryNoteItems,
  publicDeliveryNoteScan,
} from "@/lib/char-siu-delivery-note";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const maxFileSize = 10 * 1024 * 1024;
const maxTotalFileSize = 3.5 * 1024 * 1024;
const maxFiles = 4;

export async function POST(request: Request) {
  let scanId = "";
  try {
    const token = await getToken({ req: request as any });
    if (!token || token.email !== "aizubrandhall@gmail.com") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const targetProductionDate = normalizeDate(formData.get("targetProductionDate"));
    if (!targetProductionDate) {
      return NextResponse.json({ success: false, error: "使用する製造日を入力してください" }, { status: 400 });
    }
    const files = formData.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
    if (files.length === 0) {
      return NextResponse.json({ success: false, error: "納品書の写真を選択してください" }, { status: 400 });
    }
    if (files.length > maxFiles) {
      return NextResponse.json({ success: false, error: `写真は${maxFiles}枚までです` }, { status: 400 });
    }
    let totalFileSize = 0;
    for (const file of files) {
      if (!allowedMimeTypes.has(file.type)) {
        return NextResponse.json({ success: false, error: "JPEG、PNG、WebP、HEICの写真を使用してください" }, { status: 400 });
      }
      if (file.size > maxFileSize) {
        return NextResponse.json({ success: false, error: "写真1枚の上限は10MBです" }, { status: 400 });
      }
      totalFileSize += file.size;
    }
    if (totalFileSize > maxTotalFileSize) {
      return NextResponse.json({ success: false, error: "写真の合計容量が大きすぎます。枚数を減らして再撮影してください" }, { status: 400 });
    }

    const { data: scan, error: scanError } = await supabase
      .from("char_siu_delivery_note_scans")
      .insert({
        file_names: files.map((file) => file.name.slice(0, 180)),
        source_kind: "mobile_qr",
        target_production_date: targetProductionDate,
        status: "processing",
        created_by: String(token.email || ""),
      })
      .select("id")
      .single();
    if (scanError) throw scanError;
    scanId = scan.id;

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new Error("納品書AIが設定されていません");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    });
    const imageParts = await Promise.all(files.map(async (file) => ({
      inlineData: {
        data: Buffer.from(await file.arrayBuffer()).toString("base64"),
        mimeType: file.type,
      },
    })));
    const prompt = buildPrompt();
    const result = await model.generateContent([prompt, ...imageParts]);
    const responseText = (await result.response).text().replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(responseText) as Record<string, unknown>;
    const items = normalizeDeliveryNoteItems(parsed.items);
    const complete = isCompleteDeliveryNoteScan(items);
    const documentDate = /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.document_date || ""))
      ? String(parsed.document_date)
      : null;

    const { data: updated, error: updateError } = await supabase
      .from("char_siu_delivery_note_scans")
      .update({
        document_date: documentDate,
        status: "needs_review",
        extracted_items: items,
        error_message: complete ? null : "豚バラ肉・ネギ・生姜のいずれかを確定できませんでした",
      })
      .eq("id", scanId)
      .select("id,status,document_date,target_production_date,source_kind,file_names,extracted_items")
      .single();
    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      scan: publicDeliveryNoteScan(updated),
      message: complete
        ? "読み取りました。PCの確認画面で単価と数量を確定してください"
        : "読み取れない材料があります。PCの確認画面で補正してください",
    });
  } catch (error: any) {
    console.error("char siu delivery note scan error:", error);
    if (scanId) {
      await supabase
        .from("char_siu_delivery_note_scans")
        .update({ status: "error", error_message: String(error?.message || "AI読取エラー").slice(0, 500) })
        .eq("id", scanId);
    }
    return NextResponse.json({ success: false, error: error.message || "納品書のAI読取に失敗しました" }, { status: 500 });
  }
}

function normalizeDate(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function buildPrompt() {
  return `
あなたは食品工場の購買担当です。添付された納品書・請求明細の写真を読み取り、チャーシュー製造で使う次の3材料だけを抽出してください。

対象材料:
${DELIVERY_NOTE_MATERIALS.map((item) => `- ${item.key}: ${item.name}（表記候補: ${item.aliases.join("、")}）`).join("\n")}

必須ルール:
1. 写真が複数ある場合は同じ納品資料の続きとして扱ってください。
2. 対象外の商品は出力しないでください。推測で品目や価格を作らないでください。
3. purchase_unit_quantity_g は、その価格に対応する重量をグラムで返してください。
4. kg単価が記載されている場合は purchase_unit_quantity_g=1000 とし、その1kg価格を返してください。
5. 総重量と行金額しかない場合は、総重量をgに換算し、その行金額を返してください。
6. 税込価格が明示されていれば purchase_price_tax_included に、税抜価格なら purchase_price_tax_excluded に入れてください。食品税率は明示がなければ8%です。
7. 数字が判読できない場合はその材料をitemsに含めないでください。
8. evidence は根拠となった行の品名・数量・単価を短く要約してください。

JSONのみを次の形式で返してください:
{
  "document_date": "YYYY-MM-DD または null",
  "items": [
    {
      "material_key": "pork_belly | green_onion | ginger",
      "source_item_name": "納品書上の品名",
      "purchase_unit_quantity_g": 1000,
      "purchase_price_tax_excluded": 1000,
      "purchase_price_tax_included": null,
      "tax_rate": 0.08,
      "confidence": 0.95,
      "evidence": "根拠"
    }
  ]
}`;
}
