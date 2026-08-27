"use client";

import { useRef, useState, type DragEvent } from "react";
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  RecipeEcListingImageRole,
  RecipeWebImageSourceType,
} from "@/lib/recipe-ec-images";

export type ScopedEcImage = {
  id: string;
  image_url: string;
  source_type: RecipeWebImageSourceType;
  file_size_bytes: number;
};

type ScopedEcImageSectionProps = {
  role: Extract<RecipeEcListingImageRole, "non_amazon" | "base_only">;
  title: string;
  description: string;
  images: ScopedEcImage[];
  startingOrder: number;
  badgeTone: "red" | "yellow";
  uploading: boolean;
  onUpload: (files: File[]) => Promise<void>;
  onReorder: (fromIndex: number, toIndex: number) => Promise<void>;
  onDelete: (imageId: string) => Promise<void>;
};

const SOURCE_LABELS: Record<RecipeWebImageSourceType, string> = {
  manual: "手動",
  rakuten: "楽天",
  mercari: "メルカリ",
  base: "BASE",
  shared_folder: "共有",
};

export default function ScopedEcImageSection({
  role,
  title,
  description,
  images,
  startingOrder,
  badgeTone,
  uploading,
  onUpload,
  onReorder,
  onDelete,
}: ScopedEcImageSectionProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragType = `application/x-recipe-${role}-image-index`;
  const accent = badgeTone === "red"
    ? {
        icon: "text-red-600",
        border: "border-red-200",
        soft: "bg-red-50/60",
        badge: "bg-red-600 text-white",
        hover: "hover:border-red-400 hover:bg-red-50/50",
        active: "border-red-500 bg-red-50",
      }
    : {
        icon: "text-amber-600",
        border: "border-amber-200",
        soft: "bg-amber-50/70",
        badge: "bg-amber-400 text-gray-950",
        hover: "hover:border-amber-400 hover:bg-amber-50/60",
        active: "border-amber-500 bg-amber-50",
      };

  const acceptDroppedFiles = async (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    setDragOver(false);
    const files = Array.from(event.dataTransfer.files).filter((file) =>
      file.type.startsWith("image/"),
    );
    await onUpload(files);
  };

  return (
    <section className={`border-t pt-4 ${accent.border}`} data-image-role={role}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <ImageIcon className={`h-4 w-4 ${accent.icon}`} />
            <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
            <span className="text-xs text-gray-400">{images.length}枚</span>
          </div>
          <p className="mt-1 text-xs text-gray-600">{description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          画像を追加
        </Button>
      </div>

      <div className={`mb-3 border-y px-3 py-2 text-xs text-gray-700 ${accent.border} ${accent.soft}`}>
        丸数字は各ECへ登録するときの最終掲載順です。発送案内と発送企業情報は通常画像の後ろへ追加します。
      </div>

      {images.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {images.map((image, index) => (
            <div
              key={image.id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(dragType, String(index));
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(dragType)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                const value = event.dataTransfer.getData(dragType);
                if (!value) return;
                event.preventDefault();
                void onReorder(Number(value), index);
              }}
              className="group relative overflow-hidden rounded-md border border-gray-200 bg-white"
              title="ドラッグで並び替え"
            >
              <span className={`absolute left-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold shadow-sm ${accent.badge}`}>
                {startingOrder + index}
              </span>
              <a
                href={image.image_url}
                target="_blank"
                rel="noreferrer"
                className="block aspect-square bg-gray-50"
              >
                <img
                  src={image.image_url}
                  alt={`${title} ${index + 1}`}
                  className="h-full w-full object-contain"
                />
              </a>
              <div className="flex min-h-10 items-center justify-between gap-1 border-t border-gray-100 px-2 py-1">
                <span className="min-w-0 text-[10px] leading-4 text-gray-600">
                  <strong className="block truncate text-gray-800">
                    掲載順{startingOrder + index}・発送情報
                  </strong>
                  <span>{SOURCE_LABELS[image.source_type]}・{Math.ceil(image.file_size_bytes / 1024)}KB</span>
                </span>
                <button
                  type="button"
                  onClick={() => void onDelete(image.id)}
                  className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  title="画像を削除"
                  aria-label={`${title}${index + 1}枚目を削除`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        onDragEnter={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false);
        }}
        onDrop={acceptDroppedFiles}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-4 text-center transition-colors ${dragOver ? accent.active : `border-gray-300 bg-gray-50 ${accent.hover}`} ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={async (event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = "";
            await onUpload(files);
          }}
        />
        {uploading ? (
          <>
            <Loader2 className={`mb-2 h-6 w-6 animate-spin ${accent.icon}`} />
            <p className="text-sm font-medium text-gray-600">画像を処理しています</p>
          </>
        ) : (
          <>
            <Upload className="mb-2 h-6 w-6 text-gray-400" />
            <p className="text-sm font-medium text-gray-700">画像をドロップ、またはクリックして選択</p>
            <p className="mt-1 text-xs text-gray-500">JPEG・PNG・WebP／250KB超は自動縮小</p>
          </>
        )}
      </div>
    </section>
  );
}
