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
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();

  return {
    buffer,
    layoutMode: imageMode === "normal" ? "normal-resize" : imageMode,
  };
}
