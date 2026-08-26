import sharp from "sharp";

export type RecipeSnsImageLayoutMode = "smart-crop" | "subject-preserve";

export type RenderedRecipeSnsImage = {
  buffer: Buffer;
  layoutMode: RecipeSnsImageLayoutMode;
  coverRetention: number;
};

// A cover crop that discards more than one fifth of the source is too risky for product photos.
export const RECIPE_SNS_MIN_COVER_RETENTION = 4 / 5;

function createFeatherMask(width: number, height: number, featherX: boolean, featherY: boolean) {
  const mask = Buffer.alloc(width * height, 255);
  const featherWidth = Math.max(1, Math.min(120, Math.round(width * 0.1)));
  const featherHeight = Math.max(1, Math.min(120, Math.round(height * 0.1)));
  for (let y = 0; y < height; y += 1) {
    const yAlpha = featherY
      ? Math.min(1, y / featherHeight, (height - 1 - y) / featherHeight)
      : 1;
    for (let x = 0; x < width; x += 1) {
      const xAlpha = featherX
        ? Math.min(1, x / featherWidth, (width - 1 - x) / featherWidth)
        : 1;
      mask[y * width + x] = Math.max(0, Math.round(255 * xAlpha * yAlpha));
    }
  }
  return mask;
}

export function recipeSnsCoverRetention(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) return 0;
  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;
  return Math.min(sourceAspect / targetAspect, targetAspect / sourceAspect);
}

export async function renderRecipeSnsImageVariant(
  sourceBuffer: Buffer,
  targetWidth: number,
  targetHeight: number,
): Promise<RenderedRecipeSnsImage> {
  const oriented = await sharp(sourceBuffer, { failOn: "warning" })
    .rotate()
    .toBuffer({ resolveWithObject: true });
  const coverRetention = recipeSnsCoverRetention(
    oriented.info.width,
    oriented.info.height,
    targetWidth,
    targetHeight,
  );

  if (coverRetention >= RECIPE_SNS_MIN_COVER_RETENTION) {
    const buffer = await sharp(oriented.data, { failOn: "warning" })
      .resize(targetWidth, targetHeight, {
        fit: "cover",
        position: sharp.strategy.attention,
        withoutEnlargement: false,
      })
      .webp({ quality: 88, effort: 5 })
      .toBuffer();
    return { buffer, layoutMode: "smart-crop", coverRetention };
  }

  const blurSigma = Math.max(18, Math.min(36, Math.round(Math.min(targetWidth, targetHeight) * 0.028)));
  const background = await sharp(oriented.data, { failOn: "warning" })
    .resize(targetWidth, targetHeight, {
      fit: "cover",
      position: sharp.strategy.attention,
      withoutEnlargement: false,
    })
    .blur(blurSigma)
    .modulate({ brightness: 0.58, saturation: 0.72 })
    .toBuffer();
  const foreground = await sharp(oriented.data, { failOn: "warning" })
    .resize({
      width: targetWidth,
      height: targetHeight,
      fit: "inside",
      withoutEnlargement: false,
    })
    .toBuffer({ resolveWithObject: true });
  const left = Math.max(0, Math.round((targetWidth - foreground.info.width) / 2));
  const top = Math.max(0, Math.round((targetHeight - foreground.info.height) / 2));
  const featherMask = createFeatherMask(
    foreground.info.width,
    foreground.info.height,
    foreground.info.width < targetWidth,
    foreground.info.height < targetHeight,
  );
  const featheredForeground = await sharp(foreground.data)
    .toColourspace("srgb")
    .removeAlpha()
    .joinChannel(featherMask, {
      raw: { width: foreground.info.width, height: foreground.info.height, channels: 1 },
    })
    .png()
    .toBuffer();
  const buffer = await sharp(background)
    .composite([{ input: featheredForeground, left, top }])
    .webp({ quality: 88, effort: 5 })
    .toBuffer();

  return { buffer, layoutMode: "subject-preserve", coverRetention };
}
