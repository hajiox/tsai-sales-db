export const RECIPE_SNS_MODEL = "gpt-5.6-sol";
export const RECIPE_SNS_REASONING_EFFORT = "medium";
export const RECIPE_SNS_RULES_VERSION = "2026-08-25.1";

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

export type RecipeSnsAiResult = {
  overall_angle: string;
  variation_key: string;
  source_gaps: string[];
  posts: Record<RecipeSnsPlatform, RecipeSnsPost>;
};

export type RecipeSnsImageVariant = {
  url: string;
  width: number;
  height: number;
  aspectLabel: string;
};

export type RecipeSnsGenerationView = {
  id: string;
  jobId: string;
  status: "pending" | "completed" | "failed";
  sourceImageId: string | null;
  sourceImageUrl: string;
  sourceImageRole: "portrait" | "gallery";
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

export function validateRecipeSnsAiResult(value: unknown): RecipeSnsAiResult {
  const source = asObject(value);
  const sourcePosts = asObject(source.posts);
  const posts = {} as Record<RecipeSnsPlatform, RecipeSnsPost>;

  for (const platform of RECIPE_SNS_PLATFORMS) {
    const candidate = asObject(sourcePosts[platform.id]);
    const text = clippedText(candidate.text, platform.maxLength * 2);
    const hashtags = Array.isArray(candidate.hashtags)
      ? [...new Set(candidate.hashtags.map(normalizeRecipeSnsHashtag).filter(Boolean))]
      : [];
    if (!text) throw new Error(`${platform.label}の投稿文が空欄です`);
    if (hashtags.length < platform.minHashtags || hashtags.length > platform.maxHashtags) {
      throw new Error(`${platform.label}のハッシュタグ数が${platform.minHashtags}〜${platform.maxHashtags}件の範囲外です`);
    }
    const combined = formatRecipeSnsPost({ text, hashtags });
    if (countRecipeSnsCharacters(combined) > platform.maxLength) {
      throw new Error(`${platform.label}の投稿文が${platform.maxLength}文字を超えています`);
    }
    posts[platform.id] = {
      text,
      hashtags,
      rationale: clippedText(candidate.rationale, 500),
    };
  }

  return {
    overall_angle: clippedText(source.overall_angle, 600),
    variation_key: clippedText(source.variation_key, 120),
    source_gaps: Array.isArray(source.source_gaps)
      ? source.source_gaps.map((item) => clippedText(item, 240)).filter(Boolean).slice(0, 12)
      : [],
    posts,
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
