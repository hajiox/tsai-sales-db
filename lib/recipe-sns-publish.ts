import {
  RECIPE_SNS_PLATFORMS,
  ensureRecipeSnsPostDestinationUrl,
  formatRecipeSnsPost,
  isRecipeSnsPlatform,
  validateRecipeSnsPost,
  type RecipeSnsPlatform,
  type RecipeSnsPost,
} from "./recipe-sns";

export const RECIPE_SNS_PUBLISH_PROTOCOL_VERSION = 1;
export const RECIPE_SNS_PUBLISH_RULES_VERSION = "2026-08-31.4";
export const RECIPE_SNS_PUBLISH_MODEL = "gpt-5.6-sol";
export const RECIPE_SNS_PUBLISH_REASONING_EFFORT = "medium";

export const RECIPE_SNS_EXPECTED_ACCOUNTS: Record<RecipeSnsPlatform, string> = {
  x: "@Aizu_Brand_Kan",
  instagram: "aizubrandhall",
  instagram_story: "aizubrandhall",
  threads: "aizubrandhall",
};

export const RECIPE_SNS_PUBLISH_PLATFORM_STATUSES = [
  "published",
  "already_published",
  "blocked",
  "failed",
] as const;

const RECIPE_SNS_PUBLISH_JOB_STATUSES = new Set([
  "completed",
  "waiting_for_user",
  "needs_review",
  "failed",
]);

export type RecipeSnsPublishPlatformStatus = typeof RECIPE_SNS_PUBLISH_PLATFORM_STATUSES[number];

export type RecipeSnsPublishPlatformResult = {
  platform: RecipeSnsPlatform;
  status: RecipeSnsPublishPlatformStatus;
  accountObserved: string | null;
  publishedUrl: string | null;
  publishedAt: string | null;
  evidence: string;
  message: string;
};

export type RecipeSnsPublishJobResult = {
  status: "completed" | "waiting_for_user" | "needs_review" | "failed";
  publicationId: string;
  platforms: RecipeSnsPublishPlatformResult[];
  summary: string;
};

