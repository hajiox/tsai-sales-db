import sharp from "sharp";
import type { RecipeSnsImageMode } from "@/lib/recipe-sns";

export type RenderedRecipeSnsImage = {
  buffer: Buffer;
  layoutMode: "normal-resize" | "creative" | "arrange";
};

export async function renderRecipeSnsImageVariant(
  sourceBuffer: Buffer,
  targetWidth: number,
  targetHeight: number,
  imageMode: RecipeSnsImageMode,
): Promise<RenderedRecipeSnsImage> {
  const buffer = await sharp(sourceBuffer, { failOn: "warning" })
    .rotate()
    .resize(targetWidth, targetHeight, {
      fit: "cover",
      position: "centre",
      withoutEnlargement: false,
    })
    .webp({ quality: 90, effort: 5 })
    .toBuffer();

  return {
    buffer,
    layoutMode: imageMode === "normal" ? "normal-resize" : imageMode,
  };
}
