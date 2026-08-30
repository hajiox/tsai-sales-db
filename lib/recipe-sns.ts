export const RECIPE_SNS_MODEL = "gpt-5.6-sol";
export const RECIPE_SNS_REASONING_EFFORT = "medium";
export const RECIPE_SNS_RULES_VERSION = "2026-08-30.1";

export const RECIPE_SNS_IMAGE_MODES = [
  { id: "normal", label: "通常リサイズ" },
  { id: "creative", label: "クリエイティブ" },
  { id: "arrange", label: "アレンジ" },
] as const;

export type RecipeSnsImageMode = typeof RECIPE_SNS_IMAGE_MODES[number]["id"];

export const RECIPE_SNS_OVERLAY_PLACEMENTS = [
  "none",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;

export type RecipeSnsOverlayPlacement = typeof RECIPE_SNS_OVERLAY_PLACEMENTS[number];

export const RECIPE_SNS_PLATFORMS = [
  {
    id: "x",
    label: "X",
    aspectLabel: "16:9",
    width: 1600,
    height: 900,
    maxLength: 400,
    minHashtags: 0,
    maxHashtags: 3,
    guidance: "短い導入で興味を引き、商品の具体的な魅力と自然な行動喚起を簡潔に伝える。",
  },
  {
    id: "instagram",
    label: "Instagram",
    aspectLabel: "1:1",
    width: 1080,
    height: 1080,
    maxLength: 2200,
    minHashtags: 10,
    maxHashtags: 15,
    guidance: "冒頭で魅力を伝え、利用場面や食感を読みやすい改行で描写し、根拠のあるハッシュタグを付ける。",
  },
  {
    id: "instagram_story",
    label: "IGストーリー",
    aspectLabel: "9:16",
    width: 1080,
    height: 1920,
    maxLength: 50,
    minHashtags: 0,
    maxHashtags: 0,
    guidance: "画像上で瞬時に読める一文に絞り、商品名または一番強い魅力を端的に伝える。",
  },
  {
    id: "threads",
    label: "Threads",
    aspectLabel: "4:3",
    width: 1200,
    height: 900,
    maxLength: 500,
    minHashtags: 0,
    maxHashtags: 5,
    guidance: "会話のきっかけになる自然な語り口で、商品の背景や楽しみ方を押し付けずに伝える。",
  },
] as const;

export type RecipeSnsPlatform = typeof RECIPE_SNS_PLATFORMS[number]["id"];

export type RecipeSnsPost = {
  text: string;
  hashtags: string[];
  rationale: string;
};

export type RecipeSnsCreativeOverlay = {
  headline: string;
  subline: string;
  placement: RecipeSnsOverlayPlacement;
};

export type RecipeSnsGeneratedImageResult = {
  source: "original" | "generated";
  file_path: string;
  prompt_summary: string;
};

export type RecipeSnsAiResult = {
  overall_angle: string;
  variation_key: string;
  source_gaps: string[];
  posts: Record<RecipeSnsPlatform, RecipeSnsPost>;
  image_mode: RecipeSnsImageMode;
  creative_overlays: Record<RecipeSnsPlatform, RecipeSnsCreativeOverlay>;
};

export type RecipeSnsBridgeResult = RecipeSnsAiResult & {
  generated_images: Record<RecipeSnsPlatform, RecipeSnsGeneratedImageResult>;
};

export type RecipeSnsTargetBridgeResult = {
  overall_angle: string;
  variation_key: string;
  source_gaps: string[];
  image_mode: RecipeSnsImageMode;
  platform: RecipeSnsPlatform;
  post: RecipeSnsPost;
  creative_overlay: RecipeSnsCreativeOverlay;
  generated_image: RecipeSnsGeneratedImageResult;
};

export type RecipeSnsImageVariant = {
  url: string;
  width: number;
  height: number;
  aspectLabel: string;
  layoutMode: "smart-crop" | "subject-preserve" | "normal-resize" | "creative" | "arrange";
};

export type RecipeSnsGenerationView = {
  id: string;
  jobId: string;
  status: "pending" | "completed" | "failed";
  sourceImageId: string | null;
  sourceImageUrl: string;
  sourceImageRole: "portrait" | "gallery";
  imageMode: RecipeSnsImageMode;
  targetPlatform: RecipeSnsPlatform | null;
  destinationUrl: string | null;
  variationKey: string;
  imageVariants: Record<RecipeSnsPlatform, RecipeSnsImageVariant>;
  posts: RecipeSnsAiResult | null;
  model: string;
  reasoningEffort: string;
  rulesVersion: string;
  createdAt: string;
  completedAt: string | null;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clippedText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

export function isRecipeSnsImageMode(value: unknown): value is RecipeSnsImageMode {
  return RECIPE_SNS_IMAGE_MODES.some((mode) => mode.id === value);
}

export function isRecipeSnsPlatform(value: unknown): value is RecipeSnsPlatform {
  return RECIPE_SNS_PLATFORMS.some((platform) => platform.id === value);
}

export function recipeSnsImageModeLabel(value: RecipeSnsImageMode) {
  return RECIPE_SNS_IMAGE_MODES.find((mode) => mode.id === value)?.label || "通常リサイズ";
}

export function countRecipeSnsCharacters(value: string) {
  return Array.from(value).length;
}

export function normalizeRecipeSnsHashtag(value: unknown) {
  const text = String(value ?? "")
    .replace(/^#+/, "")
    .replace(/[\s#]+/g, "")
    .trim()
    .slice(0, 40);
  return text ? `#${text}` : "";
}

export function formatRecipeSnsPost(post: Pick<RecipeSnsPost, "text" | "hashtags">) {
  const hashtags = post.hashtags.map(normalizeRecipeSnsHashtag).filter(Boolean).join(" ");
  return hashtags ? `${post.text.trim()}\n\n${hashtags}` : post.text.trim();
}

export function normalizeRecipeSnsDestinationUrl(value: unknown) {
  const url = String(value ?? "").trim();
  if (!url || /\s/.test(url)) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

export function recipeSnsDestinationUrlFromSnapshot(value: unknown) {
  const snapshot = asObject(value);
  return normalizeRecipeSnsDestinationUrl(snapshot.productLpUrl)
    || normalizeRecipeSnsDestinationUrl(asObject(snapshot.productLp).url);
}

function clipRecipeSnsTextToLength(value: string, maxLength: number) {
  if (maxLength <= 0) return "";
  return Array.from(value).slice(0, maxLength).join("").trimEnd();
}

export function ensureRecipeSnsPostDestinationUrl(
  post: RecipeSnsPost,
  platformId: RecipeSnsPlatform,
  value: unknown,
): RecipeSnsPost {
  const destinationUrl = normalizeRecipeSnsDestinationUrl(value);
  if (!destinationUrl) return post;

  const platform = RECIPE_SNS_PLATFORMS.find((candidate) => candidate.id === platformId);
  if (!platform) throw new Error("SNS媒体が正しくありません");
  const hashtags = post.hashtags.map(normalizeRecipeSnsHashtag).filter(Boolean);
  const hashtagText = hashtags.join(" ");
  const textLimit = platform.maxLength
    - countRecipeSnsCharacters(hashtagText)
    - (hashtagText ? 2 : 0);
  if (countRecipeSnsCharacters(destinationUrl) > textLimit) {
    throw new Error(`${platform.label}の文字数上限内に商品LP URLを収められません`);
  }

  const prose = post.text
    .replace(/https?:\/\/[^\s]+/giu, "")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n[ \t]+/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  const separator = prose ? "\n\n" : "";
  const proseLimit = textLimit
    - countRecipeSnsCharacters(destinationUrl)
    - countRecipeSnsCharacters(separator);
  const clippedProse = clipRecipeSnsTextToLength(prose, proseLimit);
  const text = clippedProse ? `${clippedProse}\n\n${destinationUrl}` : destinationUrl;

  return { ...post, text, hashtags };
}

export function ensureRecipeSnsAiResultDestinationUrl(
  result: RecipeSnsAiResult,
  value: unknown,
): RecipeSnsAiResult {
  const destinationUrl = normalizeRecipeSnsDestinationUrl(value);
  if (!destinationUrl) return result;
  const posts = { ...result.posts };
  for (const platform of RECIPE_SNS_PLATFORMS) {
    posts[platform.id] = ensureRecipeSnsPostDestinationUrl(
      result.posts[platform.id],
      platform.id,
      destinationUrl,
    );
  }
  return { ...result, posts };
}

function normalizeCreativeOverlay(value: unknown, imageMode: RecipeSnsImageMode): RecipeSnsCreativeOverlay {
  const source = asObject(value);
  const placement = RECIPE_SNS_OVERLAY_PLACEMENTS.includes(source.placement as RecipeSnsOverlayPlacement)
    ? source.placement as RecipeSnsOverlayPlacement
    : "none";
  return {
    headline: imageMode === "creative" ? clippedText(source.headline, 48) : "",
    subline: imageMode === "creative" ? clippedText(source.subline, 90) : "",
    placement: imageMode === "creative" ? placement : "none",
  };
}

function validateRecipeSnsPost(value: unknown, platformId: RecipeSnsPlatform): RecipeSnsPost {
  const platform = RECIPE_SNS_PLATFORMS.find((candidate) => candidate.id === platformId);
  if (!platform) throw new Error("SNS媒体が正しくありません");
  const candidate = asObject(value);
  const text = clippedText(candidate.text, platform.maxLength * 2);
  const hashtags = Array.isArray(candidate.hashtags)
    ? [...new Set(candidate.hashtags.map(normalizeRecipeSnsHashtag).filter(Boolean))]
    : [];
  if (!text) throw new Error(`${platform.label}の投稿文が空欄です`);
  if (hashtags.length < platform.minHashtags || hashtags.length > platform.maxHashtags) {
    throw new Error(`${platform.label}のハッシュタグ数が${platform.minHashtags}〜${platform.maxHashtags}件の範囲外です`);
  }
  if (countRecipeSnsCharacters(formatRecipeSnsPost({ text, hashtags })) > platform.maxLength) {
    throw new Error(`${platform.label}の投稿文が${platform.maxLength}文字を超えています`);
  }
  return {
    text,
    hashtags,
    rationale: clippedText(candidate.rationale, 500),
  };
}

function validateGeneratedImage(
  value: unknown,
  expectedMode: RecipeSnsImageMode,
  platformId: RecipeSnsPlatform,
): RecipeSnsGeneratedImageResult {
  const platform = RECIPE_SNS_PLATFORMS.find((candidate) => candidate.id === platformId);
  const image = asObject(value);
  const imageSource = image.source === "generated" ? "generated" : image.source === "original" ? "original" : null;
  if (!imageSource) throw new Error(`${platform?.label || platformId}の画像生成結果が不正です`);
  const filePath = clippedText(image.file_path, 1000);
  if (expectedMode === "normal" && (imageSource !== "original" || filePath)) {
    throw new Error(`${platform?.label || platformId}の通常リサイズ結果に生成画像が混在しています`);
  }
  if (expectedMode !== "normal" && (imageSource !== "generated" || !filePath)) {
    throw new Error(`${platform?.label || platformId}のAI生成画像ファイルがありません`);
  }
  return {
    source: imageSource,
    file_path: filePath,
    prompt_summary: clippedText(image.prompt_summary, 500),
  };
}

export function validateRecipeSnsAiResult(value: unknown): RecipeSnsAiResult {
  const source = asObject(value);
  const sourcePosts = asObject(source.posts);
  const imageMode = isRecipeSnsImageMode(source.image_mode) ? source.image_mode : "normal";
  const sourceOverlays = asObject(source.creative_overlays);
  const posts = {} as Record<RecipeSnsPlatform, RecipeSnsPost>;
  const creativeOverlays = {} as Record<RecipeSnsPlatform, RecipeSnsCreativeOverlay>;

  for (const platform of RECIPE_SNS_PLATFORMS) {
    posts[platform.id] = validateRecipeSnsPost(sourcePosts[platform.id], platform.id);
    creativeOverlays[platform.id] = normalizeCreativeOverlay(sourceOverlays[platform.id], imageMode);
  }

  if (imageMode === "creative") {
    for (const platform of RECIPE_SNS_PLATFORMS) {
      const overlay = creativeOverlays[platform.id];
      if (!overlay.headline || overlay.placement === "none") {
        throw new Error(`${platform.label}の広告クリエイティブ用テキスト配置が不足しています`);
      }
    }
  }

  return {
    overall_angle: clippedText(source.overall_angle, 600),
    variation_key: clippedText(source.variation_key, 120),
    source_gaps: Array.isArray(source.source_gaps)
      ? source.source_gaps.map((item) => clippedText(item, 240)).filter(Boolean).slice(0, 12)
      : [],
    posts,
    image_mode: imageMode,
    creative_overlays: creativeOverlays,
  };
}

export function validateRecipeSnsBridgeResult(
  value: unknown,
  expectedMode: RecipeSnsImageMode,
): RecipeSnsBridgeResult {
  const source = asObject(value);
  const normalized = validateRecipeSnsAiResult(source);
  if (normalized.image_mode !== expectedMode) {
    throw new Error("SNS画像生成モードが依頼内容と一致しません");
  }
  const sourceImages = asObject(source.generated_images);
  const generatedImages = {} as Record<RecipeSnsPlatform, RecipeSnsGeneratedImageResult>;
  for (const platform of RECIPE_SNS_PLATFORMS) {
    generatedImages[platform.id] = validateGeneratedImage(sourceImages[platform.id], expectedMode, platform.id);
  }
  return { ...normalized, generated_images: generatedImages };
}

export function validateRecipeSnsTargetBridgeResult(
  value: unknown,
  expectedMode: RecipeSnsImageMode,
  expectedPlatform: RecipeSnsPlatform,
): RecipeSnsTargetBridgeResult {
  const source = asObject(value);
  if (source.platform !== expectedPlatform) {
    throw new Error("個別再生成のSNS媒体が依頼内容と一致しません");
  }
  const imageMode = isRecipeSnsImageMode(source.image_mode) ? source.image_mode : "normal";
  if (imageMode !== expectedMode) throw new Error("SNS画像生成モードが依頼内容と一致しません");
  const creativeOverlay = normalizeCreativeOverlay(source.creative_overlay, imageMode);
  if (imageMode === "creative" && (!creativeOverlay.headline || creativeOverlay.placement === "none")) {
    const label = RECIPE_SNS_PLATFORMS.find((platform) => platform.id === expectedPlatform)?.label || expectedPlatform;
    throw new Error(`${label}の広告クリエイティブ用テキスト配置が不足しています`);
  }
  return {
    overall_angle: clippedText(source.overall_angle, 600),
    variation_key: clippedText(source.variation_key, 120),
    source_gaps: Array.isArray(source.source_gaps)
      ? source.source_gaps.map((item) => clippedText(item, 240)).filter(Boolean).slice(0, 12)
      : [],
    image_mode: imageMode,
    platform: expectedPlatform,
    post: validateRecipeSnsPost(source.post, expectedPlatform),
    creative_overlay: creativeOverlay,
    generated_image: validateGeneratedImage(source.generated_image, expectedMode, expectedPlatform),
  };
}

export function mergeRecipeSnsTargetResult(
  base: RecipeSnsAiResult,
  target: RecipeSnsTargetBridgeResult,
): RecipeSnsAiResult {
  if (target.image_mode !== base.image_mode) {
    throw new Error("個別再生成結果を基準履歴へ合成できません");
  }
  return {
    overall_angle: target.overall_angle,
    variation_key: target.variation_key,
    source_gaps: [...target.source_gaps],
    posts: { ...base.posts, [target.platform]: target.post },
    image_mode: target.image_mode,
    creative_overlays: {
      ...base.creative_overlays,
      [target.platform]: target.creative_overlay,
    },
  };
}

export function recipeSnsPlatformRules() {
  return Object.fromEntries(RECIPE_SNS_PLATFORMS.map((platform) => [platform.id, {
    label: platform.label,
    aspectLabel: platform.aspectLabel,
    width: platform.width,
    height: platform.height,
    maxLength: platform.maxLength,
    minHashtags: platform.minHashtags,
    maxHashtags: platform.maxHashtags,
    guidance: platform.guidance,
  }]));
}