export type RecipeSnsPublicationView = {
  id: string;
  jobId: string;
  generationId: string;
  status: "scheduled" | "queued" | "running" | "completed" | "partial" | "waiting_for_user" | "needs_review" | "failed" | "cancelled";
  targets: RecipeSnsPlatform[];
  scheduledAt: string;
  progress: number;
  currentStep: string;
  errorMessage: string | null;
  platformResults: RecipeSnsPublishPlatformResult[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type RecipeSnsPublishTargetSnapshot = {
  platform: RecipeSnsPlatform;
  label: string;
  expectedAccount: string;
  officialUrl: string;
  imageUrl: string;
  postText: string;
  storyText: string | null;
  linkUrl: string | null;
};

export type RecipeSnsPublishSnapshot = {
  protocolVersion: number;
  rulesVersion: string;
  publicationId: string;
  recipeId: string;
  generationId: string;
  recipeName: string;
  targets: RecipeSnsPlatform[];
  scheduledAt: string;
  expectedAccounts: Record<RecipeSnsPlatform, string>;
  platforms: Partial<Record<RecipeSnsPlatform, RecipeSnsPublishTargetSnapshot>>;
  operatorAuthorization: {
    authorized: true;
    requestedBy: string;
    authorizedAt: string;
    cleanupMalformedOwnAttemptAuthorized: true;
  };
};

const PLATFORM_OFFICIAL_URLS: Record<RecipeSnsPlatform, string> = {
  x: "https://x.com/home",
  instagram: "https://www.instagram.com/",
  instagram_story: "https://www.instagram.com/",
  threads: "https://www.threads.com/",
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clipped(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizedAccount(value: unknown) {
  return String(value ?? "").trim().replace(/^@/, "").toLowerCase();
}

function normalizedHttpUrl(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? text : null;
  } catch {
    return null;
  }
}

function normalizedTsaBlobUrl(value: unknown) {
  const text = normalizedHttpUrl(value);
  if (!text) return null;
  const url = new URL(text);
  const host = url.hostname.toLowerCase();
  return url.protocol === "https:"
    && (host === "blob.vercel-storage.com" || host.endsWith(".blob.vercel-storage.com"))
    ? text
    : null;
}

function normalizedOfficialPublishedUrl(value: unknown, platform: RecipeSnsPlatform) {
  const text = normalizedHttpUrl(value);
  if (!text) return null;
  const host = new URL(text).hostname.toLowerCase();
  const allowed = platform === "x"
    ? host === "x.com" || host.endsWith(".x.com") || host === "twitter.com" || host.endsWith(".twitter.com")
    : platform === "threads"
      ? host === "threads.com" || host.endsWith(".threads.com") || host === "threads.net" || host.endsWith(".threads.net")
      : host === "instagram.com" || host.endsWith(".instagram.com");
  return allowed ? text : null;
}

function normalizedIsoDate(value: unknown) {
  const text = String(value ?? "").trim();
  const timestamp = Date.parse(text);
  return text && Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function normalizeRecipeSnsPublishTargets(value: unknown): RecipeSnsPlatform[] {
  if (!Array.isArray(value)) return [];
  const requested = [...new Set(value.map(String).filter(isRecipeSnsPlatform))];
  return RECIPE_SNS_PLATFORMS
    .map((platform) => platform.id)
    .filter((platform) => requested.includes(platform));
}

export function normalizeRecipeSnsPublishPosts(
  value: unknown,
  targets: RecipeSnsPlatform[],
  destinationUrl: unknown,
): Partial<Record<RecipeSnsPlatform, RecipeSnsPost>> {
  const source = asObject(value);
  return Object.fromEntries(targets.map((platform) => {
    const post = validateRecipeSnsPost(source[platform], platform);
    return [platform, ensureRecipeSnsPostDestinationUrl(post, platform, destinationUrl)];
  }));
}

export function buildRecipeSnsPublishSnapshot(input: {
  publicationId: string;
  recipeId: string;
  generationId: string;
  recipeName: string;
  targets: RecipeSnsPlatform[];
  scheduledAt: string;
  requestedBy: string;
  authorizedAt: string;
  cleanupMalformedOwnAttemptAuthorized: true;
  imageUrls: Partial<Record<RecipeSnsPlatform, string>>;
  posts: Partial<Record<RecipeSnsPlatform, RecipeSnsPost>>;
}): RecipeSnsPublishSnapshot {
  const platforms: Partial<Record<RecipeSnsPlatform, RecipeSnsPublishTargetSnapshot>> = {};
  for (const platformId of input.targets) {
    const platform = RECIPE_SNS_PLATFORMS.find((candidate) => candidate.id === platformId);
    const post = input.posts[platformId];
    const imageUrl = normalizedTsaBlobUrl(input.imageUrls[platformId]);
    if (!platform || !post || !imageUrl) throw new Error(`${platform?.label || platformId}の投稿素材が不足しています`);
    platforms[platformId] = {
      platform: platformId,
      label: platform.label,
      expectedAccount: RECIPE_SNS_EXPECTED_ACCOUNTS[platformId],
      officialUrl: PLATFORM_OFFICIAL_URLS[platformId],
      imageUrl,
      postText: platformId === "instagram_story" ? "" : formatRecipeSnsPost(post),
      storyText: platformId === "instagram_story" ? post.text.trim() : null,
      linkUrl: platformId === "instagram_story" ? normalizedHttpUrl(post.linkUrl) : null,
    };
  }
  return {
    protocolVersion: RECIPE_SNS_PUBLISH_PROTOCOL_VERSION,
    rulesVersion: RECIPE_SNS_PUBLISH_RULES_VERSION,
    publicationId: input.publicationId,
    recipeId: input.recipeId,
    generationId: input.generationId,
    recipeName: input.recipeName.trim().slice(0, 300),
    targets: [...input.targets],
    scheduledAt: input.scheduledAt,
    expectedAccounts: { ...RECIPE_SNS_EXPECTED_ACCOUNTS },
    platforms,
    operatorAuthorization: {
      authorized: true,
      requestedBy: input.requestedBy,
      authorizedAt: input.authorizedAt,
      cleanupMalformedOwnAttemptAuthorized: input.cleanupMalformedOwnAttemptAuthorized,
    },
  };
}

export function validateRecipeSnsPublishResult(
  value: unknown,
  expected: { publicationId: string; targets: RecipeSnsPlatform[] },
): RecipeSnsPublishJobResult {
  const source = asObject(value);
  const status = String(source.status || "");
  if (!RECIPE_SNS_PUBLISH_JOB_STATUSES.has(status)) {
    throw new Error("SNS投稿結果の状態が正しくありません");
  }
  if (String(source.publication_id ?? source.publicationId ?? "") !== expected.publicationId) {
    throw new Error("SNS投稿結果の予約IDが依頼内容と一致しません");
  }
  const rawPlatforms = Array.isArray(source.platforms) ? source.platforms.map(asObject) : [];
  const platformNames = rawPlatforms.map((entry) => String(entry.platform || ""));
  if (
    rawPlatforms.length !== expected.targets.length
    || new Set(platformNames).size !== platformNames.length
    || expected.targets.some((target) => !platformNames.includes(target))
    || platformNames.some((target) => !expected.targets.includes(target as RecipeSnsPlatform))
  ) throw new Error("SNS投稿結果の対象媒体が依頼内容と一致しません");

  const platforms = rawPlatforms.map((entry): RecipeSnsPublishPlatformResult => {
    const platform = String(entry.platform || "") as RecipeSnsPlatform;
    const platformStatus = String(entry.status || "") as RecipeSnsPublishPlatformStatus;
    if (!RECIPE_SNS_PUBLISH_PLATFORM_STATUSES.includes(platformStatus)) {
      throw new Error(`${platform}のSNS投稿結果が正しくありません`);
    }
    const accountObserved = clipped(entry.account_observed ?? entry.accountObserved, 120) || null;
    const rawPublishedUrl = entry.published_url ?? entry.publishedUrl;
    const publishedUrl = normalizedOfficialPublishedUrl(rawPublishedUrl, platform);
    const publishedAt = normalizedIsoDate(entry.published_at ?? entry.publishedAt);
    const evidence = clipped(entry.evidence, 1_000);
    const message = clipped(entry.message, 1_000);
    const successful = platformStatus === "published" || platformStatus === "already_published";
    if (successful && normalizedAccount(accountObserved) !== normalizedAccount(RECIPE_SNS_EXPECTED_ACCOUNTS[platform])) {
      throw new Error(`${platform}の投稿先アカウントを確認できません`);
    }
    if (successful && !publishedAt) throw new Error(`${platform}の投稿日を確認できません`);
    if (successful && platform !== "instagram_story" && !publishedUrl) {
      throw new Error(`${platform}の公開URLを確認できません`);
    }
    if (rawPublishedUrl && !publishedUrl) throw new Error(`${platform}の公開URLが公式SNSではありません`);
    if (!evidence || !message) throw new Error(`${platform}の投稿証跡が不足しています`);
    return { platform, status: platformStatus, accountObserved, publishedUrl, publishedAt, evidence, message };
  });

  const successfulCount = platforms.filter((entry) => ["published", "already_published"].includes(entry.status)).length;
  const blockedCount = platforms.filter((entry) => entry.status === "blocked").length;
  const expectedStatus = successfulCount === platforms.length
    ? "completed"
    : successfulCount > 0
      ? "needs_review"
      : blockedCount > 0
        ? "waiting_for_user"
        : "needs_review";
  if (status !== expectedStatus && !(status === "failed" && successfulCount === 0 && blockedCount === 0)) {
    throw new Error("SNS投稿の全体状態と媒体別結果が一致しません");
  }
  return {
    status: status as RecipeSnsPublishJobResult["status"],
    publicationId: expected.publicationId,
    platforms,
    summary: clipped(source.summary, 2_000) || "SNS投稿処理が終了しました",
  };
}

export function serializeRecipeSnsPublishResult(result: RecipeSnsPublishJobResult) {
  return {
    status: result.status,
    publication_id: result.publicationId,
    platforms: result.platforms.map((platform) => ({
      platform: platform.platform,
      status: platform.status,
      account_observed: platform.accountObserved,
      published_url: platform.publishedUrl,
      published_at: platform.publishedAt,
      evidence: platform.evidence,
      message: platform.message,
    })),
    summary: result.summary,
  };
}
