import { NextRequest, NextResponse } from "next/server";
import { del, put } from "@vercel/blob";
import { createClient } from "@supabase/supabase-js";

const MAX_IMAGE_BYTES = 250 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_SOURCE_TYPES = new Set(["manual", "rakuten", "base", "shared_folder"]);
const ALLOWED_IMAGE_ROLES = new Set(["gallery", "portrait"]);
const IMAGE_SELECT = "id, image_url, image_role, source_type, source_page_url, source_image_url, original_filename, file_size_bytes, sort_order, created_at";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function cleanText(value: FormDataEntryValue | null, maxLength = 2000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) || null : null;
}

export async function GET(request: NextRequest) {
  const recipeId = request.nextUrl.searchParams.get("recipeId");
  if (!recipeId) return NextResponse.json({ error: "recipeId が必要です" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("recipe_web_images")
    .select(IMAGE_SELECT)
    .eq("recipe_id", recipeId)
    .order("image_role")
    .order("sort_order")
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const allImages = data || [];
  return NextResponse.json({
    images: allImages.filter((image) => image.image_role === "gallery"),
    portraitImages: allImages.filter((image) => image.image_role === "portrait"),
  });
}

export async function POST(request: NextRequest) {
  let uploadedUrl: string | null = null;
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const recipeId = cleanText(formData.get("recipeId"), 100);
    const requestedSourceType = cleanText(formData.get("sourceType"), 30) || "manual";
    const sourceType = ALLOWED_SOURCE_TYPES.has(requestedSourceType) ? requestedSourceType : "manual";
    const requestedImageRole = cleanText(formData.get("imageRole"), 30) || "gallery";
    const imageRole = ALLOWED_IMAGE_ROLES.has(requestedImageRole) ? requestedImageRole : "gallery";

    if (!(file instanceof File) || !recipeId) {
      return NextResponse.json({ error: "画像ファイルとrecipeIdが必要です" }, { status: 400 });
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: "JPEG・PNG・WebP画像を選択してください" }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "画像が250KBを超えています。画面から再選択すると自動縮小されます" }, { status: 413 });
    }

    const { data: recipe, error: recipeError } = await supabaseAdmin
      .from("recipes")
      .select("id")
      .eq("id", recipeId)
      .single();
    if (recipeError || !recipe) return NextResponse.json({ error: "レシピが見つかりません" }, { status: 404 });

    const { data: lastImage } = await supabaseAdmin
      .from("recipe_web_images")
      .select("sort_order")
      .eq("recipe_id", recipeId)
      .eq("image_role", imageRole)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = Number(lastImage?.sort_order ?? -1) + 1;
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const blob = await put(`recipe-web-images/${recipeId}/${imageRole}/${Date.now()}.${extension}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
    });
    uploadedUrl = blob.url;

    const imageValues = {
      image_url: blob.url,
      image_role: imageRole,
      source_type: imageRole === "portrait" ? "manual" : sourceType,
      source_page_url: cleanText(formData.get("sourcePageUrl")),
      source_image_url: cleanText(formData.get("sourceImageUrl")),
      original_filename: cleanText(formData.get("originalFilename"), 500) || file.name.slice(0, 500),
      file_size_bytes: file.size,
      sort_order: nextOrder,
    };

    const { data, error } = await supabaseAdmin
      .from("recipe_web_images")
      .insert({ recipe_id: recipeId, ...imageValues })
      .select(IMAGE_SELECT)
      .single();

    if (error) {
      await del(blob.url).catch(() => undefined);
      if (error.code === "23505") return NextResponse.json({ error: "同じ取得元の画像は登録済みです" }, { status: 409 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ image: data });
  } catch (error: any) {
    if (uploadedUrl) await del(uploadedUrl).catch(() => undefined);
    return NextResponse.json({ error: error.message || "Web商品画像の登録に失敗しました" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const recipeId = String(body.recipeId || "");
    const imageOrder = Array.isArray(body.imageOrder) ? body.imageOrder : [];
    const requestedImageRole = String(body.imageRole || "gallery");
    const imageRole = ALLOWED_IMAGE_ROLES.has(requestedImageRole) ? requestedImageRole : "gallery";
    if (!recipeId || imageOrder.length === 0) {
      return NextResponse.json({ error: "recipeIdと画像順が必要です" }, { status: 400 });
    }

    for (const [index, image] of imageOrder.entries()) {
      const { error } = await supabaseAdmin
        .from("recipe_web_images")
        .update({ sort_order: index })
        .eq("id", String(image.id || ""))
        .eq("recipe_id", recipeId)
        .eq("image_role", imageRole);
      if (error) throw error;
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "並び替えに失敗しました" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { imageId, imageIds, recipeId } = await request.json();
    const requestedIds = Array.isArray(imageIds)
      ? imageIds.map(String).filter(Boolean).slice(0, 500)
      : imageId ? [String(imageId)] : [];
    if (requestedIds.length === 0 || !recipeId) return NextResponse.json({ error: "画像IDとrecipeIdが必要です" }, { status: 400 });

    const { data: images, error } = await supabaseAdmin
      .from("recipe_web_images")
      .select("id, image_url")
      .in("id", requestedIds)
      .eq("recipe_id", recipeId);
    if (error || !images?.length) return NextResponse.json({ error: "画像が見つかりません" }, { status: 404 });

    await del(images.map((image) => image.image_url)).catch(() => undefined);
    const { error: deleteError } = await supabaseAdmin
      .from("recipe_web_images")
      .delete()
      .in("id", images.map((image) => image.id))
      .eq("recipe_id", recipeId);
    if (deleteError) throw deleteError;
    return NextResponse.json({ success: true, deleted: images.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "削除に失敗しました" }, { status: 500 });
  }
}
