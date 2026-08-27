import { NextRequest, NextResponse } from "next/server";
import { del, put } from "@vercel/blob";
import { createClient } from "@supabase/supabase-js";
import {
  RECIPE_EC_IMAGE_SITES,
  RECIPE_WEB_IMAGE_SOURCE_TYPES,
  getRecipeEcImagePlacement,
  getRecipeEcImagePlanForSite,
  type RecipeEcListingImageRole,
  type RecipeWebImageRole,
  type RecipeWebImageSourceType,
} from "@/lib/recipe-ec-images";

const MAX_IMAGE_BYTES = 250 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_SOURCE_TYPES = new Set<string>(RECIPE_WEB_IMAGE_SOURCE_TYPES);
const ALLOWED_IMAGE_ROLES = new Set<string>([
  "gallery",
  "portrait",
  "non_amazon",
  "base_only",
] satisfies RecipeWebImageRole[]);
const IMAGE_SELECT = "id, image_url, image_role, source_type, source_page_url, source_image_url, original_filename, file_size_bytes, sort_order, created_at, copied_from_image_id";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function cleanText(value: FormDataEntryValue | null, maxLength = 2000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) || null : null;
}

function isManagedPublicBlobUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function extensionForImageType(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
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
  const galleryImages = allImages.filter((image) => image.image_role === "gallery");
  const portraitImages = allImages.filter((image) => image.image_role === "portrait");
  const nonAmazonImages = allImages.filter((image) => image.image_role === "non_amazon");
  const baseOnlyImages = allImages.filter((image) => image.image_role === "base_only");
  const listingImagesByRole: Record<RecipeEcListingImageRole, typeof allImages> = {
    gallery: galleryImages,
    non_amazon: nonAmazonImages,
    base_only: baseOnlyImages,
  };
  const counts = {
    gallery: galleryImages.length,
    nonAmazon: nonAmazonImages.length,
    baseOnly: baseOnlyImages.length,
  };
  const ecImageSets = Object.fromEntries(
    RECIPE_EC_IMAGE_SITES.map((site) => [
      site,
      getRecipeEcImagePlanForSite(site, counts).map((entry) => ({
        ...listingImagesByRole[entry.imageRole][entry.imageIndex],
        ec_placement: {
          slot: entry.slot,
          listingOrder: entry.listingOrder,
          sites: entry.sites,
        },
      })),
    ]),
  );
  return NextResponse.json({
    images: galleryImages.map((image, index) => ({
      ...image,
      ec_placement: getRecipeEcImagePlacement(index),
    })),
    portraitImages,
    nonAmazonImages,
    baseOnlyImages,
    ecImageSets,
  });
}

export async function POST(request: NextRequest) {
  let uploadedUrl: string | null = null;
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const recipeId = cleanText(formData.get("recipeId"), 100);
    const requestedSourceType = cleanText(formData.get("sourceType"), 30) || "manual";
    const sourceType: RecipeWebImageSourceType = ALLOWED_SOURCE_TYPES.has(requestedSourceType)
      ? requestedSourceType as RecipeWebImageSourceType
      : "manual";
    const requestedImageRole = cleanText(formData.get("imageRole"), 30) || "gallery";
    const imageRole: RecipeWebImageRole = ALLOWED_IMAGE_ROLES.has(requestedImageRole)
      ? requestedImageRole as RecipeWebImageRole
      : "gallery";

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

export async function PUT(request: NextRequest) {
  let uploadedUrl: string | null = null;
  try {
    const body = await request.json();
    const recipeId = String(body.recipeId || "").trim();
    const sourceImageId = String(body.sourceImageId || "").trim();
    if (!recipeId || !sourceImageId) {
      return NextResponse.json({ error: "recipeIdとコピー元画像IDが必要です" }, { status: 400 });
    }

    const { data: sourceImage, error: sourceError } = await supabaseAdmin
      .from("recipe_web_images")
      .select(IMAGE_SELECT)
      .eq("id", sourceImageId)
      .eq("recipe_id", recipeId)
      .eq("image_role", "gallery")
      .single();
    if (sourceError || !sourceImage) {
      return NextResponse.json({ error: "コピー元のWeb商品画像が見つかりません" }, { status: 404 });
    }
    if (!isManagedPublicBlobUrl(sourceImage.image_url)) {
      return NextResponse.json({ error: "管理対象外の画像URLはコピーできません" }, { status: 400 });
    }

    const { data: existingCopy } = await supabaseAdmin
      .from("recipe_web_images")
      .select(IMAGE_SELECT)
      .eq("recipe_id", recipeId)
      .eq("image_role", "portrait")
      .eq("copied_from_image_id", sourceImageId)
      .maybeSingle();
    if (existingCopy) {
      return NextResponse.json(
        { error: "この画像はポートレート画像へコピー済みです", image: existingCopy },
        { status: 409 },
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try {
      response = await fetch(sourceImage.image_url, {
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error("コピー元画像を取得できませんでした");

    const contentType = (response.headers.get("content-type") || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      return NextResponse.json({ error: "コピー元が対応画像形式ではありません" }, { status: 415 });
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "コピー元画像が250KBを超えています" }, { status: 413 });
    }
    const imageBytes = await response.arrayBuffer();
    if (imageBytes.byteLength === 0 || imageBytes.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "コピー元画像のサイズが不正です" }, { status: 413 });
    }

    const { data: lastPortrait } = await supabaseAdmin
      .from("recipe_web_images")
      .select("sort_order")
      .eq("recipe_id", recipeId)
      .eq("image_role", "portrait")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = Number(lastPortrait?.sort_order ?? -1) + 1;
    const extension = extensionForImageType(contentType);
    const blob = await put(
      `recipe-web-images/${recipeId}/portrait/${Date.now()}-gallery-copy.${extension}`,
      imageBytes,
      {
        access: "public",
        addRandomSuffix: true,
        contentType,
      },
    );
    uploadedUrl = blob.url;

    const sourceFilename = String(sourceImage.original_filename || `web-product-image.${extension}`)
      .slice(0, 480);
    const { data: copiedImage, error: insertError } = await supabaseAdmin
      .from("recipe_web_images")
      .insert({
        recipe_id: recipeId,
        image_url: blob.url,
        image_role: "portrait",
        source_type: sourceImage.source_type,
        source_page_url: sourceImage.source_page_url,
        source_image_url: null,
        original_filename: `portrait-copy-${sourceFilename}`,
        file_size_bytes: imageBytes.byteLength,
        sort_order: nextOrder,
        copied_from_image_id: sourceImageId,
      })
      .select(IMAGE_SELECT)
      .single();

    if (insertError) {
      await del(blob.url);
      uploadedUrl = null;
      if (insertError.code === "23505") {
        return NextResponse.json({ error: "この画像はポートレート画像へコピー済みです" }, { status: 409 });
      }
      throw insertError;
    }

    return NextResponse.json({ image: copiedImage });
  } catch (error: any) {
    if (uploadedUrl) await del(uploadedUrl).catch(() => undefined);
    const message = error?.name === "AbortError"
      ? "コピー元画像の取得がタイムアウトしました"
      : error.message || "ポートレート画像へのコピーに失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const recipeId = String(body.recipeId || "");
    const imageOrder = Array.isArray(body.imageOrder) ? body.imageOrder : [];
    const requestedImageRole = String(body.imageRole || "gallery");
    const imageRole: RecipeWebImageRole = ALLOWED_IMAGE_ROLES.has(requestedImageRole)
      ? requestedImageRole as RecipeWebImageRole
      : "gallery";
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
