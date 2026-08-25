import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { judgeExpiryDate, parseShelfLifeDays } from "@/lib/label-check/judgment";
import { getLabelCheckAdminClient, getLabelCheckUserEmail } from "@/lib/label-check/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "label-check-images";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_TOTAL_BYTES = 3.6 * 1024 * 1024;

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const payloadSchema = z.object({
  request_id: z.string().uuid(),
  mode: z.enum(["simple", "normal"]),
  file_name: optionalText(500),
  product_name: optionalText(500),
  raw_materials: optionalText(12000),
  expiry_date_printed: optionalText(200),
  expiry_date_normalized: dateOnly.nullable(),
  manufacturing_date: dateOnly.nullable().optional(),
  shelf_life: z.string().trim().min(1).max(200),
  matched_recipe: z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(500),
    shelf_life: optionalText(200),
  }).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  label_data: z.record(z.unknown()).default({}),
  save_recipe_shelf_life: z.boolean().default(false),
  save_recipe_raw_materials: z.boolean().default(false),
});

export async function POST(request: Request) {
  const email = await getLabelCheckUserEmail();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getLabelCheckAdminClient();
  const uploadedPaths: string[] = [];
  let insertedCheckId: string | null = null;

  try {
    const formData = await request.formData();
    const payloadText = formData.get("payload");
    if (typeof payloadText !== "string") {
      return NextResponse.json({ error: "判定情報がありません" }, { status: 400 });
    }
    const payload = payloadSchema.parse(JSON.parse(payloadText));
    if (payload.mode === "normal" && !payload.matched_recipe) {
      return NextResponse.json({ error: "通常チェックではレシピを選択してください" }, { status: 400 });
    }
    if (!payload.expiry_date_normalized) {
      return NextResponse.json({ error: "賞味期限を確認してください" }, { status: 400 });
    }

    const shelfLifeDays = parseShelfLifeDays(payload.shelf_life);
    if (!shelfLifeDays) {
      return NextResponse.json({ error: "賞味期限期間を解析できません" }, { status: 400 });
    }
    const judgment = judgeExpiryDate(
      shelfLifeDays,
      payload.expiry_date_normalized,
      payload.manufacturing_date || null,
    );

    const { data: duplicate, error: duplicateError } = await supabase
      .from("label_checks")
      .select("id, judgment, shelf_life, shelf_life_days, expected_expiry, deviation_percent, deviation_days")
      .eq("request_id", payload.request_id)
      .maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) return NextResponse.json({ ...duplicate, duplicate: true });

    const files = formData
      .getAll("images")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (files.length > 4) return NextResponse.json({ error: "画像は4枚までです" }, { status: 400 });
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: "画像容量が大きすぎます" }, { status: 400 });
    }
    if (files.some((file) => !ALLOWED_TYPES.has(file.type))) {
      return NextResponse.json({ error: "JPEG、PNG、WebP画像を使用してください" }, { status: 400 });
    }

    const checkId = crypto.randomUUID();
    const fileHash = crypto.createHash("sha256");
    const imageRows: Array<Record<string, unknown>> = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const buffer = Buffer.from(await file.arrayBuffer());
      fileHash.update(buffer);
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const storagePath = `${new Date().toISOString().slice(0, 7)}/${checkId}/${index}.${extension}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
        cacheControl: "3600",
      });
      if (uploadError) throw uploadError;
      uploadedPaths.push(storagePath);
      imageRows.push({
        check_id: checkId,
        storage_path: storagePath,
        original_name: file.name.slice(0, 500),
        mime_type: file.type,
        byte_size: buffer.length,
        sort_order: index,
      });
    }

    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(request.headers.get("user-agent") || "");
    const { error: insertError } = await supabase.from("label_checks").insert({
      id: checkId,
      request_id: payload.request_id,
      mode: payload.mode,
      file_name: payload.file_name || files[0]?.name || null,
      file_hash: files.length > 0 ? fileHash.digest("hex") : null,
      product_name: payload.product_name || null,
      raw_materials: payload.raw_materials || null,
      expiry_date_printed: payload.expiry_date_printed || payload.expiry_date_normalized,
      expiry_date_normalized: payload.expiry_date_normalized,
      manufacturing_date: payload.manufacturing_date || null,
      matched_recipe_id: payload.matched_recipe?.id || null,
      matched_recipe_name: payload.matched_recipe?.name || null,
      shelf_life: payload.shelf_life,
      shelf_life_days: judgment.shelf_life_days,
      expected_expiry: judgment.expected_expiry,
      judgment: judgment.judgment,
      deviation_percent: judgment.deviation_percent,
      deviation_days: judgment.deviation_days,
      confidence: payload.confidence ?? null,
      source: mobile ? "mobile" : "tsa",
      notes: payload.mode === "simple" ? "簡易チェック" : "通常チェック",
      label_data: payload.label_data,
      checked_by: email,
    });
    if (insertError) throw insertError;
    insertedCheckId = checkId;

    if (imageRows.length > 0) {
      const { error: imageError } = await supabase.from("label_check_images").insert(imageRows);
      if (imageError) throw imageError;
    }

    const warnings = await updateRecipeLearning(supabase, payload);
    return NextResponse.json({
      check_id: checkId,
      duplicate: false,
      judgment: judgment.judgment,
      shelf_life: payload.shelf_life,
      shelf_life_days: judgment.shelf_life_days,
      expected_expiry: judgment.expected_expiry,
      deviation_percent: judgment.deviation_percent,
      deviation_days: judgment.deviation_days,
      warnings,
    }, { status: 201 });
  } catch (error) {
    if (insertedCheckId) await supabase.from("label_checks").delete().eq("id", insertedCheckId);
    if (uploadedPaths.length > 0) await supabase.storage.from(BUCKET).remove(uploadedPaths);
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "入力内容が正しくありません" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "判定を保存できません";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function updateRecipeLearning(
  supabase: ReturnType<typeof getLabelCheckAdminClient>,
  payload: z.infer<typeof payloadSchema>,
) {
  const recipeId = payload.matched_recipe?.id;
  if (!recipeId) return [] as string[];
  const updates: Record<string, unknown> = {};
  if (payload.save_recipe_shelf_life) updates.shelf_life = payload.shelf_life;
  if (payload.save_recipe_raw_materials && payload.raw_materials) {
    updates.raw_materials_ocr = payload.raw_materials;
  }
  if (Object.keys(updates).length === 0) return [] as string[];

  const { error } = await supabase.from("recipes").update(updates).eq("id", recipeId);
  return error ? ["判定は保存しましたが、レシピ学習情報を更新できませんでした"] : [];
}
