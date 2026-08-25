import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { asOptionalText, getLabelCheckUserEmail } from "@/lib/label-check/server";
import type { LabelCheckMode, LabelOcrResult } from "@/lib/label-check/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_TOTAL_BYTES = 3.6 * 1024 * 1024;

export async function POST(request: Request) {
  const email = await getLabelCheckUserEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new Error("Geminiの設定がありません");

    const formData = await request.formData();
    const mode: LabelCheckMode = formData.get("mode") === "normal" ? "normal" : "simple";
    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length === 0) return NextResponse.json({ error: "画像を選択してください" }, { status: 400 });
    if (mode === "simple" && files.length !== 1) {
      return NextResponse.json({ error: "簡易チェックは画像1枚で実行してください" }, { status: 400 });
    }
    if (files.length > 4) return NextResponse.json({ error: "画像は4枚までです" }, { status: 400 });

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: "画像容量が大きすぎます。撮り直してください" }, { status: 400 });
    }
    if (files.some((file) => !ALLOWED_TYPES.has(file.type))) {
      return NextResponse.json({ error: "JPEG、PNG、WebP画像を使用してください" }, { status: 400 });
    }

    const imageParts = await Promise.all(files.map(async (file) => ({
      inlineData: {
        mimeType: file.type,
        data: Buffer.from(await file.arrayBuffer()).toString("base64"),
      },
    })));

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: mode === "simple" ? "gemini-3.5-flash-lite" : "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
        maxOutputTokens: mode === "simple" ? 1000 : 1800,
      },
    });
    const startedAt = Date.now();
    const result = await model.generateContent([{ text: mode === "simple" ? SIMPLE_PROMPT : NORMAL_PROMPT }, ...imageParts]);
    const parsed = parseOcrResponse(result.response.text(), mode);

    return NextResponse.json({
      success: true,
      data: parsed,
      mode,
      elapsed_ms: Date.now() - startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OCR解析に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseOcrResponse(text: string, mode: LabelCheckMode): LabelOcrResult {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const value = JSON.parse(cleaned) as Record<string, unknown>;
  const date = (input: unknown) => {
    const normalized = asOptionalText(input, 10);
    return normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
  };
  const confidenceValue = Number(value.confidence);
  return {
    product_name: asOptionalText(value.product_name, 500),
    raw_materials: mode === "normal" ? asOptionalText(value.raw_materials, 12000) : null,
    additives: mode === "normal" ? asOptionalText(value.additives, 4000) : null,
    allergens: mode === "normal" ? asOptionalText(value.allergens, 2000) : null,
    net_content: mode === "normal" ? asOptionalText(value.net_content, 200) : null,
    expiry_date: asOptionalText(value.expiry_date, 200),
    expiry_date_normalized: date(value.expiry_date_normalized),
    manufacturing_date: asOptionalText(value.manufacturing_date, 200),
    manufacturing_date_normalized: date(value.manufacturing_date_normalized),
    storage_method: mode === "normal" ? asOptionalText(value.storage_method, 2000) : null,
    manufacturer: mode === "normal" ? asOptionalText(value.manufacturer, 1000) : null,
    confidence: Number.isFinite(confidenceValue) ? Math.max(0, Math.min(1, confidenceValue)) : 0,
    warnings: Array.isArray(value.warnings)
      ? value.warnings.map((warning) => String(warning).slice(0, 300)).slice(0, 8)
      : [],
  };
}

const SIMPLE_PROMPT = `食品の裏ラベル画像から、日付判定に必要な項目だけを高速かつ正確に読み取ってください。
推測せず、画像に印字された情報だけを使います。賞味期限と製造日を取り違えないでください。
JSONオブジェクトだけを返してください。
{
  "product_name": "商品名。読めなければnull",
  "expiry_date": "印字された賞味期限の原文。なければnull",
  "expiry_date_normalized": "YYYY-MM-DD。確定できなければnull",
  "manufacturing_date": "印字された製造日の原文。なければnull",
  "manufacturing_date_normalized": "YYYY-MM-DD。確定できなければnull",
  "confidence": 0.95,
  "warnings": []
}`;

const NORMAL_PROMPT = `食品の裏ラベル画像を正確に読み取り、複数画像の情報を1件に統合してください。
推測せず、読めない箇所はnullまたは警告にしてください。記号、スラッシュ、括弧を省略しないでください。
JSONオブジェクトだけを返してください。
{
  "product_name": "商品名",
  "raw_materials": "原材料名の全文",
  "additives": "添加物表示",
  "allergens": "アレルギー表示",
  "net_content": "内容量",
  "expiry_date": "賞味期限の原文",
  "expiry_date_normalized": "YYYY-MM-DD。確定できなければnull",
  "manufacturing_date": "製造日の原文",
  "manufacturing_date_normalized": "YYYY-MM-DD。確定できなければnull",
  "storage_method": "保存方法",
  "manufacturer": "製造者または販売者",
  "confidence": 0.9,
  "warnings": []
}`;
