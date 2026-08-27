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
  | "shared_detail";

export type RecipeEcImagePlacement = {
  slot: RecipeEcImageSlot;
  listingOrder: number;
  sites: RecipeEcImageSite[];
};

const AMAZON_BASE_SITES: RecipeEcImageSite[] = ["amazon", "base"];
const OTHER_EC_SITES: RecipeEcImageSite[] = [
  "rakuten",
  "yahoo",
  "mercari",
  "qoo10",
  "tiktok",
];

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
  if (!Number.isInteger(imageCount) || imageCount < 0) {
    throw new RangeError("EC image count must be a non-negative integer");
  }

  return Array.from({ length: imageCount }, (_, index) => index).filter((index) =>
    getRecipeEcImagePlacement(index).sites.includes(site),
  );
}
