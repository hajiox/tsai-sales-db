"use client";

import { ExternalLink, FlaskConical, ImageIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ItemCandidate } from "./ItemNameSelect";

const LABEL_IMAGE_TYPE_LABELS: Record<string, string> = {
  front_label: "表ラベル",
  ingredients_label: "原材料表示",
  nutrition_label: "栄養成分表示",
};

const TEXT_FIELDS: { key: keyof ItemCandidate; label: string }[] = [
  { key: "product_description", label: "商品説明" },
  { key: "raw_materials", label: "原材料" },
  { key: "allergens", label: "アレルゲン" },
  { key: "origin", label: "原産地" },
  { key: "manufacturer", label: "製造者・販売者" },
];

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNutritionValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function hasIngredientSourceDetails(ingredient: ItemCandidate | null | undefined) {
  if (!ingredient) return false;
  if (TEXT_FIELDS.some(({ key }) => hasText(ingredient[key]))) return true;
  if (hasText(ingredient.nutrition_per)) return true;
  if ((ingredient.label_images?.length ?? 0) > 0) return true;

  const nutrition = ingredient.nutrition;
  return Boolean(
    nutrition &&
      [nutrition.calories, nutrition.protein, nutrition.fat, nutrition.carbohydrate, nutrition.sodium]
        .some(hasNutritionValue),
  );
}

function formatUploadedDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("ja-JP");
}

function formatNutritionValue(value: number | null | undefined, unit: string) {
  return hasNutritionValue(value) ? `${value.toLocaleString("ja-JP")} ${unit}` : "-";
}

interface IngredientSourceDetailDialogProps {
  ingredient: ItemCandidate | null;
  onClose: () => void;
}

export default function IngredientSourceDetailDialog({
  ingredient,
  onClose,
}: IngredientSourceDetailDialogProps) {
  const textFields = ingredient
    ? TEXT_FIELDS.filter(({ key }) => hasText(ingredient[key]))
    : [];
  const images = ingredient?.label_images ?? [];
  const hasNutrition = Boolean(
    ingredient &&
      (hasText(ingredient.nutrition_per) ||
        [
          ingredient.nutrition?.calories,
          ingredient.nutrition?.protein,
          ingredient.nutrition?.fat,
          ingredient.nutrition?.carbohydrate,
          ingredient.nutrition?.sodium,
        ].some(hasNutritionValue)),
  );

  return (
    <Dialog open={Boolean(ingredient)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-emerald-100 bg-emerald-50 px-6 py-5 pr-12">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-emerald-600 ring-1 ring-emerald-200">
              <FlaskConical className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="truncate text-lg">{ingredient?.name ?? "原材料情報"}</DialogTitle>
              <DialogDescription className="mt-1">
                食材DBに取り込まれている表示情報とラベル画像
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[calc(90vh-92px)] overflow-y-auto px-6 py-5">
          {textFields.length > 0 && (
            <section aria-labelledby="ingredient-text-heading">
              <h3 id="ingredient-text-heading" className="mb-1 text-sm font-bold text-gray-900">
                表示情報
              </h3>
              <div className="divide-y divide-gray-200 border-y border-gray-200">
                {textFields.map(({ key, label }) => (
                  <div key={key} className="grid gap-1 py-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
                    <div className="text-xs font-medium text-gray-500">{label}</div>
                    <div className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-800">
                      {String(ingredient?.[key] ?? "")}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {hasNutrition && ingredient && (
            <section className={textFields.length > 0 ? "mt-6" : ""} aria-labelledby="ingredient-nutrition-heading">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 id="ingredient-nutrition-heading" className="text-sm font-bold text-gray-900">
                  栄養成分
                </h3>
                {hasText(ingredient.nutrition_per) && (
                  <span className="text-xs text-gray-500">{ingredient.nutrition_per}</span>
                )}
              </div>
              <dl className="grid grid-cols-2 border-y border-gray-200 sm:grid-cols-5">
                {[
                  ["エネルギー", formatNutritionValue(ingredient.nutrition?.calories, "kcal")],
                  ["たんぱく質", formatNutritionValue(ingredient.nutrition?.protein, "g")],
                  ["脂質", formatNutritionValue(ingredient.nutrition?.fat, "g")],
                  ["炭水化物", formatNutritionValue(ingredient.nutrition?.carbohydrate, "g")],
                  ["食塩相当量", formatNutritionValue(ingredient.nutrition?.sodium, "g")],
                ].map(([label, value]) => (
                  <div key={label} className="border-b border-gray-100 px-3 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
                    <dt className="text-[11px] text-gray-500">{label}</dt>
                    <dd className="mt-1 text-sm font-semibold text-gray-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className={textFields.length > 0 || hasNutrition ? "mt-6" : ""} aria-labelledby="ingredient-images-heading">
            <div className="mb-3 flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-gray-500" aria-hidden="true" />
              <h3 id="ingredient-images-heading" className="text-sm font-bold text-gray-900">
                ラベル画像
              </h3>
              <span className="text-xs text-gray-500">{images.length}枚</span>
            </div>
            {images.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {images.map((image, index) => {
                  const uploadedDate = formatUploadedDate(image.uploaded_at);
                  const label = LABEL_IMAGE_TYPE_LABELS[image.type] ?? image.type ?? `画像${index + 1}`;
                  return (
                    <a
                      key={`${image.type}-${image.url}-${index}`}
                      href={image.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group overflow-hidden rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                      aria-label={`${label}を原寸で開く`}
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
                        <span className="truncate text-xs font-medium text-gray-700">{label}</span>
                        <span className="flex shrink-0 items-center gap-1 text-[10px] text-gray-400">
                          {uploadedDate}
                          <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </span>
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.url}
                        alt={label}
                        className="aspect-[4/3] w-full bg-white object-contain transition-transform group-hover:scale-[1.02]"
                      />
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="border-y border-dashed border-gray-200 py-6 text-center text-sm text-gray-500">
                保存済みのラベル画像はありません
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
