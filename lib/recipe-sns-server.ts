import { randomInt, randomUUID } from "node:crypto";
import { load } from "cheerio";
import sharp from "sharp";
import { del, put } from "@vercel/blob";
import {
  RECIPE_SNS_PLATFORMS,
  type RecipeSnsImageVariant,
  type RecipeSnsPlatform,
} from "@/lib/recipe-sns";

const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_LP_HTML_BYTES = 1_500_000;
const LP_TEXT_LIMIT = 8_000;

export type RecipeSnsSourceImage = {
  id: string;
  image_url: string;
  image_role: "portrait" | "gallery";
  sort_order: number;
  created_at: string;
};

const VARIATION_ANGLES = [
  "商品の個性と第一印象",
  "食べる場面と楽しみ方",
  "作り手・会津らしい背景",
  "食感・香り・味わいの想像",
  "贈り物やストックとしての使い方",
  "EC商品説明に埋もれた具体的な強み",
] as const;

function isAllowedLpHostname(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "aizu-syokubura.com"
    || host.endsWith(".aizu-syokubura.com")
    || host === "aizubrandhall-lp.com"
    || host.endsWith(".aizubrandhall-lp.com")
    || host === "aizubrandhall-lp2.com"
    || host.endsWith(".aizubrandhall-lp2.com");
}

function isVercelBlobHostname(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "blob.vercel-storage.com" || host.endsWith(".blob.vercel-storage.com");
}

async function fetchWithByteLimit(
  initialUrl: URL,
  maxBytes: number,
  acceptedTypes: RegExp,
  allowedHostname: (hostname: string) => boolean,
) {
  let url = initialUrl;
  let response: Response | null = null;
  for (let redirectCount = 0; redirectCount < 4; redirectCount += 1) {
    if (url.protocol !== "https:" || !allowedHostname(url.hostname)) throw new Error("許可されていない取得先です");
    response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { "user-agent": "TSA-Recipe-SNS/1.0" },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location) throw new Error("転送先を確認できません");
    url = new URL(location, url);
    response = null;
  }
  if (!response) throw new Error("転送回数が上限を超えています");
  if (!response.ok) throw new Error(`取得先がHTTP ${response.status}を返しました`);
  const finalUrl = url;
  const contentType = response.headers.get("content-type") || "";
  if (!acceptedTypes.test(contentType)) throw new Error("取得先のデータ形式が対象外です");
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > maxBytes) throw new Error("取得データが上限を超えています");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) throw new Error("取得データが上限を超えています");
  return { buffer, finalUrl, contentType };
}

export async function fetchCompanyLpSummary(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return { url: null, title: "", description: "", content: "", warning: null };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { url: raw, title: "", description: "", content: "", warning: "商品LPのURL形式が不正です" };
  }
  if (url.protocol !== "https:" || !isAllowedLpHostname(url.hostname)) {
    return { url: raw, title: "", description: "", content: "", warning: "商品LPは許可済み自社ドメインではないため本文を参照していません" };
  }
  try {
    const { buffer, finalUrl } = await fetchWithByteLimit(url, MAX_LP_HTML_BYTES, /^text\/html\b/i, isAllowedLpHostname);
    if (!isAllowedLpHostname(finalUrl.hostname)) throw new Error("許可済み自社ドメイン以外へ転送されました");
    const $ = load(buffer.toString("utf8"));
    $("script,style,noscript,svg,nav,footer,header,form,iframe").remove();
    const title = $("title").first().text().replace(/\s+/g, " ").trim().slice(0, 300);
    const description = ($('meta[name="description"]').attr("content") || "")
      .replace(/\s+/g, " ").trim().slice(0, 600);
    const content = $("h1,h2,h3,p,li")
      .map((_, element) => $(element).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean)
      .join("\n")
      .slice(0, LP_TEXT_LIMIT);
    return { url: finalUrl.toString(), title, description, content, warning: null };
  } catch (error) {
    return {
      url: raw,
      title: "",
      description: "",
      content: "",
      warning: `商品LP本文を取得できませんでした: ${error instanceof Error ? error.message : String(error)}`.slice(0, 500),
    };
  }
}

export function chooseRecipeSnsSourceImage(images: RecipeSnsSourceImage[], previousSourceImageId?: string | null) {
  const portraits = images.filter((image) => image.image_role === "portrait");
  const gallery = images
    .filter((image) => image.image_role === "gallery")
    .sort((left, right) => left.sort_order - right.sort_order || left.created_at.localeCompare(right.created_at));
  if (portraits.length > 0) {
    const alternatives = portraits.length > 1 && previousSourceImageId
      ? portraits.filter((image) => image.id !== previousSourceImageId)
      : portraits;
    return alternatives[randomInt(alternatives.length)];
  }
  return gallery[0] || null;
}

export function chooseRecipeSnsVariation(previousVariationKey?: string | null) {
  const alternatives = VARIATION_ANGLES.length > 1 && previousVariationKey
    ? VARIATION_ANGLES.filter((value) => value !== previousVariationKey)
    : [...VARIATION_ANGLES];
  return alternatives[randomInt(alternatives.length)];
}

async function loadSourceImage(source: RecipeSnsSourceImage) {
  const url = new URL(source.image_url);
  if (url.protocol !== "https:" || !isVercelBlobHostname(url.hostname)) {
    throw new Error("SNS生成元はTSAが保存したVercel Blob画像に限ります");
  }
  const { buffer, finalUrl } = await fetchWithByteLimit(
    url,
    MAX_SOURCE_IMAGE_BYTES,
    /^image\/(?:jpeg|png|webp|gif|avif)\b/i,
    isVercelBlobHostname,
  );
  if (!isVercelBlobHostname(finalUrl.hostname)) throw new Error("SNS生成元画像が許可外の場所へ転送されました");
  await sharp(buffer, { failOn: "warning" }).metadata();
  return buffer;
}

export async function createRecipeSnsImageVariants(recipeId: string, source: RecipeSnsSourceImage) {
  const sourceBuffer = await loadSourceImage(source);
  const generationId = randomUUID();
  const uploadedUrls: string[] = [];
  const variants = {} as Record<RecipeSnsPlatform, RecipeSnsImageVariant>;
  try {
    for (const platform of RECIPE_SNS_PLATFORMS) {
      const output = await sharp(sourceBuffer, { failOn: "warning" })
        .rotate()
        .resize(platform.width, platform.height, {
          fit: "cover",
          position: sharp.strategy.attention,
          withoutEnlargement: false,
        })
        .webp({ quality: 88, effort: 5 })
        .toBuffer();
      const blob = await put(
        `recipe-sns/${recipeId}/${generationId}/${platform.id}.webp`,
        output,
        { access: "public", addRandomSuffix: true, contentType: "image/webp" },
      );
      uploadedUrls.push(blob.url);
      variants[platform.id] = {
        url: blob.url,
        width: platform.width,
        height: platform.height,
        aspectLabel: platform.aspectLabel,
      };
    }
    return { generationId, variants, uploadedUrls };
  } catch (error) {
    if (uploadedUrls.length > 0) await del(uploadedUrls).catch(() => undefined);
    throw error;
  }
}

export async function deleteRecipeSnsImages(urls: string[]) {
  if (urls.length > 0) await del(urls).catch(() => undefined);
}
