export const RECIPE_EC_IMAGE_SITES = [
  "amazon",
  "rakuten",
  "yahoo",
  "mercari",
  "base",
  "qoo10",
  "tiktok",
] as const;

export type RecipeEcImageSite = (typeof RECIPE_EC_IMAGE_SITES)[number];

export type RecipeEcImageSlot =
  | "amazon_base_top"
  | "other_ec_top"
  | "shared_detail"
  | "non_amazon_detail"
  | "base_only_detail";

export const RECIPE_EC_LISTING_IMAGE_ROLES = [
  "gallery",
  "non_amazon",
  "base_only",
] as const;

export type RecipeEcListingImageRole =
  (typeof RECIPE_EC_LISTING_IMAGE_ROLES)[number];

export type RecipeWebImageRole = RecipeEcListingImageRole | "portrait";

export const RECIPE_WEB_IMAGE_SOURCE_TYPES = [
  "manual",
  "rakuten",
  "mercari",
  "base",
  "shared_folder",
] as const;

export type RecipeWebImageSourceType =
  (typeof RECIPE_WEB_IMAGE_SOURCE_TYPES)[number];

export type RecipeEcImagePlacement = {
  slot: RecipeEcImageSlot;
  listingOrder: number;
  sites: RecipeEcImageSite[];
};

export type RecipeEcImagePlanEntry = RecipeEcImagePlacement & {
  imageRole: RecipeEcListingImageRole;
  imageIndex: number;
};

export type RecipeEcImagePlanCounts = {
  gallery: number;
  nonAmazon?: number;
  baseOnly?: number;
};

const AMAZON_BASE_SITES: RecipeEcImageSite[] = ["amazon", "base"];
const OTHER_EC_SITES: RecipeEcImageSite[] = [
  "rakuten",
  "yahoo",
  "mercari",
  "qoo10",
  "tiktok",
];

function assertImageCount(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} count must be a non-negative integer`);
  }
}

export function getRecipeEcImagePlacement(index: number): RecipeEcImagePlacement {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError("EC image index must be a non-negative integer");
  }

  if (index === 0) {
    return {
      slot: "amazon_base_top",
      listingOrder: 1,
      sites: [...AMAZON_BASE_SITES],
    };
  }

  if (index === 1) {
    return {
      slot: "other_ec_top",
      listingOrder: 1,
      sites: [...OTHER_EC_SITES],
    };
  }

  return {
    slot: "shared_detail",
    listingOrder: index,
    sites: [...RECIPE_EC_IMAGE_SITES],
  };
}

export function getRecipeEcImageIndexesForSite(
  site: RecipeEcImageSite,
  imageCount: number,
): number[] {
  assertImageCount(imageCount, "EC image");

  return Array.from({ length: imageCount }, (_, index) => index).filter((index) =>
    getRecipeEcImagePlacement(index).sites.includes(site),
  );
}

export function getRecipeEcImagePlanForSite(
  site: RecipeEcImageSite,
  counts: RecipeEcImagePlanCounts,
): RecipeEcImagePlanEntry[] {
  const galleryCount = counts.gallery;
  const nonAmazonCount = counts.nonAmazon ?? 0;
  const baseOnlyCount = counts.baseOnly ?? 0;
  assertImageCount(galleryCount, "Gallery image");
  assertImageCount(nonAmazonCount, "Non-Amazon image");
  assertImageCount(baseOnlyCount, "BASE-only image");

  const corePlan = getRecipeEcImageIndexesForSite(site, galleryCount).map((imageIndex) => ({
    ...getRecipeEcImagePlacement(imageIndex),
    imageRole: "gallery" as const,
    imageIndex,
  }));
  const nextListingOrder = corePlan.length + 1;

  if (site === "base") {
    return [
      ...corePlan,
      ...Array.from({ length: baseOnlyCount }, (_, imageIndex) => ({
        slot: "base_only_detail" as const,
        listingOrder: nextListingOrder + imageIndex,
        sites: ["base"] as RecipeEcImageSite[],
        imageRole: "base_only" as const,
        imageIndex,
      })),
    ];
  }

  if (site !== "amazon") {
    return [
      ...corePlan,
      ...Array.from({ length: nonAmazonCount }, (_, imageIndex) => ({
        slot: "non_amazon_detail" as const,
        listingOrder: nextListingOrder + imageIndex,
        sites: [...OTHER_EC_SITES],
        imageRole: "non_amazon" as const,
        imageIndex,
      })),
    ];
  }

  return corePlan;
}
