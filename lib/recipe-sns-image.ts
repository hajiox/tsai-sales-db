import sharp from "sharp";
import type { RecipeSnsImageMode } from "@/lib/recipe-sns";

export type RenderedRecipeSnsImage = {
  buffer: Buffer;
  layoutMode: "normal-resize" | "creative" | "arrange" | "handwritten";
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
      // Handwritten callouts/arrows may reach the edges: preserve the full image.
      fit: imageMode === "handwritten" ? "contain" : "cover",
      background: "#fffdf9",
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
