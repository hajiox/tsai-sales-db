// app/recipe/[id]/page.tsx
// レシピ詳細ページ - シングルページレイアウト & 印刷対応

"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowDownWideNarrow, ArrowLeft, Edit, Save, Printer, Plus, Trash2, FlaskConical, Loader2, X, AlertTriangle, Camera, ImageIcon, Upload, History, RotateCcw, ChevronDown, Database, ClipboardCopy, ListOrdered, ExternalLink, Link2, Images } from "lucide-react";
import { toast } from "sonner";
import NutritionDisplay, {
  NutritionData,
} from "../_components/NutritionDisplay";
import ItemNameSelect, { ItemCandidate } from "../_components/ItemNameSelect";
import InlineEdit from "../_components/InlineEdit";
import EcPriceSyncControls from "../_components/EcPriceSyncControls";
import EcProductNameSyncControls from "../_components/EcProductNameSyncControls";
import { fetchSeriesList, SERIES_LIST, type SeriesItem } from "@/lib/series-list";
import { taxExcludedForExactIncluded, taxIncludedFromExcluded, wholesalePriceFromTaxExcludedRetail, yenFloor } from "@/lib/money";
import type { PreviousRecipePrice, RecipePriceRevision } from "@/lib/recipe-price-history";

// カテゴリー一覧
const CATEGORIES = [
  {
    value: "ネット専用",
    label: "ネット",
    color: "bg-blue-100 text-blue-800 border-blue-200",
  },
  {
    value: "自社",
    label: "自社",
    color: "bg-green-100 text-green-800 border-green-200",
  },
  {
    value: "OEM",
    label: "OEM",
    color: "bg-orange-100 text-orange-800 border-orange-200",
  },
  {
    value: "中間部品",
    label: "中間部品",
    color: "bg-purple-100 text-purple-800 border-purple-200",
  },
  {
    value: "終売",
    label: "終売",
    color: "bg-gray-500 text-white border-gray-600",
  },
  {
    value: "試作",
    label: "試作",
    color: "bg-gray-100 text-gray-800 border-gray-200",
  },
];

const SELF_SHELF_LIFE_OPTIONS = [
  "製造から12カ月",
  "製造から18カ月",
  "製造から24カ月",
  "製造から2カ月",
] as const;

function formatQuantityText(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  const text = String(value).trim();
  return text || "-";
}

function normalizeSelfShelfLife(value?: string | null) {
  if (!value) return null;
  const text = value
    .trim()
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/ヶ月|か月|ヵ月|ケ月/g, "カ月")
    .replace(/より/g, "から");
  if (SELF_SHELF_LIFE_OPTIONS.includes(text as typeof SELF_SHELF_LIFE_OPTIONS[number])) return text;

  const hasMonth = (month: number) => new RegExp(`(^|[^0-9])${month}\\s*カ月`).test(text);
  const hasYear = (year: number) => new RegExp(`(^|[^0-9])${year}\\s*年`).test(text);

  if (hasMonth(18)) return "製造から18カ月";
  if (hasMonth(24) || hasYear(2)) return "製造から24カ月";
  if (hasMonth(12) || hasYear(1)) return "製造から12カ月";
  if (text.includes("60日") || hasMonth(2)) return "製造から2カ月";
  return null;
}

interface Recipe {
  id: string;
  name: string;
  category: string;
  is_intermediate: boolean;
  development_date: string | null;
  manufacturing_notes: string | null;
  filling_quantity: string | number | null;
  filling_quantity_unit?: string | null;
  label_quantity: string | null;
  net_content_unit?: string | null;
  storage_method: string | null;
  sterilization_method: string | null;
  sterilization_temperature: string | null;
  sterilization_time: string | null;
  selling_price: number | null;
  total_cost: number | null;
  total_weight: number | null;
  source_file: string | null;
  amazon_fee_enabled: boolean;
  ingredient_label?: string | null;
  ai_ingredient_label?: string | null;
  linked_product_id?: string | null;
  yield_rate?: number | null;
  series?: string | null;
  series_code?: number | null;
  product_code?: number | null;
  product_image_url?: string | null;
  jan_code?: string | null;
  lot_size?: number | null;
  case_quantity?: number | null;
  case_size?: string | null;
  shelf_life?: string | null;
  web_description?: string | null;
  product_points?: string | null;
  ec_product_name?: string | null;
  catchcopy?: string | null;
  product_lp_url?: string | null;
}

interface RecipeItem {
  id: string;
  recipe_id: string;
  item_name: string;
  item_type: string;
  ingredient_id?: string | null;
  material_id?: string | null;
  expense_id?: string | null;
  intermediate_recipe_id?: string | null;
  unit_quantity: number | string | null;
  unit_price: number | string | null;
  unit_weight: number | null;
  usage_amount: number | string | null;
  cost: number | string | null;
  tax_included?: boolean;
}

type IngredientSortMode = "registered" | "weight";

type WebProductImage = {
  id: string;
  image_url: string;
  image_role: "gallery" | "portrait";
  source_type: "manual" | "rakuten" | "base" | "shared_folder";
  source_page_url: string | null;
  source_image_url: string | null;
  original_filename: string | null;
  file_size_bytes: number;
  sort_order: number;
  created_at: string;
};

const WEB_IMAGE_MAX_BYTES = 250 * 1024;

async function compressWebProductImage(file: File): Promise<File> {
  if (file.size <= WEB_IMAGE_MAX_BYTES) return file;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error(`${file.name}: JPEG・PNG・WebP画像を選択してください`);
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`${file.name}: 画像を読み込めませんでした`));
      element.src = objectUrl;
    });

    let width = image.naturalWidth;
    let height = image.naturalHeight;
    const initialScale = Math.min(1, 1800 / Math.max(width, height));
    width = Math.max(1, Math.round(width * initialScale));
    height = Math.max(1, Math.round(height * initialScale));

    for (let sizeAttempt = 0; sizeAttempt < 7; sizeAttempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('画像縮小処理を開始できませんでした');
      context.drawImage(image, 0, 0, width, height);

      for (const quality of [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
        if (blob && blob.size <= WEB_IMAGE_MAX_BYTES) {
          return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
        }
      }
      width = Math.max(320, Math.round(width * 0.82));
      height = Math.max(320, Math.round(height * 0.82));
    }
    throw new Error(`${file.name}: 250KB以下へ縮小できませんでした`);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function RecipeDetailContent() {
  const params = useParams();
  const router = useRouter();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [items, setItems] = useState<RecipeItem[]>([]);
  const [ingredientSortMode, setIngredientSortMode] = useState<IngredientSortMode>("registered");
  const [registeredItemOrder, setRegisteredItemOrder] = useState<Record<string, number>>({});
  const [taxRates, setTaxRates] = useState({
    ingredient: 1.08,
    material: 1.1,
    amazon_fee: 10,
  });

  useEffect(() => {
    const saved = localStorage.getItem("global_tax_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setTaxRates({
          ingredient: 1 + parsed.ingredient / 100,
          material: 1 + parsed.material / 100,
          amazon_fee: parsed.amazon_fee || 10,
        });
      } catch (e) {
        console.error("Failed to parse tax settings", e);
      }
    }
  }, []);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [sellingPriceTaxIncludedPriority, setSellingPriceTaxIncludedPriority] = useState(false);
  const [previousSellingPrice, setPreviousSellingPrice] = useState<PreviousRecipePrice | null>(null);
  const [sellingPriceHistory, setSellingPriceHistory] = useState<RecipePriceRevision[]>([]);
  const [priceHistoryExpanded, setPriceHistoryExpanded] = useState(false);
  const [nutritionMap, setNutritionMap] = useState<
    Record<string, NutritionData>
  >({});

  const getItemNutrition = (item: RecipeItem) => {
    return (
      nutritionMap[`name:${item.item_name}`] ||
      (item.ingredient_id ? nutritionMap[`id:${item.ingredient_id}`] : undefined)
    );
  };

  // Deletion tracking
  const [deletedItemIds, setDeletedItemIds] = useState<Set<string>>(new Set());

  // Master Data
  const [ingredients, setIngredients] = useState<ItemCandidate[]>([]);
  const [materials, setMaterials] = useState<ItemCandidate[]>([]);
  const [intermediates, setIntermediates] = useState<ItemCandidate[]>([]);
  const [products, setProducts] = useState<ItemCandidate[]>([]);
  const [expenses, setExpenses] = useState<ItemCandidate[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesItem[]>(SERIES_LIST);
  const [janDuplicateInfo, setJanDuplicateInfo] = useState<{
    recipeCount: number;
    janMasterCount: number;
    names: string[];
    janMasters: { id: string; product_name: string | null; category: string | null; memo: string | null }[];
  }>({ recipeCount: 0, janMasterCount: 0, names: [], janMasters: [] });

  // Batch calculation states
  const [batchSize1, setBatchSize1] = useState(400);
  const [batchSize2, setBatchSize2] = useState(800);

  // 基本(1)スケール変更: 元データ(100%)のバックアップ
  const [originalUsageMap, setOriginalUsageMap] = useState<Record<string, number>>({});
  const [currentScalePercent, setCurrentScalePercent] = useState<number | null>(null);

  // 原材料表示
  const [labelTab, setLabelTab] = useState<'manual' | 'ai'>('manual');
  const [labelText, setLabelText] = useState("");
  const [aiLabelText, setAiLabelText] = useState("");
  const [labelGenerating, setLabelGenerating] = useState(false);
  const [labelWarnings, setLabelWarnings] = useState<string[]>([]);
  const [labelMissing, setLabelMissing] = useState<string[]>([]);
  const [labelCarryover, setLabelCarryover] = useState<string[]>([]);
  const [labelEditing, setLabelEditing] = useState(false);

  // 商品写真
  const [recipeImages, setRecipeImages] = useState<{ id: string; image_url: string; sort_order: number }[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Web商品画像（商品写真とは別管理）
  const [webProductImages, setWebProductImages] = useState<WebProductImage[]>([]);
  const [webImagesUploading, setWebImagesUploading] = useState(false);
  const [webImagesDragOver, setWebImagesDragOver] = useState(false);
  const webImagesInputRef = useRef<HTMLInputElement>(null);
  const [portraitImages, setPortraitImages] = useState<WebProductImage[]>([]);
  const [portraitUploading, setPortraitUploading] = useState(false);
  const [portraitDragOver, setPortraitDragOver] = useState(false);
  const portraitInputRef = useRef<HTMLInputElement>(null);

  // バージョン管理
  interface RecipeVersion {
    id: string;
    version_number: number;
    version_note: string | null;
    created_at: string;
    snapshot_recipe: any;
    snapshot_items: any[];
  }
  const [versions, setVersions] = useState<RecipeVersion[]>([]);
  const [versionPanelOpen, setVersionPanelOpen] = useState(false);
  const [previewingVersionId, setPreviewingVersionId] = useState<string | null>(null);
  const [draftMode, setDraftMode] = useState(false);
  const [draftVersionNote, setDraftVersionNote] = useState("");
  const [draftSourceVersionId, setDraftSourceVersionId] = useState<string | null>(null);
  const [editingVersionNoteId, setEditingVersionNoteId] = useState<string | null>(null);
  const [editingVersionNote, setEditingVersionNote] = useState("");
  const [savingVersionNoteId, setSavingVersionNoteId] = useState<string | null>(null);

  const formatVersionDate = (date: string) =>
    new Date(date).toLocaleString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

  const fetchVersions = useCallback(async (recipeId: string) => {
    try {
      const res = await fetch(`/api/recipe/versions?recipeId=${recipeId}`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
      }
    } catch { }
  }, []);

  useEffect(() => {
    if (recipe?.id) fetchVersions(recipe.id);
  }, [recipe?.id, fetchVersions]);

  const startDraftRevision = () => {
    if (!recipe) return;
    if (previewingVersionId) {
      const version = versions.find(v => v.id === previewingVersionId);
      if (version) startRevisionFromVersion(version);
      return;
    }
    setDraftMode(true);
    setDraftVersionNote("");
    setDraftSourceVersionId(null);
    setIsEditing(true);
    toast.success("修正版の編集を開始しました");
  };

  const loadVersionSnapshot = (version: RecipeVersion, idPrefix: string) => {
    const snap = version.snapshot_recipe || {};
    setRecipe(prev => prev ? {
      ...prev,
      ...snap,
      id: prev.id,
    } : prev);
    const snapshotItems = (version.snapshot_items || []).map((si: any) => ({
      ...si,
      id: `${idPrefix}-${Math.random().toString(36).slice(2)}`,
    }));
    setItems(snapshotItems);
    setRegisteredItemOrder(Object.fromEntries(snapshotItems.map((item: RecipeItem, index: number) => [item.id, index])));
    setDeletedItemIds(new Set());
    setOriginalUsageMap({});
    setCurrentScalePercent(null);
  };

  const clearVersionPreview = () => {
    if (!recipe) return;
    setPreviewingVersionId(null);
    setDraftMode(false);
    setDraftVersionNote("");
    setDraftSourceVersionId(null);
    setEditingVersionNoteId(null);
    setEditingVersionNote("");
    setHasChanges(false);
    setIsEditing(true);
    fetchRecipe(recipe.id);
  };

  const startRevisionFromVersion = (version: RecipeVersion) => {
    if (!recipe || isSaving) return;
    if (!previewingVersionId && hasChanges) {
      if (!confirm("未保存の変更を破棄して、この過去版を元に修正版を作りますか？")) return;
    }
    loadVersionSnapshot(version, "temp-history");
    setPreviewingVersionId(null);
    setDraftMode(true);
    setDraftSourceVersionId(version.id);
    setDraftVersionNote(`v${version.version_number}を元に修正`);
    setIsEditing(true);
    setHasChanges(true);
    toast.success(`Ver.${version.version_number}を元に修正版の編集を開始しました`);
  };

  const startEditVersionNote = (version: RecipeVersion) => {
    setEditingVersionNoteId(version.id);
    setEditingVersionNote(version.version_note || "");
  };

  const cancelEditVersionNote = () => {
    setEditingVersionNoteId(null);
    setEditingVersionNote("");
  };

  const saveVersionNote = async (version: RecipeVersion) => {
    if (savingVersionNoteId) return;
    setSavingVersionNoteId(version.id);
    try {
      const res = await fetch('/api/recipe/versions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: version.id,
          note: editingVersionNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '履歴メモの保存に失敗しました');
      setVersions((prev) => prev.map((v) => v.id === version.id ? data.version : v));
      setEditingVersionNoteId(null);
      setEditingVersionNote("");
      toast.success(`Ver.${version.version_number} のメモを更新しました`);
    } catch (error: any) {
      toast.error(error.message || '履歴メモの保存に失敗しました');
    } finally {
      setSavingVersionNoteId(null);
    }
  };

  const restoreVersion = async (version: RecipeVersion) => {
    if (!recipe || isSaving) return;
    if (!confirm(`Ver.${version.version_number} で現在のレシピを上書き保存します。\n新しい履歴として残したい場合は「新レシピを作成」を使ってください。\n\n上書き保存しますか？`)) return;
    setIsSaving(true);
    try {
      // レシピメタデータを復元
      const snap = version.snapshot_recipe;
      const restoreFields: Record<string, any> = {};
      const fieldsToRestore = ['name', 'filling_quantity', 'filling_quantity_unit', 'label_quantity', 'net_content_unit', 'storage_method',
        'sterilization_method', 'sterilization_temperature', 'sterilization_time',
        'manufacturing_notes', 'selling_price', 'amazon_fee_enabled', 'yield_rate',
        'jan_code', 'lot_size', 'case_quantity', 'case_size', 'shelf_life'];
      fieldsToRestore.forEach(f => { if (f in snap) restoreFields[f] = snap[f]; });

      const res = await fetch('/api/recipe/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipeId: recipe.id,
          replaceAllItems: true,
          deletedItemIds: [],
          newItems: version.snapshot_items.map((si: any) => ({
            item_name: si.item_name,
            item_type: si.item_type,
            unit_quantity: si.unit_quantity,
            unit_price: si.unit_price,
            unit_weight: si.unit_weight,
            usage_amount: si.usage_amount,
            cost: si.cost,
            tax_included: si.tax_included ?? true,
            ingredient_id: si.ingredient_id || null,
            material_id: si.material_id || null,
            expense_id: si.expense_id || null,
            intermediate_recipe_id: si.intermediate_recipe_id || null,
          })),
          existingItems: [],
          recipeUpdates: {
            ...restoreFields,
            total_cost: snap.total_cost,
            total_weight: snap.total_weight,
          },
        }),
      });
      const saveResult = await res.json();
      if (!res.ok) throw new Error(saveResult.error || '上書き保存に失敗しました');
      toast.success(`Ver.${version.version_number} で上書き保存しました`);
      if (saveResult.tsgNotification?.failed > 0) {
        toast.warning('価格変更のTSG掲示板報告は再試行待ちです');
      }
      setPreviewingVersionId(null);
      setDraftMode(false);
      setDraftVersionNote("");
      setDraftSourceVersionId(null);
      setHasChanges(false);
      setIsEditing(true);
      fetchRecipe(recipe.id);
    } catch (error: any) {
      toast.error(error.message || '上書き保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteVersion = async (version: RecipeVersion) => {
    if (!recipe) return;
    if (!confirm(`Ver.${version.version_number}${version.version_note ? ` (${version.version_note})` : ''} を削除しますか？`)) return;
    try {
      const res = await fetch(`/api/recipe/versions?id=${version.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('削除に失敗しました');
      toast.success(`Ver.${version.version_number} を削除しました`);
      if (previewingVersionId === version.id) {
        setPreviewingVersionId(null);
        setDraftMode(false);
        setDraftVersionNote("");
        setHasChanges(false);
        setIsEditing(true);
        fetchRecipe(recipe.id);
      }
      if (draftSourceVersionId === version.id) {
        setDraftSourceVersionId(null);
      }
      if (editingVersionNoteId === version.id) {
        setEditingVersionNoteId(null);
        setEditingVersionNote("");
      }
      fetchVersions(recipe.id);
    } catch (error: any) {
      toast.error(error.message || '削除に失敗しました');
    }
  };

  const previewVersion = (version: RecipeVersion) => {
    if (!recipe) return;
    // 既に同じバージョンをプレビュー中ならプレビュー解除（元に戻す）
    if (previewingVersionId === version.id) {
      clearVersionPreview();
      return;
    }
    if (!previewingVersionId && hasChanges) {
      if (!confirm("未保存の変更を破棄して過去版をプレビューしますか？")) return;
    }
    setDraftMode(false);
    setDraftVersionNote("");
    setDraftSourceVersionId(null);
    loadVersionSnapshot(version, "temp-preview");
    setPreviewingVersionId(version.id);
    setIsEditing(false);
    setHasChanges(true);
  };

  const searchParams = useSearchParams();

  useEffect(() => {
    if (params.id) {
      fetchRecipe(params.id as string);
      fetchMasterData();
    }
    // シリーズをDBから取得
    fetchSeriesList().then(setSeriesList);
  }, [params.id]);

  useEffect(() => {
    const checkJanDuplicates = async () => {
      if (!recipe?.jan_code) {
        setJanDuplicateInfo({ recipeCount: 0, janMasterCount: 0, names: [], janMasters: [] });
        return;
      }

      const [{ data: recipeRows }, { data: janRows }] = await Promise.all([
        supabase
          .from("recipes")
          .select("id, name, category")
          .eq("jan_code", recipe.jan_code),
        supabase
          .from("jan_codes")
          .select("id, product_name, category, memo")
          .eq("jan_code", recipe.jan_code),
      ]);

      const otherRecipes = (recipeRows || []).filter((row) => row.id !== recipe.id);
      setJanDuplicateInfo({
        recipeCount: otherRecipes.length,
        janMasterCount: Math.max((janRows || []).length - 1, 0),
        names: otherRecipes
          .map((row) => `${row.name}${row.category ? `（${row.category}）` : ""}`)
          .filter(Boolean),
        janMasters: (janRows || []).map((row) => ({
          id: row.id,
          product_name: row.product_name || null,
          category: row.category || null,
          memo: row.memo || null,
        })),
      });
    };

    checkJanDuplicates();
  }, [recipe?.id, recipe?.jan_code]);

  // JAN発行ページからの自動挿入: ?jan_code=xxx を検出
  useEffect(() => {
    const janFromUrl = searchParams.get('jan_code');
    if (janFromUrl && recipe) {
      handleRecipeChange('jan_code', janFromUrl);
      setHasChanges(true);
      toast.success(`JANコード ${janFromUrl} を挿入しました。保存ボタンで確定してください。`);
      // URLからパラメータを除去（履歴汚染防止）
      const url = new URL(window.location.href);
      url.searchParams.delete('jan_code');
      window.history.replaceState({}, '', url.pathname);
    }
  }, [searchParams, recipe?.id]);

  // 原材料表示テキストをレシピデータから初期化
  useEffect(() => {
    setLabelText(recipe?.ingredient_label || "");
    setAiLabelText(recipe?.ai_ingredient_label || "");
    // AIラベルがあって手動がなければAIタブをデフォルト表示
    if (recipe?.ai_ingredient_label && !recipe?.ingredient_label) setLabelTab('ai');
  }, [recipe?.ingredient_label, recipe?.ai_ingredient_label]);

  const fetchMasterData = async () => {
    // Ingredients
    const { data: ingData } = await supabase
      .from("ingredients")
      .select(
        "id, name, unit_quantity, price, calories, protein, fat, carbohydrate, sodium, tax_included, raw_materials",
      );
    if (ingData) {
      setIngredients(
        ingData.map((i) => ({
          id: i.id,
          name: i.name,
          unit_quantity: i.unit_quantity ?? 1,
          unit_price: i.price ?? 0,
          tax_included: i.tax_included ?? true,
          raw_materials: i.raw_materials ?? null,
          nutrition: {
            calories: i.calories,
            protein: i.protein,
            fat: i.fat,
            carbohydrate: i.carbohydrate,
            sodium: i.sodium,
          },
        })),
      );
    }
    // Materials
    const { data: matData } = await supabase
      .from("materials")
      .select("id, name, unit_quantity, price, tax_included");
    if (matData) {
      setMaterials(
        matData.map((m) => ({
          id: m.id,
          name: m.name,
          unit_quantity: m.unit_quantity ? parseFloat(String(m.unit_quantity)) || 1 : 1,
          unit_price: m.price ?? 0,
          tax_included: m.tax_included ?? true,
        })),
      );
    }
    // Intermediates
    const { data: recipeData } = await supabase
      .from("recipes")
      .select("id, name, total_cost, total_weight, yield_rate")
      .eq("is_intermediate", true);
    if (recipeData) {
      setIntermediates(
        recipeData.map((r) => {
          const yieldRate = r.yield_rate ?? 1.0;
          const actualWeight = (r.total_weight ?? 0) * yieldRate;
          return {
            id: r.id,
            name: r.name,
            unit_quantity: 1,
            unit_weight: actualWeight || undefined,
            unit_price: r.total_cost ?? undefined,
            yield_rate: yieldRate,
          };
        }),
      );
    }
    // Products (Set Components) - ネット専用・自社カテゴリのみ、シリーズ番号→商品番号でソート
    const { data: prodData } = await supabase
      .from("recipes")
      .select("id, name, total_cost, total_weight, series_code, product_code")
      .eq("is_intermediate", false)
      .in("category", ["ネット専用", "自社"])
      .order("series_code", { ascending: true, nullsFirst: false })
      .order("product_code", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });
    if (prodData) {
      setProducts(
        prodData.map((r) => ({
          id: r.id,
          name: r.name,
          unit_quantity: 1,
          unit_weight: r.total_weight ?? undefined,
          unit_price: r.total_cost ?? undefined,
        })),
      );
    }
    // Expenses
    const { data: expData } = await supabase
      .from("expenses")
      .select("id, name, unit_price, unit_quantity, tax_included");
    if (expData) {
      setExpenses(
        expData.map((e) => ({
          id: e.id,
          name: e.name,
          unit_price: e.unit_price ? parseFloat(e.unit_price as any) : 0,
          unit_quantity: e.unit_quantity ? parseFloat(e.unit_quantity as any) : 1,
          tax_included: e.tax_included ?? false,
        })),
      );
    }
  };

  const fetchRecipe = async (id: string) => {
    setLoading(true);

    const { data: recipeData, error: recipeError } = await supabase
      .from("recipes")
      .select("*")
      .eq("id", id)
      .single();

    if (recipeError || !recipeData) {
      console.error("Recipe fetch error:", recipeError);
      setLoading(false);
      return;
    }

    const selfShelfLife = recipeData.category === "自社"
      ? normalizeSelfShelfLife(recipeData.shelf_life)
      : recipeData.shelf_life;

    setRecipe({
      ...recipeData,
      amazon_fee_enabled: recipeData.amazon_fee_enabled ?? false,
      shelf_life: selfShelfLife,
    });

    try {
      const response = await fetch(`/api/recipe/${encodeURIComponent(id)}/price-history`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("前回価格を取得できませんでした");
      const history = await response.json();
      setPreviousSellingPrice(history.previousPrice || null);
      setSellingPriceHistory(Array.isArray(history.history) ? history.history : []);
    } catch (error) {
      console.error("Previous recipe price fetch error:", error);
      setPreviousSellingPrice(null);
      setSellingPriceHistory([]);
    }

    const { data: itemsData } = await supabase
      .from("recipe_items")
      .select("*")
      .eq("recipe_id", id)
      .order("id");

    if (itemsData) {
      setItems(itemsData);
      setRegisteredItemOrder(Object.fromEntries(itemsData.map((item, index) => [item.id, index])));

      const ingredientItems = itemsData.filter(
        (i) => i.item_type === "ingredient" || i.item_type === "intermediate",
      );
      const ingredientNames = ingredientItems
        .filter(
          (i) => i.item_name,
        )
        .map((i) => i.item_name);
      const ingredientIds = ingredientItems
        .map((i) => i.ingredient_id)
        .filter(Boolean);

      const nutritionQueries = [];
      if (ingredientNames.length > 0) {
        nutritionQueries.push(
          supabase
            .from("ingredients")
            .select("id, name, calories, protein, fat, carbohydrate, sodium")
            .in("name", ingredientNames),
        );
      }
      if (ingredientIds.length > 0) {
        nutritionQueries.push(
          supabase
            .from("ingredients")
            .select("id, name, calories, protein, fat, carbohydrate, sodium")
            .in("id", ingredientIds),
        );
      }

      if (nutritionQueries.length > 0) {
        const nutritionResults = await Promise.all(nutritionQueries);
        const nutritionData = nutritionResults.flatMap((result) => result.data || []);
        const map: Record<string, NutritionData> = {};
        if (nutritionData.length > 0) {
          nutritionData.forEach((n) => {
            const nutrition = {
              calories: n.calories,
              protein: n.protein,
              fat: n.fat,
              carbohydrate: n.carbohydrate,
              sodium: n.sodium,
            };
            map[`id:${n.id}`] = nutrition;
            map[`name:${n.name}`] = nutrition;
          });
        }
        setNutritionMap(map);
      } else {
        setNutritionMap({});
      }
    } else {
      setNutritionMap({});
    }

    setLoading(false);
  };

  // ─── 商品写真 ───
  const fetchRecipeImages = async (rid: string) => {
    try {
      const res = await fetch(`/api/recipe/upload-image?recipeId=${rid}`);
      if (res.ok) {
        const data = await res.json();
        setRecipeImages(data.images || []);
      }
    } catch { }
  };

  useEffect(() => {
    if (recipe?.id) fetchRecipeImages(recipe.id);
  }, [recipe?.id]);

  const fetchWebProductImages = async (recipeId: string) => {
    try {
      const response = await fetch(`/api/recipe/web-images?recipeId=${recipeId}`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      setWebProductImages(data.images || []);
      setPortraitImages(data.portraitImages || []);
    } catch { }
  };

  useEffect(() => {
    if (recipe?.id) fetchWebProductImages(recipe.id);
  }, [recipe?.id]);

  const uploadWebProductImages = async (files: File[]) => {
    if (!recipe || files.length === 0) return;
    setWebImagesUploading(true);
    let resizedCount = 0;
    try {
      for (const sourceFile of files) {
        if (!sourceFile.type.startsWith('image/')) continue;
        const file = await compressWebProductImage(sourceFile);
        if (file.size < sourceFile.size) resizedCount++;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('recipeId', recipe.id);
        formData.append('sourceType', 'manual');
        formData.append('originalFilename', sourceFile.name);
        const response = await fetch('/api/recipe/web-images', { method: 'POST', body: formData });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `${sourceFile.name}の登録に失敗しました`);
        setWebProductImages((current) => [...current, data.image]);
      }
      toast.success(`${files.length}枚を登録しました${resizedCount ? `（${resizedCount}枚を自動縮小）` : ''}`);
    } catch (error: any) {
      toast.error(error.message || 'Web商品画像の登録に失敗しました');
    } finally {
      setWebImagesUploading(false);
    }
  };

  const reorderWebProductImages = async (fromIndex: number, toIndex: number) => {
    if (!recipe || fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const next = [...webProductImages];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) return;
    next.splice(toIndex, 0, moved);
    const reordered = next.map((image, index) => ({ ...image, sort_order: index }));
    setWebProductImages(reordered);
    const response = await fetch('/api/recipe/web-images', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeId: recipe.id, imageOrder: reordered.map(({ id }) => ({ id })) }),
    });
    if (!response.ok) {
      await fetchWebProductImages(recipe.id);
      toast.error('画像の並び替えに失敗しました');
    }
  };

  const deleteWebProductImage = async (imageId: string) => {
    if (!recipe || !confirm('このWeb商品画像を削除しますか？')) return;
    const response = await fetch('/api/recipe/web-images', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId, recipeId: recipe.id }),
    });
    const data = await response.json();
    if (!response.ok) {
      toast.error(data.error || '画像を削除できませんでした');
      return;
    }
    setWebProductImages((current) => current.filter((image) => image.id !== imageId));
    toast.success('Web商品画像を削除しました');
  };

  const uploadPortraitImages = async (files: File[]) => {
    if (!recipe || files.length === 0) return;
    setPortraitUploading(true);
    let uploadedCount = 0;
    let resizedCount = 0;
    try {
      for (const sourceFile of files) {
        if (!sourceFile.type.startsWith('image/')) continue;
        const file = await compressWebProductImage(sourceFile);
        if (file.size < sourceFile.size) resizedCount++;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('recipeId', recipe.id);
        formData.append('sourceType', 'manual');
        formData.append('imageRole', 'portrait');
        formData.append('originalFilename', sourceFile.name);
        const response = await fetch('/api/recipe/web-images', { method: 'POST', body: formData });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `${sourceFile.name}の登録に失敗しました`);
        setPortraitImages((current) => [...current, data.image]);
        uploadedCount++;
      }
      if (uploadedCount === 0) throw new Error('JPEG・PNG・WebP画像を選択してください');
      toast.success(`${uploadedCount}枚のポートレート画像を登録しました${resizedCount ? `（${resizedCount}枚を自動縮小）` : ''}`);
    } catch (error: any) {
      toast.error(error.message || 'ポートレート画像の登録に失敗しました');
    } finally {
      setPortraitUploading(false);
    }
  };

  const reorderPortraitImages = async (fromIndex: number, toIndex: number) => {
    if (!recipe || fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    const next = [...portraitImages];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) return;
    next.splice(toIndex, 0, moved);
    const reordered = next.map((image, index) => ({ ...image, sort_order: index }));
    setPortraitImages(reordered);
    const response = await fetch('/api/recipe/web-images', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipeId: recipe.id, imageRole: 'portrait', imageOrder: reordered.map(({ id }) => ({ id })) }),
    });
    if (!response.ok) {
      await fetchWebProductImages(recipe.id);
      toast.error('ポートレート画像の並び替えに失敗しました');
    }
  };

  const deletePortraitImage = async (imageId: string) => {
    if (!recipe || !confirm('このポートレート画像を削除しますか？')) return;
    const response = await fetch('/api/recipe/web-images', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageId, recipeId: recipe.id }),
    });
    const data = await response.json();
    if (!response.ok) {
      toast.error(data.error || 'ポートレート画像を削除できませんでした');
      return;
    }
    setPortraitImages((current) => current.filter((image) => image.id !== imageId));
    toast.success('ポートレート画像を削除しました');
  };

  const compressPhoto = (file: File, maxWidth = 1200, targetSizeKB = 280): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas error")); return; }
        ctx.drawImage(img, 0, 0, w, h);
        let lo = 0.1, hi = 0.92;
        let bestBlob: Blob | null = null;
        const tryQ = (q: number): Promise<Blob> => new Promise(res => canvas.toBlob(b => res(b!), "image/jpeg", q));
        const find = async () => {
          for (let i = 0; i < 6; i++) {
            const mid = (lo + hi) / 2;
            bestBlob = await tryQ(mid);
            if (bestBlob.size / 1024 > targetSizeKB) hi = mid; else lo = mid;
          }
          if (bestBlob && bestBlob.size / 1024 > targetSizeKB * 1.5) {
            const sf = Math.sqrt((targetSizeKB * 1024) / bestBlob.size);
            canvas.width = Math.round(w * sf); canvas.height = Math.round(h * sf);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            bestBlob = await tryQ(0.82);
          }
          resolve(new File([bestBlob!], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        };
        find().catch(reject);
      };
      img.onerror = () => reject(new Error("画像読み込み失敗"));
      img.src = URL.createObjectURL(file);
    });
  };

  const uploadPhotos = async (files: File[]) => {
    if (!recipe) return;
    setPhotoUploading(true);
    try {
      for (const file of files) {
        const compressed = await compressPhoto(file);
        const formData = new FormData();
        formData.append("file", compressed);
        formData.append("recipeId", recipe.id);
        const res = await fetch("/api/recipe/upload-image", { method: "POST", body: formData });
        if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
        const data = await res.json();
        setRecipeImages(prev => [...prev, { id: data.id, image_url: data.url, sort_order: data.sort_order }]);
      }
      toast.success(`${files.length}枚の写真をアップロードしました`);
    } catch (error: any) {
      toast.error(error.message || "アップロード失敗");
    } finally { setPhotoUploading(false); }
  };

  const handleItemChange = (itemId: string, field: string, value: any) => {
    setItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id === itemId) {
          const updatedItem = { ...item, [field]: value };

          if (["usage_amount", "unit_quantity", "unit_price", "tax_included"].includes(field)) {
            const usage = parseFloat(String(updatedItem.usage_amount)) || 0;
            const qty = parseFloat(String(updatedItem.unit_quantity)) || 1;
            const price = parseFloat(String(updatedItem.unit_price)) || 0;
            const isIntermediate = updatedItem.item_type === "intermediate" || updatedItem.item_type === "product";
            const isMat = updatedItem.item_type === "material" || updatedItem.item_type === "expense";

            if (isIntermediate) {
              // 中間加工品/商品
              const isGramMode = parseFloat(String(updatedItem.unit_quantity)) === -1;
              if (isGramMode && (updatedItem.unit_weight || 0) > 0) {
                // グラムモード: usage_amount(g) / unit_weight(1個分のg) × unit_price
                updatedItem.cost = roundToDecimals((usage / (updatedItem.unit_weight || 1)) * price, 4);
              } else {
                // 個数モード: usage_amount(個数) × unit_price(元レシピの原価)
                updatedItem.cost = roundToDecimals(usage * price, 4);
              }
            } else {
              const rate =
                updatedItem.item_type === "ingredient" &&
                  !updatedItem.tax_included
                  ? (1 + (taxRates.ingredient / 100))
                  : updatedItem.item_type === "material" &&
                    !updatedItem.tax_included
                    ? (1 + (taxRates.material / 100))
                    : 1.0;

              // 資材・経費: priceは1個単価なのでそのまま掛ける
              // 食材: priceはパック価格なのでunit_quantityで割ってg単価にする
              updatedItem.cost = isMat
                ? roundToDecimals(usage * price * rate, 4)
                : roundToDecimals(usage * (price / qty) * rate, 4);
            }
          }
          return updatedItem;
        }
        return item;
      }),
    );
    setHasChanges(true);
  };

  const addItem = (type: string) => {
    if (!recipe) return;
    const newItem: RecipeItem = {
      id: `temp-${Date.now()}-${Math.random()}`,
      recipe_id: recipe.id,
      item_name: "",
      item_type: type,
      unit_quantity: 0,
      unit_price: 0,
      unit_weight: 0,
      usage_amount: 0,
      cost: 0,
      tax_included: true,
      expense_id: null,
    };
    setItems((prev) => [...prev, newItem]);
    setRegisteredItemOrder((prev) => ({ ...prev, [newItem.id]: Object.keys(prev).length }));
    setIsEditing(true);
    setHasChanges(true);
  };

  const deleteItem = (itemId: string) => {
    if (!itemId.startsWith("temp-")) {
      setDeletedItemIds((prev) => {
        const next = new Set(prev);
        next.add(itemId);
        return next;
      });
    }
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    setRegisteredItemOrder((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setHasChanges(true);
  };

  const handleItemSelect = (
    itemId: string,
    selected: ItemCandidate | string,
  ) => {
    setItems((prevItems) =>
      prevItems.map((item) => {
        if (item.id === itemId) {
          let updates: Partial<RecipeItem> = {};
          if (typeof selected === "string") {
            updates = {
              item_name: selected,
              ingredient_id: null,
              material_id: null,
              expense_id: null,
              intermediate_recipe_id: null,
            };
          } else {
            const isIntermediate = item.item_type === "intermediate" || item.item_type === "product";

            if (isIntermediate) {
              // 中間加工品/商品: 元レシピのtotal_weightをunit_weightに、total_costをunit_priceに自動設定
              updates = {
                item_name: selected.name,
                unit_price: selected.unit_price || 0,  // 元レシピのtotal_cost
                unit_weight: selected.unit_weight || 0, // 元レシピのtotal_weight
                unit_quantity: 1,
                usage_amount: 1, // デフォルト1個（倍率）
                cost: roundToDecimals(parseFloat(String(selected.unit_price)) || 0, 4), // 1個分の原価
                intermediate_recipe_id: selected.id,
                ingredient_id: null,
                material_id: null,
                expense_id: null,
                tax_included: true,
              };
            } else {
              updates = {
                item_name: selected.name,
                unit_price: selected.unit_price || 0,
                unit_weight: selected.unit_weight || 0,
                unit_quantity:
                  typeof selected.unit_quantity === "number"
                    ? selected.unit_quantity
                    : parseFloat(String(selected.unit_quantity)) || 0,
                tax_included: selected.tax_included !== false, // default true
              };
              if (item.item_type === "ingredient") {
                updates.ingredient_id = selected.id || null;
                updates.material_id = null;
                updates.expense_id = null;
                updates.intermediate_recipe_id = null;
              } else if (item.item_type === "material") {
                updates.material_id = selected.id || null;
                updates.ingredient_id = null;
                updates.expense_id = null;
                updates.intermediate_recipe_id = null;
              } else if (item.item_type === "expense") {
                updates.expense_id = selected.id || null;
                updates.ingredient_id = null;
                updates.material_id = null;
                updates.intermediate_recipe_id = null;
              }

              if (selected.name === "Amazon手数料" && recipe?.selling_price) {
                updates.cost = Math.round(taxIncludedFromExcluded(recipe.selling_price) * (taxRates.amazon_fee / 100));
                updates.usage_amount = 1;
                updates.unit_price = updates.cost;
              }
            }
          }
          const updatedItem = { ...item, ...updates };

          // 中間加工品/商品はすでに上で完全に設定済み
          const isIntermediate = updatedItem.item_type === "intermediate" || updatedItem.item_type === "product";
          if (!isIntermediate) {
            // 使用量が未設定(0)ならデフォルト1にする（資材・経費等で選択しただけで原価反映されるように）
            if (!updatedItem.usage_amount && updatedItem.unit_price) {
              updatedItem.usage_amount = 1;
            }

            // unit_quantityが未設定・文字列の場合もデフォルト1にする
            if (!updatedItem.unit_quantity || parseFloat(String(updatedItem.unit_quantity)) === 0) {
              updatedItem.unit_quantity = 1;
            }

            const hasUsageAmount =
              updatedItem.usage_amount !== null &&
              updatedItem.usage_amount !== undefined &&
              String(updatedItem.usage_amount).trim() !== "";
            const hasUnitPrice =
              updatedItem.unit_price !== null &&
              updatedItem.unit_price !== undefined &&
              String(updatedItem.unit_price).trim() !== "";

            if (hasUsageAmount && hasUnitPrice) {
              const usage = parseFloat(String(updatedItem.usage_amount)) || 0;
              const qty = parseFloat(String(updatedItem.unit_quantity)) || 1;
              const price = parseFloat(String(updatedItem.unit_price)) || 0;
              const isMat = updatedItem.item_type === "material" || updatedItem.item_type === "expense";

              const rate =
                updatedItem.item_type === "ingredient" &&
                  !updatedItem.tax_included
                  ? (1 + (taxRates.ingredient / 100))
                  : updatedItem.item_type === "material" &&
                    !updatedItem.tax_included
                    ? (1 + (taxRates.material / 100))
                    : 1.0;

              // 資材・経費: priceは1個単価なのでそのまま掛ける
              // 食材: priceはパック価格なのでunit_quantityで割ってg単価にする
              updatedItem.cost = isMat
                ? roundToDecimals(usage * price * rate, 4)
                : roundToDecimals(usage * (price / qty) * rate, 4);
            }
          }
          return updatedItem;
        }
        return item;
      }),
    );
    setHasChanges(true);
  };

  const handleRecipeChange = (field: keyof Recipe, value: any) => {
    if (!recipe) return;
    const updatedRecipe = { ...recipe, [field]: value };
    // category変更時はis_intermediateも連動
    if (field === "category") {
      updatedRecipe.is_intermediate = value === "中間部品";
      updatedRecipe.shelf_life = value === "自社" ? normalizeSelfShelfLife(recipe.shelf_life) : recipe.shelf_life;
    }
    setRecipe(updatedRecipe);
    setHasChanges(true);
  };

  // 中間部品を食材DBに挿入
  const handleInsertToIngredientDB = async () => {
    if (!recipe) return;
    if (recipe.category !== '中間部品') {
      toast.error('この機能は中間部品カテゴリのレシピのみ使用できます');
      return;
    }

    // 栄養成分計算（NutritionDisplayと同じロジック）
    const nutritionItems = items.filter(i =>
      i.item_type === 'ingredient' && i.usage_amount && parseFloat(String(i.usage_amount)) > 0
    );
    const totalWeight = items.reduce((sum, item) => {
      if (item.item_type === 'material' || item.item_type === 'expense') return sum;
      return sum + (parseFloat(String(item.usage_amount)) || 0);
    }, 0);
    const totalNutrition = nutritionItems.reduce((acc, item) => {
      const amount = parseFloat(String(item.usage_amount)) || 0;
      const nut = getItemNutrition(item);
      if (!nut) return acc;
      return {
        calories: acc.calories + (nut.calories || 0) * amount / 100,
        protein: acc.protein + (nut.protein || 0) * amount / 100,
        fat: acc.fat + (nut.fat || 0) * amount / 100,
        carbohydrate: acc.carbohydrate + (nut.carbohydrate || 0) * amount / 100,
        sodium: acc.sodium + (nut.sodium || 0) * amount / 100,
      };
    }, { calories: 0, protein: 0, fat: 0, carbohydrate: 0, sodium: 0 });

    // 100gあたりに変換
    const per100g = {
      calories: totalWeight ? totalNutrition.calories / totalWeight * 100 : 0,
      protein: totalWeight ? totalNutrition.protein / totalWeight * 100 : 0,
      fat: totalWeight ? totalNutrition.fat / totalWeight * 100 : 0,
      carbohydrate: totalWeight ? totalNutrition.carbohydrate / totalWeight * 100 : 0,
      sodium: totalWeight ? totalNutrition.sodium / totalWeight * 100 : 0,
    };

    const yieldRate = recipe.yield_rate ?? 1.0;
    const actualWeight = totalWeight * yieldRate;
    const totalCost = items.reduce((sum, i) => sum + (parseFloat(String(i.cost)) || 0), 0);
    const costExTax = Math.round(totalCost / taxRates.ingredient);

    const msg = `「${recipe.name}」を食材DBに挿入します。\n\n` +
      `入数（総量）: ${actualWeight.toFixed(1)}g\n` +
      `税込原価: ¥${totalCost.toLocaleString()}\n` +
      `税抜原価: ¥${costExTax.toLocaleString()}\n` +
      `熱量: ${per100g.calories.toFixed(1)} kcal/100g\n` +
      `タンパク: ${per100g.protein.toFixed(1)} g/100g\n` +
      `脂質: ${per100g.fat.toFixed(1)} g/100g\n` +
      `炭水化物: ${per100g.carbohydrate.toFixed(1)} g/100g\n` +
      `食塩: ${per100g.sodium.toFixed(1)} g/100g\n\n` +
      `よろしいですか？`;

    if (!confirm(msg)) return;

    try {
      const res = await fetch('/api/recipe/db-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'insert',
          table: 'ingredients',
          data: {
            name: recipe.name,
            unit_quantity: parseFloat(actualWeight.toFixed(1)),
            price: totalCost,
            calories: parseFloat(per100g.calories.toFixed(2)),
            protein: parseFloat(per100g.protein.toFixed(2)),
            fat: parseFloat(per100g.fat.toFixed(2)),
            carbohydrate: parseFloat(per100g.carbohydrate.toFixed(2)),
            sodium: parseFloat(per100g.sodium.toFixed(2)),
            tax_included: true,
            nutrition_per: '100g',
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '挿入に失敗しました');
      }
      toast.success(`「${recipe.name}」を食材DBに登録しました`);
      // マスターデータを再取得して即時反映
      fetchMasterData();
    } catch (error: any) {
      toast.error(error.message || '食材DB挿入に失敗しました');
    }
  };

  const saveChanges = async () => {
    if (!recipe || isSaving) return;

    if (previewingVersionId) {
      toast.error("過去版のプレビュー中は保存できません。「新レシピを作成」か「上書き保存」を選んでください。");
      return;
    }

    setIsSaving(true);

    try {
      const allItemsAreNew = items.every(i => i.id.startsWith('temp-'));
      let newItemsList: typeof items;
      let existingItemsList: typeof items;
      let finalDeletedIds: string[];
      let replaceAllItems = false;

      if (allItemsAreNew) {
        // 全新規状態ではDB上の現在明細をrecipe_id単位で全置換する。
        newItemsList = items;
        existingItemsList = [];
        finalDeletedIds = [];
        replaceAllItems = true;
      } else {
        newItemsList = items.filter((i) => i.id.startsWith('temp-'));
        existingItemsList = items.filter((i) => !i.id.startsWith('temp-'));
        finalDeletedIds = Array.from(deletedItemIds);
      }

      // Amazon手数料をitems内の expense から除外して計算
      const itemsWithoutAmazonFee = items.filter(
        (i) => !(i.item_type === "expense" && i.item_name === "Amazon手数料")
      );
      const baseCost = itemsWithoutAmazonFee.reduce(
        (sum, item) => sum + (parseFloat(String(item.cost)) || 0),
        0,
      );
      const savedAmazonFee = (recipe.amazon_fee_enabled && recipe.selling_price)
        ? Math.round(taxIncludedFromExcluded(recipe.selling_price) * (taxRates.amazon_fee / 100))
        : 0;
      const totalCost = baseCost + savedAmazonFee;

      const totalWeight = items.reduce((sum, item) => {
        if (["ingredient", "intermediate", "product"].includes(item.item_type)) {
          const usage = parseFloat(String(item.usage_amount)) || 0;
          if (item.item_type === "ingredient") {
            return sum + usage;
          } else {
            const unitWeight = item.unit_weight || 0;
            return sum + (usage * unitWeight);
          }
        }
        return sum;
      }, 0);

      const res = await fetch('/api/recipe/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipeId: recipe.id,
          replaceAllItems,
          deletedItemIds: finalDeletedIds,
          newItems: newItemsList,
          existingItems: existingItemsList,
          recipeUpdates: {
            name: recipe.name,
            category: recipe.category,
            is_intermediate: recipe.is_intermediate,
            selling_price: recipe.selling_price,
            total_cost: totalCost,
            total_weight: totalWeight,
            manufacturing_notes: recipe.manufacturing_notes,
            filling_quantity: recipe.filling_quantity,
            filling_quantity_unit: null,
            storage_method: recipe.storage_method,
            label_quantity: recipe.label_quantity,
            net_content_unit: null,
            sterilization_method: recipe.sterilization_method,
            sterilization_temperature: recipe.sterilization_temperature,
            sterilization_time: recipe.sterilization_time,
            development_date: recipe.development_date,
            amazon_fee_enabled: recipe.amazon_fee_enabled,
            yield_rate: recipe.yield_rate,
            jan_code: recipe.jan_code,
            lot_size: recipe.lot_size,
            case_quantity: recipe.case_quantity,
            case_size: recipe.case_size,
            shelf_life: recipe.category === "自社" ? normalizeSelfShelfLife(recipe.shelf_life) : recipe.shelf_life,
            series_code: recipe.series_code,
            series: recipe.series,
            product_code: recipe.product_code,
            web_description: recipe.web_description,
            product_points: recipe.product_points,
            ec_product_name: recipe.ec_product_name,
            catchcopy: recipe.catchcopy,
            product_lp_url: recipe.product_lp_url,
          },
        }),
      });
      const saveResult = await res.json();
      if (!res.ok) {
        throw new Error(saveResult.error || '保存に失敗しました');
      }

      setDeletedItemIds(new Set());
      setHasChanges(false);
      toast.success("保存しました");
      if (saveResult.tsgNotification?.failed > 0) {
        toast.warning('価格変更のTSG掲示板報告は再試行待ちです');
      }

      if (draftMode) {
        try {
          const sourceVersion = draftSourceVersionId
            ? versions.find(v => v.id === draftSourceVersionId)
            : null;
          const versionNote = draftVersionNote.trim()
            || (sourceVersion ? `v${sourceVersion.version_number}を元に修正` : null);
          const versionRes = await fetch('/api/recipe/versions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipeId: recipe.id,
              note: versionNote,
            }),
          });
          if (!versionRes.ok) throw new Error('バージョン保存に失敗しました');
          setDraftMode(false);
          setDraftVersionNote("");
          setDraftSourceVersionId(null);
          toast.success("修正版を正式版として保存しました");
        } catch (e: any) {
          toast.error(e.message || 'バージョン保存に失敗しました');
        }
      }

      fetchRecipe(recipe.id);
      fetchVersions(recipe.id);
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  const cancelChanges = () => {
    if (!recipe) return;
    if (hasChanges && !previewingVersionId && !confirm('変更を破棄しますか？')) return;
    setDeletedItemIds(new Set());
    setHasChanges(false);
    setPreviewingVersionId(null);
    setDraftMode(false);
    setDraftVersionNote("");
    setDraftSourceVersionId(null);
    setCurrentScalePercent(null);
    setOriginalUsageMap({});
    setIsEditing(true);
    fetchRecipe(recipe.id);
  };

  const formatNumber = (value?: number | null, decimals = 2, suffix = "") => {
    if (value === undefined || value === null) return "-";
    return `${value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;
  };

  const roundToDecimals = (value: number, decimals = 2) => {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  };

  const formatCurrency = (value?: number | null) => {
    if (value === undefined || value === null) return "-";
    return `¥${(Math.round(value * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Amazon手数料の計算（販売価格 × 手数料率%）
  const amazonFee = (recipe?.amazon_fee_enabled && recipe?.selling_price)
    ? Math.round(taxIncludedFromExcluded(recipe.selling_price) * (taxRates.amazon_fee / 100))
    : 0;

  const getTotals = () => {
    // items内の「Amazon手数料」という名前のexpenseを除外して計算
    const itemsWithoutAmazonFee = items.filter(
      (i) => !(i.item_type === "expense" && i.item_name === "Amazon手数料")
    );
    const costWithoutAmazon = itemsWithoutAmazonFee.reduce(
      (sum, item) => sum + (parseFloat(String(item.cost)) || 0),
      0,
    );
    const costExcludingExpenses = itemsWithoutAmazonFee.reduce(
      (sum, item) => {
        if (item.item_type === "expense") return sum;
        return sum + (parseFloat(String(item.cost)) || 0);
      },
      0,
    );
    return {
      usage: itemsWithoutAmazonFee.reduce(
        (sum, item) => sum + (parseFloat(String(item.usage_amount)) || 0),
        0,
      ),
      costWithoutAmazon,
      costExcludingExpenses,
      cost: costWithoutAmazon + amazonFee,
    };
  };

  const handlePrint = async () => {
    if (!recipe) return;
    // Supabase に印刷ログを書き込み（DocScannerがポーリングで取得）
    try {
      const previewVer = previewingVersionId ? versions.find(v => v.id === previewingVersionId) : null;
      await supabase.from('recipe_print_logs').insert({
        recipe_id: recipe.id,
        recipe_name: recipe.name,
        category: recipe.category,
        version_number: previewVer?.version_number ?? null,
        version_note: previewVer?.version_note ?? null,
        items: items.map(i => ({ item_name: i.item_name, item_type: i.item_type, usage_amount: i.usage_amount, cost: i.cost })),
        total_cost: items.reduce((s, i) => s + (parseFloat(String(i.cost)) || 0), 0),
        selling_price: recipe.selling_price,
        printed_at: new Date().toISOString(),
        processed: false,
      });
    } catch (e) {
      console.warn('印刷ログ書き込みスキップ:', e);
    }
    window.print();
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-screen text-gray-400">
        読み込み中...
      </div>
    );
  if (!recipe)
    return (
      <div className="flex justify-center items-center h-screen text-gray-400">
        レシピが見つかりません
      </div>
    );

  const totals = getTotals();
  const sellingPriceExTax = recipe.selling_price ? Number(recipe.selling_price) : 0;
  const sellingPriceInclTax = recipe.selling_price
    ? taxIncludedFromExcluded(recipe.selling_price)
    : 0;
  const profit = sellingPriceInclTax - totals.cost;
  const profitRate = sellingPriceInclTax ? (profit / sellingPriceInclTax) * 100 : 0;
  const grossProfitExcludingExpenses = sellingPriceInclTax - totals.costExcludingExpenses;
  const grossProfitExcludingExpensesRate = sellingPriceInclTax
    ? (grossProfitExcludingExpenses / sellingPriceInclTax) * 100
    : 0;
  const getRegisteredOrder = (item: RecipeItem, fallbackIndex: number) => (
    registeredItemOrder[item.id] ?? Number.MAX_SAFE_INTEGER - 100000 + fallbackIndex
  );
  const getIngredientWeight = (item: RecipeItem) => {
    const weight = parseFloat(String(item.usage_amount));
    return Number.isFinite(weight) ? weight : 0;
  };
  const ingredientItems = items.filter((i) => i.item_type === "ingredient");
  const sortedIngredientItems = ingredientItems
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (ingredientSortMode === "weight") {
        const weightDiff = getIngredientWeight(b.item) - getIngredientWeight(a.item);
        if (weightDiff !== 0) return weightDiff;
      }
      return getRegisteredOrder(a.item, a.index) - getRegisteredOrder(b.item, b.index);
    })
    .map(({ item }) => item);

  // Group items for display
  const groupedItems = [
    {
      title: "セット内容（商品）",
      type: "product",
      items: items.filter((i) => i.item_type === "product"),
      color: "bg-indigo-50 text-indigo-700 border-indigo-100",
      candidates: products,
    },
    {
      title: "原材料",
      type: "ingredient",
      items: sortedIngredientItems,
      color: "bg-green-50 text-green-700 border-green-100",
      candidates: ingredients,
    },
    {
      title: "中間加工品",
      type: "intermediate",
      items: items.filter((i) => i.item_type === "intermediate"),
      color: "bg-purple-50 text-purple-700 border-purple-100",
      candidates: intermediates,
    },
    {
      title: "資材・包材",
      type: "material",
      items: items.filter((i) => i.item_type === "material"),
      color: "bg-orange-50 text-orange-700 border-orange-100",
      candidates: materials,
    },
    {
      title: "諸経費",
      type: "expense",
      items: items.filter((i) => i.item_type === "expense"),
      color: "bg-red-50 text-red-700 border-red-100",
      candidates: expenses,
    },
  ];
  const fromTab = searchParams.get("fromTab");
  const recipeTabs = ["all", "ネット専用", "自社", "OEM", "中間部品", "試作", "終売"];
  const backTab = fromTab && recipeTabs.includes(fromTab)
    ? fromTab
    : recipe?.category && recipeTabs.includes(recipe.category)
      ? recipe.category
      : null;
  const backToListUrl = backTab ? `/recipe?tab=${encodeURIComponent(backTab)}` : "/recipe";
  const janDuplicateRecipeLines = janDuplicateInfo.names.map((name) => `他レシピ: ${name}`);
  const janDuplicateMasterLines = janDuplicateInfo.janMasterCount > 0
    ? janDuplicateInfo.janMasters.map((row) => {
      const name = row.product_name || "品名未設定";
      const category = row.category ? `（${row.category}）` : "";
      const memo = row.memo ? ` / ${row.memo}` : "";
      return `JAN管理: ${name}${category}${memo}`;
    })
    : [];
  const janDuplicateTooltipLines = [...janDuplicateRecipeLines, ...janDuplicateMasterLines];

  return (
    <div className="min-h-screen min-w-0 bg-white text-gray-800 font-sans print:p-0">
      {/* Control Bar */}
      <header className="relative z-10 flex flex-col gap-2 border-b bg-white/90 px-3 py-2 backdrop-blur lg:sticky lg:top-0 lg:z-20 lg:flex-row lg:items-center lg:justify-between lg:gap-0 lg:px-6 lg:py-3 print:hidden">
        <div className="flex w-full items-center gap-4 lg:w-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(backToListUrl)}
            className="text-gray-500 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            レシピ一覧
          </Button>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-nowrap lg:gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const p = new URLSearchParams();
              p.set('recipe_id', recipe.id);
              p.set('product_name', recipe.name);
              if (recipe.selling_price) {
                p.set('unit_price', String(yenFloor(recipe.selling_price)));
              }
              if (recipe.category) p.set('category', recipe.category);
              window.open(`http://192.168.110.200:3004/estimates/new?${p.toString()}`, '_blank');
            }}
            className="gap-2 border-cyan-600 text-cyan-700 hover:bg-cyan-50"
          >
            📄 見積書作成
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="gap-2"
          >
            <Printer className="w-4 h-4" />
            A4印刷
          </Button>
          {recipe.category === '中間部品' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleInsertToIngredientDB}
              className="gap-2 border-purple-400 text-purple-700 hover:bg-purple-50"
            >
              <Database className="w-4 h-4" />
              食材DBに挿入
            </Button>
          )}
          {hasChanges && (
            previewingVersionId ? (() => {
              const version = versions.find(v => v.id === previewingVersionId);
              if (!version) return null;
              return (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={clearVersionPreview}
                    disabled={isSaving}
                    className="gap-2 text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-4 h-4" />
                    現在へ戻る
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => startRevisionFromVersion(version)}
                    disabled={isSaving}
                    className="gap-2 h-auto py-1.5 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Edit className="w-4 h-4" />
                    <span className="flex flex-col items-start leading-tight">
                      <span>新レシピを作成</span>
                      <span className="text-[10px] font-normal opacity-85">この版を元に新履歴</span>
                    </span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => restoreVersion(version)}
                    disabled={isSaving}
                    className="gap-2 h-auto py-1.5 border-red-300 text-red-700 hover:bg-red-50"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span className="flex flex-col items-start leading-tight">
                      <span>上書き保存</span>
                      <span className="text-[10px] font-normal">現在レシピを置換</span>
                    </span>
                  </Button>
                </>
              );
            })() : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={cancelChanges}
                  disabled={isSaving}
                  className="gap-2 text-gray-500 hover:text-gray-700"
                >
                  <X className="w-4 h-4" />
                  キャンセル
                </Button>
                <Button
                  size="sm"
                  onClick={saveChanges}
                  disabled={isSaving}
                  className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {isSaving
                    ? '保存中...'
                    : draftMode
                      ? '新しい履歴として保存'
                      : '保存'}
                </Button>
              </>
            )
          )}
        </div>
      </header>
      {/* Main Content - Screen Only */}
      <main className="mx-auto max-w-[1400px] min-w-0 px-3 py-4 sm:px-4 lg:p-8 print:hidden">
        {/* Header Section */}
        {/* Header Section (Recipe Name & Pricing Card) */}
        <div className="border-b-2 border-gray-800 pb-4 mb-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-0">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap gap-2">
                <Select
                  value={recipe.category}
                  onValueChange={(val) => handleRecipeChange("category", val)}
                >
                  <SelectTrigger
                    className={`h-6 px-2 py-0 border rounded uppercase tracking-wider text-[10px] font-bold w-auto inline-flex items-center gap-1 ${CATEGORIES.find((c) => c.value === recipe.category)
                      ?.color || "border-gray-200 text-gray-500"
                      }`}
                  >
                    <SelectValue>{recipe.category}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        <span className={`px-2 py-0.5 rounded ${cat.color}`}>
                          {cat.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {recipe.is_intermediate && (
                  <span className="px-2 py-0.5 text-[10px] font-bold border border-purple-300 text-purple-700 rounded uppercase tracking-wider">
                    Middle
                  </span>
                )}
                <span className="text-gray-300 mx-1">|</span>
                <Select
                  value={recipe.series_code != null ? String(recipe.series_code) : "__none__"}
                  onValueChange={async (val) => {
                    const seriesCode = val === "__none__" ? null : Number(val);
                    const seriesName = val === "__none__" ? null : (seriesList.find(s => s.code === Number(val))?.name || null);
                    setRecipe(prev => prev ? { ...prev, series_code: seriesCode, series: seriesName } : null);
                    try {
                      const res = await fetch('/api/recipe/update', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ recipeId: recipe.id, updates: { series_code: seriesCode, series: seriesName } }),
                      });
                      if (!res.ok) throw new Error('更新に失敗しました');
                      toast.success("シリーズを更新しました", { duration: 1000 });
                    } catch {
                      toast.error("シリーズの更新に失敗しました");
                    }
                  }}
                >
                  <SelectTrigger className="h-6 px-2 py-0 border rounded text-[10px] font-bold w-auto inline-flex items-center gap-1 border-gray-200 text-gray-600 hover:border-gray-400">
                    <SelectValue>{recipe.series ? `${recipe.series_code}. ${recipe.series}` : 'シリーズ'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— 未設定</SelectItem>
                    {seriesList.map(s => (
                      <SelectItem key={s.code} value={String(s.code)}>
                        {s.code}. {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-0.5">
                  <span className="text-[10px] font-bold text-gray-400">#</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    defaultValue={recipe.product_code ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, '');
                      const newVal = v ? Number(v) : null;
                      if (newVal !== recipe.product_code) {
                        handleRecipeChange("product_code", newVal);
                      }
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    placeholder="—"
                    className="w-8 h-6 text-[10px] font-bold text-gray-600 bg-transparent border border-gray-200 rounded px-1 text-center hover:border-gray-400 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
              <InlineEdit
                value={recipe.name}
                onSave={(val) => handleRecipeChange("name", val)}
                className="w-full rounded px-1 -ml-1 text-2xl font-extrabold leading-tight text-gray-900 transition-colors hover:bg-gray-50 lg:text-3xl"
                inputClassName="text-2xl font-extrabold text-gray-900 leading-tight lg:text-3xl"
              />
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-mono text-gray-500">
                <span>ID: {recipe.id.split("-")[0]}</span>
                <span className="flex items-center gap-1">
                  DEV:
                  <input
                    type="date"
                    defaultValue={recipe.development_date || ''}
                    onBlur={(e) => {
                      const val = e.target.value || null;
                      if (val !== recipe.development_date) {
                        handleRecipeChange("development_date", val);
                      }
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="bg-transparent border-b border-dashed border-gray-300 hover:border-gray-500 focus:border-blue-500 outline-none text-xs font-mono text-gray-500 w-[110px] px-0.5"
                  />
                </span>
                <span>UPD: {new Date().toLocaleDateString()}</span>
              </div>
            </div>
            {/* 商品写真（インライン） */}
            <div className="w-[120px] flex-shrink-0 self-start lg:ml-4">
              <div className="border border-gray-200 rounded-lg bg-gray-50/50 overflow-hidden">
                {recipe.product_image_url ? (
                  <div className="relative group">
                    <img
                      src={recipe.product_image_url}
                      alt={recipe.name}
                      className="w-full h-[100px] object-contain bg-white"
                    />
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/recipe/photo/mobile?id=${recipe.id}`;
                        navigator.clipboard.writeText(url).then(() => {
                          toast.success("📱 スマホ用URLをコピーしました");
                        }).catch(() => {
                          window.open(`/recipe/photo/mobile?id=${recipe.id}`, "_blank");
                        });
                      }}
                      className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100"
                      title="写真を変更"
                    >
                      <Camera className="w-5 h-5 text-white" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/recipe/photo/mobile?id=${recipe.id}`;
                      navigator.clipboard.writeText(url).then(() => {
                        toast.success("📱 スマホ用URLをコピーしました");
                      }).catch(() => {
                        window.open(`/recipe/photo/mobile?id=${recipe.id}`, "_blank");
                      });
                    }}
                    className="w-full h-[100px] flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                    title="📱スマホで写真を撮影"
                  >
                    <Camera className="w-5 h-5" />
                    <span className="text-[10px] font-medium">📱写真登録</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="mb-6 grid grid-cols-1 items-start gap-5 lg:mb-8 lg:grid-cols-2 lg:gap-8">
          {/* Specs Grid (Left) */}
          <div className="space-y-6">
            {/* Product Specs */}
            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1 mb-3">
                製品仕様
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <div className="p-3 bg-gray-50 rounded border border-gray-100">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      充填量
                    </div>
                  </div>
                  <div className="font-bold text-xl flex items-center gap-2">
                    <InlineEdit
                      type="text"
                      value={recipe.filling_quantity}
                      onSave={(val) =>
                        handleRecipeChange("filling_quantity", val)
                      }
                      className="font-bold text-xl w-full"
                      inputClassName="font-bold text-xl w-full"
                      placeholder="-"
                    />
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded border border-gray-100">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      内容量（表記量）
                    </div>
                  </div>
                  <div className="font-bold text-xl flex items-center gap-2">
                    <InlineEdit
                      type="text"
                      value={recipe.label_quantity}
                      onSave={(val) =>
                        handleRecipeChange("label_quantity", String(val))
                      }
                      className="font-bold text-xl w-full"
                      inputClassName="font-bold text-xl w-full"
                      placeholder="-"
                    />
                  </div>
                </div>
                {recipe.is_intermediate && (
                  <div className="rounded border border-purple-200 bg-purple-50 p-3 sm:col-span-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs font-bold text-purple-600 uppercase tracking-wider">
                        歩留まり（出来高率）
                      </div>
                      <div className="text-[10px] text-purple-400">
                        材料重量に対する実際の出来高比率
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <InlineEdit
                          type="number"
                          value={recipe.yield_rate != null ? Math.round(recipe.yield_rate * 1000) / 10 : 100}
                          onSave={(val) => {
                            const pct = typeof val === "string" ? parseFloat(val) : (val as number);
                            if (!isNaN(pct) && pct > 0 && pct <= 100) {
                              handleRecipeChange("yield_rate", Math.round((pct / 100) * 10000) / 10000);
                            }
                          }}
                          className="font-bold text-xl min-w-[3rem] text-purple-800 justify-end text-right"
                          inputClassName="text-right font-bold text-xl w-20"
                          placeholder="100"
                          suffix="%"
                        />
                      </div>
                      {recipe.yield_rate != null && recipe.yield_rate < 1 && recipe.total_weight != null && (
                        <div className="text-sm text-purple-600 bg-purple-100 px-3 py-1 rounded-full">
                          出来高: <span className="font-bold">{formatNumber(recipe.total_weight * recipe.yield_rate, 1)}g</span>
                          <span className="text-purple-400 ml-1">/ {formatNumber(recipe.total_weight, 1)}g</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div className="rounded border border-gray-100 bg-gray-50 p-3 sm:col-span-2">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                    保存方法
                  </div>
                  <Select
                    value={recipe.storage_method || ""}
                    onValueChange={(val) =>
                      handleRecipeChange("storage_method", val)
                    }
                  >
                    <SelectTrigger className="h-7 border-none bg-transparent p-0 focus:ring-0 shadow-none font-bold text-xl">
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="常温">常温</SelectItem>
                      <SelectItem value="冷蔵">冷蔵</SelectItem>
                      <SelectItem value="冷凍">冷凍</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {/* JANコード・賞味期限 */}
                <div className="p-2 bg-gray-50 rounded border border-gray-100 min-h-[52px] flex flex-col">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      JANコード
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const encodedName = encodeURIComponent(recipe.name);
                        router.push(`/recipe/jan-codes?from_recipe=${recipe.id}&product_name=${encodedName}`);
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
                    >
                      {recipe.jan_code ? 'JAN再発行' : 'JAN新規発行'}
                    </button>
                  </div>
                  <div className="flex-1 flex items-center">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <InlineEdit
                        value={recipe.jan_code ?? null}
                        onSave={(val) => handleRecipeChange("jan_code", val || null)}
                        className="font-semibold text-sm font-mono"
                        inputClassName="font-semibold text-sm font-mono w-full"
                        placeholder="-"
                      />
                      {(janDuplicateInfo.recipeCount > 0 || janDuplicateInfo.janMasterCount > 0) && (
                        <span
                          className="group relative inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700"
                          title={janDuplicateTooltipLines.join("\n")}
                        >
                          <AlertTriangle className="h-3 w-3" />
                          重複あり
                          <span className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-[min(20rem,calc(100vw-3rem))] rounded-md border border-red-200 bg-white p-2 text-left text-[11px] font-normal leading-relaxed text-gray-700 shadow-lg group-hover:block">
                            <span className="mb-1 block font-bold text-red-700">同じJANコードがあります</span>
                            {janDuplicateTooltipLines.length > 0 ? (
                              janDuplicateTooltipLines.map((line, index) => (
                                <span key={`${line}-${index}`} className="block break-words">
                                  {line}
                                </span>
                              ))
                            ) : (
                              <span className="block">詳細を取得できませんでした</span>
                            )}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="p-2 bg-gray-50 rounded border border-gray-100 min-h-[52px] flex flex-col">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                    賞味期限
                  </div>
                  <div className="flex-1 flex items-center">
                    {recipe.category === "自社" ? (
                      <select
                        aria-label="賞味期限"
                        value={normalizeSelfShelfLife(recipe.shelf_life) || "__unset__"}
                        onChange={(event) => {
                          handleRecipeChange(
                            "shelf_life",
                            event.target.value === "__unset__" ? null : event.target.value
                          );
                        }}
                        className="h-7 w-full border-none bg-transparent p-0 text-sm font-semibold text-gray-800 outline-none focus:ring-0"
                      >
                        <option value="__unset__" disabled>
                          選択してください
                        </option>
                        {SELF_SHELF_LIFE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <InlineEdit
                        value={recipe.shelf_life ?? null}
                        onSave={(val) => handleRecipeChange("shelf_life", val || null)}
                        className="font-semibold text-sm"
                        inputClassName="font-semibold text-sm w-full"
                        placeholder="-"
                      />
                    )}
                  </div>
                </div>
                {/* 製造ロット数・ケース入数 */}
                <div className="p-2 bg-gray-50 rounded border border-gray-100 min-h-[52px] flex flex-col">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                    製造ロット数
                  </div>
                  <div className="flex-1 flex items-center">
                    <InlineEdit
                      type="number"
                      value={recipe.lot_size ?? null}
                      onSave={(val) => handleRecipeChange("lot_size", val)}
                      className="font-semibold text-sm"
                      inputClassName="text-right font-semibold text-sm w-16"
                      placeholder="-"
                      suffix="個"
                    />
                  </div>
                </div>
                <div className="p-2 bg-gray-50 rounded border border-gray-100 min-h-[52px] flex flex-col">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                    ケース入数
                  </div>
                  <div className="flex-1 flex items-center">
                    <InlineEdit
                      type="number"
                      value={recipe.case_quantity ?? null}
                      onSave={(val) => handleRecipeChange("case_quantity", val)}
                      className="font-semibold text-sm"
                      inputClassName="text-right font-semibold text-sm w-16"
                      placeholder="-"
                      suffix="個/ケース"
                    />
                  </div>
                </div>
                {/* ケースサイズ */}
                <div className="flex min-h-[52px] flex-col rounded border border-gray-100 bg-gray-50 p-2 sm:col-span-2">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                    ケースサイズ
                  </div>
                  <div className="flex-1 flex items-center">
                    <InlineEdit
                      value={recipe.case_size ?? null}
                      onSave={(val) => handleRecipeChange("case_size", val || null)}
                      className="font-semibold text-sm"
                      inputClassName="font-semibold text-sm w-full"
                      placeholder="-"
                    />
                  </div>
                </div>
              </div>
            </div>
            {/* Manufacturing Specs */}
            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1 mb-3">
                製造条件
              </h3>
              <div className="bg-gray-50 p-3 rounded border border-gray-100">
                <div className="mb-3">
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                    殺菌・加熱工程
                  </div>
                  <Select
                    value={recipe.sterilization_method || ""}
                    onValueChange={(val) =>
                      handleRecipeChange("sterilization_method", val)
                    }
                  >
                    <SelectTrigger className="h-7 border-none bg-transparent p-0 focus:ring-0 shadow-none font-bold text-lg">
                      <SelectValue placeholder="選択してください" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="レトルト">レトルト</SelectItem>
                      <SelectItem value="乾燥機">乾燥機</SelectItem>
                      <SelectItem value="ホット充填">ホット充填</SelectItem>
                      <SelectItem value="殺菌なし">殺菌なし</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(recipe.sterilization_method === "レトルト" ||
                  recipe.sterilization_method === "乾燥機") && (
                    <div className="flex gap-4 border-t pt-2 border-gray-200">
                      <div className="w-1/2">
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                          温度
                        </div>
                        <div className="flex items-center">
                          <InlineEdit
                            value={recipe.sterilization_temperature}
                            onSave={(val) =>
                              handleRecipeChange("sterilization_temperature", val)
                            }
                            className="font-bold text-lg min-w-[3rem]"
                            inputClassName="font-bold text-lg w-20"
                            placeholder="120"
                            type="number"
                          />
                          <span className="text-sm text-gray-500 ml-1">℃</span>
                        </div>
                      </div>
                      <div className="w-1/2">
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                          時間
                        </div>
                        <div className="flex items-center">
                          <InlineEdit
                            value={recipe.sterilization_time}
                            onSave={(val) =>
                              handleRecipeChange("sterilization_time", val)
                            }
                            className="font-bold text-lg min-w-[3rem]"
                            inputClassName="font-bold text-lg w-20"
                            placeholder="30"
                            type="number"
                          />
                          <span className="text-sm text-gray-500 ml-1">分</span>
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            </div>
          </div>
          {/* Right Column: Pricing & Simulation */}
          <div>
            {recipe.is_intermediate ? (
              /* 中間部品用: 原価合計のみ表示 */
              <div className="mb-6 rounded-xl bg-purple-900 p-4 text-white shadow-lg lg:p-6">
                <div className="text-xs font-bold text-purple-300 uppercase tracking-wider mb-4">
                  中間加工品 原価情報
                </div>
                <div className="mb-4">
                  <div className="text-[10px] text-purple-400 uppercase font-bold tracking-wider mb-1">
                    原価合計 (Total Cost)
                  </div>
                  <div className="text-4xl font-bold tracking-tight">
                    {formatCurrency(totals.cost)}
                  </div>
                </div>
                {recipe.total_weight != null && recipe.total_weight > 0 && (
                  <div className="pt-3 border-t border-purple-800 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-purple-300">材料総重量</span>
                      <span className="font-mono font-bold">{formatNumber(recipe.total_weight, 1)}g</span>
                    </div>
                    {recipe.yield_rate != null && recipe.yield_rate < 1 && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-purple-300">出来高 ({Math.round(recipe.yield_rate * 1000) / 10}%)</span>
                          <span className="font-mono font-bold">{formatNumber(recipe.total_weight * recipe.yield_rate, 1)}g</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-purple-300">g単価 (歩留まり込)</span>
                          <span className="font-mono font-bold">
                            ¥{(totals.cost / (recipe.total_weight * recipe.yield_rate)).toFixed(2)}/g
                          </span>
                        </div>
                      </>
                    )}
                    {(!recipe.yield_rate || recipe.yield_rate >= 1) && (
                      <div className="flex justify-between text-sm">
                        <span className="text-purple-300">g単価</span>
                        <span className="font-mono font-bold">
                          ¥{(totals.cost / recipe.total_weight).toFixed(2)}/g
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Pricing Header Card */}
                <div className="mb-6 rounded-xl bg-gray-900 p-4 text-white shadow-lg lg:p-6">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                      販売価格 (Selling Price)
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <label className="flex cursor-pointer items-center gap-1.5 rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 print:hidden">
                        <input
                          type="checkbox"
                          checked={sellingPriceTaxIncludedPriority}
                          onChange={(event) => setSellingPriceTaxIncludedPriority(event.target.checked)}
                          className="h-3.5 w-3.5 accent-cyan-500"
                          aria-label="税込価格を優先して税抜価格を逆算"
                        />
                        <span className="font-bold">税込優先</span>
                      </label>
                      <div className="flex items-center gap-1 rounded bg-gray-800 px-2 py-1 text-xs text-gray-300">
                        <span className="text-gray-400">
                          {sellingPriceTaxIncludedPriority ? "税抜換算:" : "税込参考:"}
                        </span>
                        <span className="font-bold">¥</span>
                        <span className="min-w-[30px] text-right font-bold">
                          {sellingPriceTaxIncludedPriority
                            ? sellingPriceExTax.toLocaleString("ja-JP", { maximumFractionDigits: 4 })
                            : sellingPriceInclTax.toLocaleString()}
                        </span>
                      </div>
                      {!previewingVersionId && !draftMode && (
                        <div
                          className="flex items-center gap-1 rounded border border-gray-700 bg-gray-950/60 px-2 py-1 text-xs text-gray-300"
                          title={previousSellingPrice?.changedAt
                            ? `前回変更: ${new Date(previousSellingPrice.changedAt).toLocaleString("ja-JP")}`
                            : "価格変更履歴はまだありません"}
                        >
                          <span className="text-gray-500">前回変更前価格:</span>
                          {previousSellingPrice ? (
                            <>
                              <span className="font-bold">¥</span>
                              <span className="font-bold">
                                {(sellingPriceTaxIncludedPriority
                                  ? previousSellingPrice.previousPriceInclTax
                                  : previousSellingPrice.previousPriceExTax
                                ).toLocaleString("ja-JP", { maximumFractionDigits: 4 })}
                              </span>
                              <span className="text-[10px] text-gray-500">
                                {sellingPriceTaxIncludedPriority ? "税込" : "税抜"}
                              </span>
                            </>
                          ) : (
                            <span className="font-medium text-gray-500">記録なし</span>
                          )}
                        </div>
                      )}
                      {!previewingVersionId && !draftMode && (
                        <button
                          type="button"
                          onClick={() => setPriceHistoryExpanded((current) => !current)}
                          disabled={sellingPriceHistory.length === 0}
                          aria-expanded={priceHistoryExpanded}
                          className="flex items-center gap-1 rounded border border-gray-700 bg-gray-950/60 px-2 py-1 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:text-gray-600"
                          title={sellingPriceHistory.length > 0
                            ? `価格変更履歴を${priceHistoryExpanded ? "閉じる" : "表示"}`
                            : "価格変更履歴はまだありません"}
                        >
                          <History className="h-3.5 w-3.5" />
                          価格変更履歴
                          <span className="text-[10px] text-gray-500">{sellingPriceHistory.length}件</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-baseline justify-end mb-4">
                    <span
                      className="text-xs font-bold text-gray-500 mr-1"
                      style={{ alignSelf: "flex-end", marginBottom: "8px" }}
                    >
                      {sellingPriceTaxIncludedPriority ? "税込" : "税抜"}
                    </span>
                    <span
                      className="font-medium text-gray-400 mr-1"
                      style={{
                        fontSize: "24px",
                        alignSelf: "flex-end",
                        marginBottom: "4px",
                      }}
                    >
                      ¥
                    </span>
                    <InlineEdit
                      key={sellingPriceTaxIncludedPriority ? "selling-price-included" : "selling-price-excluded"}
                      type="number"
                      value={sellingPriceTaxIncludedPriority ? sellingPriceInclTax : sellingPriceExTax}
                      onSave={(val) => {
                        const enteredPrice = typeof val === "string" ? parseFloat(val) : val;
                        const nextSellingPrice = sellingPriceTaxIncludedPriority
                          ? taxExcludedForExactIncluded(enteredPrice)
                          : yenFloor(enteredPrice);
                        handleRecipeChange(
                          "selling_price",
                          isNaN(nextSellingPrice) ? 0 : nextSellingPrice,
                        );
                      }}
                      style={{
                        fontSize: "48px",
                        lineHeight: "1.1",
                        height: "56px",
                      }}
                      className="font-bold tracking-tight text-white text-right w-full max-w-[220px] justify-end"
                      inputClassName="bg-gray-800 text-white border-none text-right px-2"
                      placeholder="0"
                    />
                  </div>
                  {priceHistoryExpanded && sellingPriceHistory.length > 0 && !previewingVersionId && !draftMode && (
                    <div className="mb-3 border-t border-gray-800 pt-3 print:hidden">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-300">
                          <History className="h-3.5 w-3.5" />
                          価格変更履歴
                        </div>
                        <span className="text-[10px] text-gray-500">新しい順・最大50件</span>
                      </div>
                      <div className="max-h-56 overflow-y-auto border-y border-gray-800">
                        {sellingPriceHistory.map((revision) => (
                          <div
                            key={revision.id}
                            className="grid gap-1 border-b border-gray-800 px-1 py-2 text-xs last:border-b-0 sm:grid-cols-[10rem_1fr] sm:items-center"
                          >
                            <time className="text-[11px] text-gray-500" dateTime={revision.changedAt}>
                              {new Date(revision.changedAt).toLocaleString("ja-JP", {
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:justify-end">
                              <span className="text-gray-500">税込</span>
                              <span className="font-bold text-gray-300">¥{revision.previousPriceInclTax.toLocaleString("ja-JP")}</span>
                              <span className="text-gray-600">→</span>
                              <span className="font-bold text-white">¥{revision.newPriceInclTax.toLocaleString("ja-JP")}</span>
                              <span className="ml-1 text-[10px] text-gray-500">
                                税抜 ¥{revision.previousPriceExTax.toLocaleString("ja-JP", { maximumFractionDigits: 4 })}
                                {' → '}
                                ¥{revision.newPriceExTax.toLocaleString("ja-JP", { maximumFractionDigits: 4 })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Amazon手数料 チェックボックス */}
                  <div className="pt-3 pb-1 border-t border-gray-800">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={recipe.amazon_fee_enabled || false}
                          onChange={(e) => handleRecipeChange("amazon_fee_enabled", e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-5 bg-gray-700 rounded-full peer-checked:bg-orange-500 transition-colors" />
                        <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-gray-400 rounded-full transition-transform peer-checked:translate-x-5 peer-checked:bg-white" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-300 group-hover:text-white transition-colors">
                          Amazon手数料
                        </span>
                        <span className="text-xs bg-gray-800 text-orange-400 px-2 py-0.5 rounded font-mono">
                          {taxRates.amazon_fee}%
                        </span>
                      </div>
                      {recipe.amazon_fee_enabled && recipe.selling_price ? (
                        <span className="ml-auto text-sm font-bold text-orange-400">
                          {formatCurrency(amazonFee)}
                        </span>
                      ) : null}
                    </label>
                  </div>
                  {/* 原価内訳 */}
                  {recipe.amazon_fee_enabled && amazonFee > 0 && (
                    <div className="pb-2 text-xs text-gray-500 space-y-1">
                      <div className="flex justify-between">
                        <span>材料・資材・経費</span>
                        <span className="font-mono">{formatCurrency(totals.costWithoutAmazon)}</span>
                      </div>
                      <div className="flex justify-between text-orange-400">
                        <span>Amazon手数料 ({taxRates.amazon_fee}%)</span>
                        <span className="font-mono">{formatCurrency(amazonFee)}</span>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-gray-800">
                    <div className="min-w-0">
                      <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">
                        原価合計 (Total Cost)
                      </div>
                      <div className="text-xl font-bold flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        {formatCurrency(totals.cost)}
                        <span className="text-xs font-normal text-gray-500">
                          (
                          {sellingPriceInclTax && totals.cost
                            ? ((totals.cost / sellingPriceInclTax) * 100).toFixed(1)
                            : "-"}
                          %)
                        </span>
                      </div>
                    </div>
                    <div className="min-w-0 sm:text-center">
                      <div className="text-[10px] text-cyan-200/80 font-bold tracking-normal mb-1 leading-tight">
                        粗利（人件費・諸経費除く）
                      </div>
                      <div
                        className={`text-xl font-bold flex flex-wrap items-baseline gap-x-2 gap-y-1 sm:justify-center ${grossProfitExcludingExpenses >= 0 ? "text-cyan-300" : "text-red-400"
                          }`}
                      >
                        {formatCurrency(grossProfitExcludingExpenses)}
                        <span className="text-xs font-normal text-gray-500">
                          ({recipe.selling_price ? grossProfitExcludingExpensesRate.toFixed(1) : "-"}%)
                        </span>
                      </div>
                    </div>
                    <div className="min-w-0 sm:text-right">
                      <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">
                        粗利益 (Profit)
                      </div>
                      <div
                        className={`text-xl font-bold flex flex-wrap items-baseline gap-x-2 gap-y-1 sm:justify-end ${profit > 0 ? "text-green-400" : "text-red-400"
                          }`}
                      >
                        {formatCurrency(profit)}
                        <span className="text-xs font-normal text-gray-500">
                          ({recipe.selling_price ? profitRate.toFixed(1) : "-"}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <EcPriceSyncControls
                  recipeId={recipe.id}
                  recipeName={recipe.name}
                  ecProductName={recipe.ec_product_name ?? null}
                  productLpUrl={recipe.product_lp_url}
                  sellingPriceInclTax={sellingPriceInclTax}
                  expectedRecipeSnapshot={{
                    id: recipe.id,
                    name: recipe.name,
                    ec_product_name: recipe.ec_product_name,
                    linked_product_id: recipe.linked_product_id,
                    jan_code: recipe.jan_code,
                    series_code: recipe.series_code,
                    product_code: recipe.product_code,
                    filling_quantity: recipe.filling_quantity,
                    filling_quantity_unit: recipe.filling_quantity_unit,
                    storage_method: recipe.storage_method,
                    product_lp_url: recipe.product_lp_url,
                    selling_price: recipe.selling_price,
                  }}
                  hasUnsavedChanges={hasChanges}
                  isSaving={isSaving}
                />
                {/* Wholesale Simulation */}
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">
                    卸価格シミュレーション
                  </h3>
                  <div className="space-y-3">
                    {[0.65, 0.7].map((rate) => {
                      const wholesalePrice = recipe.selling_price
                        ? wholesalePriceFromTaxExcludedRetail(recipe.selling_price, rate)
                        : 0;
                      const wholesaleProfit = wholesalePrice - totals.cost;
                      const wholesaleMargin = wholesalePrice
                        ? (wholesaleProfit / wholesalePrice) * 100
                        : 0;

                      return (
                        <div
                          key={rate}
                          className="flex flex-col items-start gap-2 rounded-lg border border-gray-100 bg-white p-3 transition-colors hover:border-gray-300 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                        >
                          <div className="flex items-center gap-3">
                            <div className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded">
                              {Math.round(rate * 100)}%
                            </div>
                            <div className="text-sm font-medium text-gray-900">
                              卸値: {formatCurrency(wholesalePrice)}
                            </div>
                          </div>
                          <div
                            className={`text-sm font-bold ${wholesaleProfit > 0 ? "text-gray-700" : "text-red-600"
                              }`}
                          >
                            利益: {formatCurrency(wholesaleProfit)}
                            <span className="text-xs font-normal text-gray-400 ml-1">
                              ({wholesaleMargin.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
            {/* 原材料名 */}
            <div className="mb-8">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b pb-1 mb-3">
                原材料名
              </h3>
              <div className="border border-gray-200 rounded-lg bg-white shadow-sm">
                {/* ヘッダー */}
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 bg-gray-50 rounded-t-lg">
                  <div className="flex items-center gap-1.5">
                    <FlaskConical className="w-3 h-3 text-emerald-600" />
                    <span className="text-sm font-bold text-gray-700">原材料名</span>
                  </div>
                </div>
                {/* タブ切替 */}
                <div className="flex border-b border-gray-200">
                  <button
                    onClick={() => setLabelTab('manual')}
                    className={`flex-1 text-xs font-semibold py-2.5 text-center transition-colors ${
                      labelTab === 'manual'
                        ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/50'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    📝 手動入力
                    {labelText && <span className="ml-1 text-[10px] bg-blue-100 text-blue-600 px-1 rounded-full">✓</span>}
                  </button>
                  <button
                    onClick={() => setLabelTab('ai')}
                    className={`flex-1 text-xs font-semibold py-2.5 text-center transition-colors ${
                      labelTab === 'ai'
                        ? 'text-emerald-700 border-b-2 border-emerald-600 bg-emerald-50/50'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    🤖 AI生成
                    {aiLabelText && <span className="ml-1 text-[10px] bg-emerald-100 text-emerald-600 px-1 rounded-full">✓</span>}
                  </button>
                </div>
                {/* コンテンツ */}
                <div className="px-4 py-3">
                  {labelTab === 'manual' ? (
                    /* ===== 手動入力タブ ===== */
                    <>
                      <div className="flex items-center justify-end gap-1 mb-1.5">
                        {!labelEditing && labelText && (
                          <>
                            <button
                              onClick={async () => {
                                if (!confirm('手動原材料を削除してもよろしいですか？')) return;
                                if (!recipe) return;
                                try {
                                  const res = await fetch('/api/recipe/update', {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ recipeId: recipe.id, updates: { ingredient_label: null } }),
                                  });
                                  if (!res.ok) throw new Error('削除に失敗しました');
                                  toast.success('削除しました');
                                  setRecipe(prev => prev ? { ...prev, ingredient_label: null } : prev);
                                  setLabelText("");
                                } catch { toast.error('削除に失敗しました'); }
                              }}
                              className="text-xs text-red-500 hover:text-red-700 px-1 py-0.5 rounded hover:bg-red-50"
                              title="削除"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setLabelEditing(true)}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium px-1.5 py-0.5 rounded hover:bg-blue-50"
                            >
                              ✎ 編集
                            </button>
                            <button
                              onClick={() => { navigator.clipboard.writeText(labelText); toast.success('コピーしました'); }}
                              className="text-xs text-gray-500 hover:text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-100"
                              title="クリップボードにコピー"
                            >
                              📋 コピー
                            </button>
                          </>
                        )}
                        {!labelEditing && !labelText && (
                          <button
                            onClick={() => setLabelEditing(true)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium px-1.5 py-0.5 rounded hover:bg-blue-50"
                          >
                            ✎ 入力
                          </button>
                        )}
                      </div>
                      {labelEditing ? (
                        <div className="space-y-1.5">
                          <textarea
                            value={labelText}
                            onChange={(e) => setLabelText(e.target.value)}
                            rows={8}
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y font-mono leading-relaxed"
                            placeholder="原材料を入力またはペースト..."
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => { setLabelEditing(false); setLabelText(recipe?.ingredient_label || ""); }}
                              className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded hover:bg-gray-200"
                            >
                              キャンセル
                            </button>
                            <button
                              onClick={async () => {
                                if (!recipe) return;
                                const res = await fetch('/api/recipe/update', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ recipeId: recipe.id, updates: { ingredient_label: labelText || null } }),
                                });
                                if (!res.ok) { toast.error('保存に失敗しました'); }
                                else { toast.success('保存しました'); setRecipe(prev => prev ? { ...prev, ingredient_label: labelText || null } : prev); setLabelEditing(false); }
                              }}
                              className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 flex items-center gap-1"
                            >
                              <Save className="w-3 h-3" />保存
                            </button>
                          </div>
                        </div>
                      ) : labelText ? (
                        <div className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-2 border border-gray-100">
                          {labelText}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400 text-center py-4 bg-gray-50 rounded border border-dashed border-gray-200">
                          手動入力またはラベルインポートで登録
                        </div>
                      )}
                    </>
                  ) : (
                    /* ===== AIタブ ===== */
                    <>
                      <div className="flex items-center justify-end gap-1 mb-1.5">
                        {aiLabelText && (
                          <>
                            <button
                              onClick={async () => {
                                if (!confirm('AI生成ラベルを削除してもよろしいですか？')) return;
                                if (!recipe) return;
                                try {
                                  const res = await fetch('/api/recipe/update', {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ recipeId: recipe.id, updates: { ai_ingredient_label: null } }),
                                  });
                                  if (!res.ok) throw new Error('削除に失敗しました');
                                  toast.success('削除しました');
                                  setRecipe(prev => prev ? { ...prev, ai_ingredient_label: null } : prev);
                                  setAiLabelText("");
                                  setLabelWarnings([]); setLabelMissing([]);
                                } catch { toast.error('削除に失敗しました'); }
                              }}
                              className="text-xs text-red-500 hover:text-red-700 px-1 py-0.5 rounded hover:bg-red-50"
                              title="削除"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={async () => {
                                if (!recipe || !aiLabelText) return;
                                const { error } = await supabase.from('recipes').update({ ingredient_label: aiLabelText }).eq('id', recipe.id);
                                if (error) { toast.error('採用に失敗しました'); }
                                else {
                                  toast.success('AI生成ラベルを手動側に採用しました');
                                  setLabelText(aiLabelText);
                                  setRecipe(prev => prev ? { ...prev, ingredient_label: aiLabelText } : prev);
                                  setLabelTab('manual');
                                }
                              }}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium px-1.5 py-0.5 rounded hover:bg-blue-50 flex items-center gap-0.5"
                            >
                              📋 採用
                            </button>
                            <button
                              onClick={() => { navigator.clipboard.writeText(aiLabelText); toast.success('コピーしました'); }}
                              className="text-xs text-gray-500 hover:text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-100"
                              title="クリップボードにコピー"
                            >
                              📋 コピー
                            </button>
                          </>
                        )}
                        <button
                          onClick={async () => {
                            if (!recipe) return;
                            setLabelGenerating(true);
                            setLabelWarnings([]); setLabelMissing([]); setLabelCarryover([]);
                            try {
                              const res = await fetch('/api/recipe/generate-label', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ recipeId: recipe.id }),
                              });
                              const data = await res.json();
                              if (data.error) { toast.error(data.error); }
                              else {
                                setAiLabelText(data.label || '');
                                setRecipe(prev => prev ? { ...prev, ai_ingredient_label: data.label || null } : prev);
                                setLabelWarnings(data.warnings || []);
                                setLabelMissing(data.missing_info || []);
                                setLabelCarryover(data.carryover || []);
                                toast.success('AI原材料表示を生成しました');
                              }
                            } catch (err: any) { toast.error('生成に失敗しました: ' + err.message); }
                            finally { setLabelGenerating(false); }
                          }}
                          disabled={labelGenerating}
                          className="text-xs text-emerald-600 hover:text-emerald-800 font-medium px-1.5 py-0.5 rounded hover:bg-emerald-50 disabled:opacity-50 flex items-center gap-0.5"
                        >
                          {labelGenerating ? (
                            <><Loader2 className="w-3 h-3 animate-spin" />生成中...</>
                          ) : (
                            <><FlaskConical className="w-3 h-3" />{aiLabelText ? '再生成' : 'AI生成'}</>
                          )}
                        </button>
                      </div>
                      {aiLabelText ? (
                        <div className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap bg-emerald-50/50 rounded p-2 border border-emerald-100">
                          {aiLabelText}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400 text-center py-4 bg-gray-50 rounded border border-dashed border-gray-200">
                          「AI生成」で原材料表示を自動生成
                        </div>
                      )}
                      {/* AI警告 */}
                      {labelWarnings.length > 0 && (
                        <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded p-1.5">
                          <div className="flex items-center gap-1 mb-0.5">
                            <AlertTriangle className="w-3 h-3 text-yellow-600" />
                            <span className="text-xs font-bold text-yellow-800">注意</span>
                          </div>
                          <ul className="text-xs text-yellow-700 space-y-0.5">
                            {labelWarnings.map((w, i) => <li key={i}>• {w}</li>)}
                          </ul>
                        </div>
                      )}
                      {labelMissing.length > 0 && (
                        <div className="mt-2 bg-red-50 border border-red-200 rounded p-1.5">
                          <div className="flex items-center gap-1 mb-0.5">
                            <AlertTriangle className="w-3 h-3 text-red-600" />
                            <span className="text-xs font-bold text-red-800">不足</span>
                          </div>
                          <ul className="text-xs text-red-700 space-y-0.5">
                            {labelMissing.map((m, i) => <li key={i}>• {m}</li>)}
                          </ul>
                        </div>
                      )}
                      {labelCarryover.length > 0 && (
                        <div className="mt-2 bg-blue-50 border border-blue-200 rounded p-1.5">
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className="text-xs">🔄</span>
                            <span className="text-xs font-bold text-blue-800">キャリーオーバー省略</span>
                          </div>
                          <ul className="text-xs text-blue-700 space-y-0.5">
                            {labelCarryover.map((c, i) => <li key={i}>• {c}</li>)}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-8">
          {/* Left Column: Ingredients (8 cols) ->
          Now Expanded or Scrollable */}
          <div className="min-w-0 lg:col-span-12 print:col-span-12">
            <div className="mb-4 flex flex-col items-start gap-3 border-b pb-2 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="text-base font-bold text-gray-900 uppercase tracking-wider">
                製造計画（材料表）
              </h2>
              <div className="flex w-full flex-wrap items-center gap-3 text-xs lg:w-auto lg:gap-4">
                <span className="font-mono text-gray-400">
                  {items.length} FILES
                </span>
                <div className="flex items-center gap-2 print:hidden flex-wrap">
                  <span className="h-8 px-3 text-xs font-bold rounded border border-gray-300 bg-gray-50 text-gray-700 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" />
                    {previewingVersionId
                      ? '過去版を表示中'
                      : draftSourceVersionId
                        ? '過去版から修正中'
                        : '履歴の最新'}
                    <span className="font-mono text-gray-500">
                      v{previewingVersionId
                        ? versions.find(v => v.id === previewingVersionId)?.version_number ?? 0
                        : draftSourceVersionId
                          ? versions.find(v => v.id === draftSourceVersionId)?.version_number ?? 0
                          : versions[0]?.version_number ?? 0}
                    </span>
                  </span>
                  <button
                    onClick={startDraftRevision}
                    disabled={draftMode || isSaving}
                    className={`min-h-[38px] px-3 py-1 text-xs font-bold rounded flex items-center gap-2 text-left transition-colors disabled:opacity-50 ${
                      draftMode
                        ? 'bg-green-100 text-green-700 border border-green-300'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    <Edit className="w-3.5 h-3.5" />
                    <span className="flex flex-col leading-tight">
                      <span>
                        {draftMode
                          ? '修正版を編集中'
                          : previewingVersionId
                            ? '新レシピを作成'
                            : '最新版から作る'}
                      </span>
                      <span className={`text-[10px] font-normal ${draftMode ? 'text-green-600' : 'text-green-100'}`}>
                        {draftMode
                          ? '保存で新履歴'
                          : previewingVersionId
                            ? 'この版を元に新履歴'
                            : '新しい履歴版'}
                      </span>
                    </span>
                  </button>
                  {draftMode && (
                    <input
                      type="text"
                      value={draftVersionNote}
                      onChange={(e) => setDraftVersionNote(e.target.value)}
                      placeholder="履歴メモ 例: v3を元に配合を微調整"
                      className="h-8 w-full rounded border border-green-300 bg-white px-2 text-xs outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600 sm:w-72"
                    />
                  )}
                  {versions.length > 0 && (
                    <button
                      onClick={() => setVersionPanelOpen(prev => !prev)}
                      className="h-8 px-3 text-xs font-bold rounded border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      履歴 {versions.length}件
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${versionPanelOpen ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>
              </div>
            </div>
            {versionPanelOpen && versions.length > 0 && (
              <div className="mb-4 print:hidden border border-slate-200 bg-white rounded p-3 shadow-sm">
                <div className="mb-3 flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
                  <div>
                    <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <History className="w-4 h-4 text-slate-500" />
                      レシピ履歴
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      青は確認、緑は過去版から新履歴、赤は現在レシピの置換です。
                    </div>
                  </div>
                  {previewingVersionId && (
                    <button
                      type="button"
                      onClick={clearVersionPreview}
                      className="h-8 px-3 text-xs font-bold rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" />
                      現在へ戻る
                    </button>
                  )}
                </div>
                <div className="divide-y divide-slate-100 border border-slate-100 rounded overflow-hidden">
                  {versions.map((v) => (
                    <div
                      key={v.id}
                      className={`flex flex-wrap items-center justify-between gap-3 px-3 py-2 ${
                        previewingVersionId === v.id
                          ? 'bg-blue-50'
                          : draftSourceVersionId === v.id
                            ? 'bg-green-50'
                            : 'bg-white'
                      }`}
                    >
                      <div className="min-w-0 flex-1 sm:min-w-[220px]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-slate-900">v{v.version_number}</span>
                          {v.id === versions[0]?.id && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              最新履歴
                            </span>
                          )}
                          {previewingVersionId === v.id && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">
                              表示中
                            </span>
                          )}
                          {draftSourceVersionId === v.id && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">
                              修正元
                            </span>
                          )}
                          <span className="text-[11px] text-slate-400">{formatVersionDate(v.created_at)}</span>
                        </div>
                        {editingVersionNoteId === v.id ? (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <input
                              type="text"
                              value={editingVersionNote}
                              onChange={(e) => setEditingVersionNote(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveVersionNote(v);
                                if (e.key === 'Escape') cancelEditVersionNote();
                              }}
                              autoFocus
                              placeholder="履歴メモを入力"
                              className="h-8 w-full min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:min-w-[260px]"
                            />
                            <button
                              type="button"
                              onClick={() => saveVersionNote(v)}
                              disabled={savingVersionNoteId === v.id}
                              className="h-8 w-8 rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 flex items-center justify-center"
                              title="メモを保存"
                            >
                              {savingVersionNoteId === v.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditVersionNote}
                              disabled={savingVersionNoteId === v.id}
                              className="h-8 w-8 rounded border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600 disabled:opacity-50 flex items-center justify-center"
                              title="編集をやめる"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="mt-1 flex min-w-0 items-center gap-1.5">
                            <span className="truncate text-xs text-slate-600">
                              {v.version_note || 'メモなし'}
                            </span>
                            <button
                              type="button"
                              onClick={() => startEditVersionNote(v)}
                              className="h-6 w-6 shrink-0 rounded border border-slate-200 text-slate-400 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 flex items-center justify-center"
                              title="履歴メモを編集"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                        <button
                          type="button"
                          onClick={() => previewVersion(v)}
                          className={`min-h-[46px] px-3 py-1.5 text-xs font-bold rounded border flex items-center gap-2 text-left transition-colors ${
                            previewingVersionId === v.id
                              ? 'border-blue-500 bg-blue-600 text-white'
                              : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                          }`}
                        >
                          <History className="w-3.5 h-3.5" />
                          <span className="flex flex-col leading-tight">
                            <span>{previewingVersionId === v.id ? '表示を解除' : '内容を見る'}</span>
                            <span className={`text-[10px] font-normal ${previewingVersionId === v.id ? 'text-blue-100' : 'text-blue-500'}`}>
                              {previewingVersionId === v.id ? '現在レシピへ戻る' : '保存せず確認'}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => startRevisionFromVersion(v)}
                          disabled={isSaving}
                          className="min-h-[46px] px-3 py-1.5 text-xs font-bold rounded border border-green-300 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 text-left"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span className="flex flex-col leading-tight">
                            <span>新レシピを作成</span>
                            <span className="text-[10px] font-normal text-green-100">この版を元に新履歴</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => restoreVersion(v)}
                          disabled={isSaving}
                          className="min-h-[46px] px-3 py-1.5 text-xs font-bold rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 flex items-center gap-2 text-left"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span className="flex flex-col leading-tight">
                            <span>上書き保存</span>
                            <span className="text-[10px] font-normal text-red-500">現在レシピを置換</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteVersion(v)}
                          className="h-8 w-8 rounded border border-slate-200 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 flex items-center justify-center"
                          title="この履歴を削除"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Batch Settings (Only visible in edit/interact mode, but printed values persist) */}
            <div className="mb-4 flex flex-col gap-3 rounded bg-gray-50 p-2 sm:flex-row sm:gap-4 print:hidden">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-gray-500">
                  製造数 A
                </label>
                <Input
                  type="number"
                  value={batchSize1}
                  onChange={(e) => setBatchSize1(parseInt(e.target.value) || 0)}
                  className="h-8 w-20 bg-white"
                />
                <span className="text-xs text-gray-500">個</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-gray-500">
                  製造数 B
                </label>
                <Input
                  type="number"
                  value={batchSize2}
                  onChange={(e) => setBatchSize2(parseInt(e.target.value) || 0)}
                  className="h-8 w-20 bg-white"
                />
                <span className="text-xs text-gray-500">個</span>
              </div>
            </div>
            <div className="space-y-8">
              {groupedItems.map((group, gIdx) => (
                <div key={gIdx} className="break-inside-avoid">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div
                        className={`text-[10px] font-bold px-2 py-0.5 inline-block rounded border ${group.color}`}
                      >
                        {group.title}
                      </div>
                      {group.type === "ingredient" && group.items.length > 1 && (
                        <div className="inline-flex overflow-hidden rounded-md border border-gray-200 bg-white print:hidden">
                          <button
                            type="button"
                            onClick={() => setIngredientSortMode("weight")}
                            className={`flex h-7 items-center gap-1 px-2 text-[11px] font-bold transition-colors ${
                              ingredientSortMode === "weight"
                                ? "bg-emerald-600 text-white"
                                : "text-gray-500 hover:bg-gray-50 hover:text-emerald-700"
                            }`}
                            title="原材料を使用重量の多い順に表示"
                          >
                            <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                            重量順
                          </button>
                          <button
                            type="button"
                            onClick={() => setIngredientSortMode("registered")}
                            className={`flex h-7 items-center gap-1 border-l border-gray-200 px-2 text-[11px] font-bold transition-colors ${
                              ingredientSortMode === "registered"
                                ? "bg-gray-800 text-white"
                                : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
                            }`}
                            title="原材料を登録時の順番に戻す"
                          >
                            <ListOrdered className="h-3.5 w-3.5" />
                            登録順
                          </button>
                        </div>
                      )}
                    </div>
                    {isEditing && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs text-gray-500 hover:text-blue-600"
                        onClick={() => addItem(group.type)}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        追加
                      </Button>
                    )}
                  </div>
                  {group.items.length > 0 ? (
                    <div className="-mx-3 overflow-x-auto px-3 pb-1 lg:mx-0 lg:px-0">
                    <table className="min-w-[980px] w-full text-sm table-auto">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500">
                          <th className="text-left py-1 w-8 font-normal">#</th>
                          <th className="py-1 w-5 font-normal"></th>
                          <th className="text-left py-1 min-w-[320px] font-normal">
                            名称
                          </th>
                          {/* 1 Unit */}
                          {/* 1 Unit */}
                          <th className="text-right py-1 w-20 font-bold text-gray-800 bg-gray-50">
                            基本(1)
                            {isEditing && group.type === 'ingredient' && (
                              <div className="flex justify-end items-center gap-1 mt-1 print:hidden">
                                {currentScalePercent !== null && currentScalePercent !== 100 && (
                                  <button
                                    onClick={() => {
                                      // 全グループの元データを100%に復元
                                      setItems((prev) =>
                                        prev.map((item) => {
                                          if (item.item_type !== 'ingredient') return item;
                                          const origUsage = originalUsageMap[item.id];
                                          if (origUsage !== undefined) {
                                            const qty = parseFloat(String(item.unit_quantity)) || 1;
                                            const price = parseFloat(String(item.unit_price)) || 0;
                                            const rate = !item.tax_included ? (1 + (taxRates.ingredient / 100)) : 1.0;
                                            const cost = roundToDecimals(origUsage * (price / qty) * rate, 4);
                                            return { ...item, usage_amount: origUsage, cost };
                                          }
                                          return item;
                                        }),
                                      );
                                      setOriginalUsageMap({});
                                      setCurrentScalePercent(null);
                                      setHasChanges(true);
                                      toast.success("使用量を100%（元の値）に戻しました");
                                    }}
                                    className="text-[9px] bg-orange-100 text-orange-700 hover:bg-orange-200 px-1.5 py-0.5 rounded border border-orange-300 font-bold whitespace-nowrap"
                                    title="元の使用量に戻す"
                                  >
                                    ↩
                                  </button>
                                )}
                                <InlineEdit
                                  type="number"
                                  value={currentScalePercent}
                                  placeholder="100"
                                  onSave={(val) => {
                                    const percent = parseFloat(String(val));
                                    if (val === "") return;
                                    if (percent && percent > 0) {
                                      if (percent === 100) {
                                        // 100%入力 = 元に戻す
                                        if (Object.keys(originalUsageMap).length > 0) {
                                          setItems((prev) =>
                                            prev.map((item) => {
                                              if (item.item_type !== 'ingredient') return item;
                                              const origUsage = originalUsageMap[item.id];
                                              if (origUsage !== undefined) {
                                                const qty = parseFloat(String(item.unit_quantity)) || 1;
                                                const price = parseFloat(String(item.unit_price)) || 0;
                                                const rate = !item.tax_included ? (1 + (taxRates.ingredient / 100)) : 1.0;
                                                const cost = roundToDecimals(origUsage * (price / qty) * rate, 4);
                                                return { ...item, usage_amount: origUsage, cost };
                                              }
                                              return item;
                                            }),
                                          );
                                          setOriginalUsageMap({});
                                        }
                                        setCurrentScalePercent(null);
                                        setHasChanges(true);
                                        toast.success("使用量を100%（元の値）に戻しました");
                                        return;
                                      }
                                      const scale = percent / 100;
                                      // 原材料のみバックアップ
                                      const backupMap = { ...originalUsageMap };
                                      items.forEach((item) => {
                                        if (item.item_type === 'ingredient' && !(item.id in backupMap)) {
                                          backupMap[item.id] = parseFloat(String(item.usage_amount)) || 0;
                                        }
                                      });
                                      setOriginalUsageMap(backupMap);
                                      setItems((prev) =>
                                        prev.map((item) => {
                                          if (item.item_type !== 'ingredient') return item;
                                          // 元の使用量をベースにスケーリング
                                          const baseUsage = backupMap[item.id] ?? (parseFloat(String(item.usage_amount)) || 0);
                                          const newUsage = roundToDecimals(baseUsage * scale, 2);

                                          const qty = parseFloat(String(item.unit_quantity)) || 1;
                                          const price = parseFloat(String(item.unit_price)) || 0;
                                          const rate = !item.tax_included ? (1 + (taxRates.ingredient / 100)) : 1.0;
                                          const cost = roundToDecimals(newUsage * (price / qty) * rate, 4);

                                          return { ...item, usage_amount: newUsage, cost };
                                        }),
                                      );
                                      setCurrentScalePercent(percent);
                                      setHasChanges(true);
                                      toast.success(
                                        `使用量を${percent}%に変更しました`,
                                      );
                                    }
                                  }}
                                  className={`w-12 text-right border rounded px-1 text-xs font-normal ${currentScalePercent !== null && currentScalePercent !== 100 ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-white border-gray-200'}`}
                                  inputClassName="w-12 text-right text-xs [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  suffix="%"
                                />
                              </div>
                            )}
                          </th>
                          {/* 1g単価 - 原材料のみ */}
                          {group.type === 'ingredient' && (
                            <th className="text-right py-1 w-16 font-normal text-gray-400">
                              1g単価
                            </th>
                          )}
                          {/* Cost */}
                          <th className="text-right py-1 w-20 font-normal text-gray-400">
                            原価(1)
                          </th>
                          {/* Batch 1 */}
                          <th className="text-right py-1 w-28 font-bold text-blue-700 bg-blue-50 border-l border-white">
                            {batchSize1}個分 <br />
                            <span className="text-xs font-normal text-gray-500">
                              使用量 | 袋数
                            </span>
                          </th>
                          {/* Batch 2 */}
                          <th className="text-right py-1 w-28 font-bold text-purple-700 bg-purple-50 border-l border-white">
                            {batchSize2}個分 <br />
                            <span className="text-xs font-normal text-gray-500">
                              使用量 | 袋数
                            </span>
                          </th>
                          {isEditing && <th className="w-8"></th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {group.items.map((item, idx) => {
                          const unitUsage =
                            parseFloat(String(item.usage_amount)) || 0;
                          const unitQty =
                            parseFloat(String(item.unit_quantity)) || 0;
                          const itemCost = parseFloat(String(item.cost)) || 0;
                          const isMaterialGroup =
                            group.type === "material" ||
                            group.type === "expense";

                          // Batch 1 Calcs
                          const b1Usage = unitUsage * batchSize1;
                          const b1Bags = unitQty > 0 ? b1Usage / unitQty : 0;

                          // Batch 2 Calcs
                          const b2Usage = unitUsage * batchSize2;
                          const b2Bags = unitQty > 0 ? b2Usage / unitQty : 0;

                          return (
                            <tr
                              key={item.id}
                              className="group hover:bg-gray-50/50"
                            >
                              <td className="py-2 text-gray-300 align-top">
                                {idx + 1}
                              </td>
                              <td className="py-2 align-top text-center" title={(() => { if (item.item_type !== 'ingredient') return ''; const cand = group.candidates.find((c: any) => c.name === item.item_name); return cand?.raw_materials ? `原材料: ${cand.raw_materials}` : ''; })()}>
                                {item.item_type === 'ingredient' && (() => {
                                  const cand = group.candidates.find((c: any) => c.name === item.item_name);
                                  return cand?.raw_materials ? (
                                    <FlaskConical className="w-3.5 h-3.5 text-emerald-500 inline-block" />
                                  ) : null;
                                })()}
                              </td>
                              <td className="py-2 font-medium text-gray-700 align-top pr-2">
                                {isEditing ? (
                                  <ItemNameSelect
                                    candidates={group.candidates}
                                    value={item.item_name}
                                    onSelect={(val) =>
                                      handleItemSelect(item.id, val)
                                    }
                                  />
                                ) : (
                                  <>
                                    <div className="flex items-center gap-2">
                                      {item.item_name}
                                      {item.tax_included === false && (['ingredient', 'material'].includes(item.item_type)) && (
                                        <span className="text-[9px] px-1 py-0 rounded font-bold border bg-gray-100 text-gray-400 border-gray-200">税抜</span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-gray-400 font-normal">
                                      {unitQty > 0 &&
                                        !isMaterialGroup &&
                                        group.type !== "product"
                                        ? `(${formatNumber(unitQty, 0)}g/pk)`
                                        : ""}
                                      {group.type === "product" && (
                                        <span className="ml-1 text-[10px] bg-indigo-100 text-indigo-700 px-1 rounded">
                                          商品
                                        </span>
                                      )}
                                    </div>
                                  </>
                                )}
                              </td>
                              {/* 1 Unit Usage */}
                              <td className="py-2 text-right font-mono text-gray-800 bg-gray-50/30 align-top">
                                {isEditing ? (
                                  <div>
                                    {(group.type === "intermediate" || group.type === "product") && (item.unit_weight || 0) > 0 && (
                                      <div className="mb-1.5">
                                        {/* セグメントコントロール: 個 / g */}
                                        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (parseFloat(String(item.unit_quantity)) === -1) {
                                                // g→個に切替
                                                const grams = parseFloat(String(item.usage_amount)) || 0;
                                                const perUnit = item.unit_weight || 1;
                                                const units = Math.round((grams / perUnit) * 100) / 100;
                                                handleItemChange(item.id, 'unit_quantity', 1);
                                                setTimeout(() => handleItemChange(item.id, 'usage_amount', units || 1), 0);
                                              }
                                            }}
                                            className={`text-[10px] px-2 py-0.5 font-medium transition-colors ${
                                              parseFloat(String(item.unit_quantity)) !== -1
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-white text-gray-500 hover:bg-gray-50'
                                            }`}
                                          >
                                            個
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (parseFloat(String(item.unit_quantity)) !== -1) {
                                                // 個→gに切替
                                                const units = parseFloat(String(item.usage_amount)) || 0;
                                                const grams = roundToDecimals(units * (item.unit_weight || 0), 2);
                                                handleItemChange(item.id, 'unit_quantity', -1);
                                                setTimeout(() => handleItemChange(item.id, 'usage_amount', grams || 0), 0);
                                              }
                                            }}
                                            className={`text-[10px] px-2 py-0.5 font-medium border-l border-gray-300 transition-colors ${
                                              parseFloat(String(item.unit_quantity)) === -1
                                                ? 'bg-purple-600 text-white'
                                                : 'bg-white text-gray-500 hover:bg-gray-50'
                                            }`}
                                          >
                                            g
                                          </button>
                                        </div>
                                        <span className="text-[9px] text-gray-400 ml-1.5">
                                          1個={formatNumber(item.unit_weight, 1)}g
                                        </span>
                                      </div>
                                    )}
                                    <input
                                      type="number"
                                      className="w-full text-right border-b border-gray-200 focus:border-blue-500 outline-none bg-transparent"
                                      value={item.usage_amount ? Math.round(parseFloat(String(item.usage_amount)) * 100) / 100 : ""}
                                      onChange={(e) =>
                                        handleItemChange(
                                          item.id,
                                          "usage_amount",
                                          e.target.value,
                                        )
                                      }
                                      placeholder={
                                        (group.type === "product" || group.type === "intermediate")
                                          ? (parseFloat(String(item.unit_quantity)) === -1 ? 'g' : '個')
                                          : isMaterialGroup ? '個' : 'g'
                                      }
                                    />
                                    {(group.type === "intermediate" || group.type === "product") && (item.unit_weight || 0) > 0 && (
                                      <div className="text-[9px] text-purple-500 mt-0.5">
                                        {parseFloat(String(item.unit_quantity)) === -1
                                          ? `≒ ${formatNumber((parseFloat(String(item.usage_amount)) || 0) / (item.unit_weight || 1), 2)}個分`
                                          : `= ${formatNumber((parseFloat(String(item.usage_amount)) || 0) * (item.unit_weight || 0), 1)}g`
                                        }
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <>
                                    <span className="font-bold">
                                      {formatNumber(unitUsage, 2)}
                                    </span>
                                    <span className="text-[10px] text-gray-400 block">
                                      {(group.type === "product" || group.type === "intermediate")
                                        ? (parseFloat(String(item.unit_quantity)) === -1 ? "g" : "個")
                                        : isMaterialGroup ? "個" : "g"}
                                    </span>
                                    {(group.type === "intermediate" || group.type === "product") && (item.unit_weight || 0) > 0 && (
                                      <span className="text-[9px] text-purple-500 block">
                                        {parseFloat(String(item.unit_quantity)) === -1
                                          ? `≒ ${formatNumber(unitUsage / (item.unit_weight || 1), 2)}個分`
                                          : `= ${formatNumber(unitUsage * (item.unit_weight || 0), 1)}g`
                                        }
                                      </span>
                                    )}
                                  </>
                                )}
                              </td>
                              {/* 1g単価 - 原材料のみ */}
                              {group.type === 'ingredient' && (
                                <td className="py-2 text-right font-mono text-gray-400 align-top">
                                  {unitUsage > 0 ? `¥${(itemCost / unitUsage).toFixed(2)}` : '-'}
                                </td>
                              )}
                              {/* Cost */}
                              <td className="py-2 text-right font-mono text-gray-400 align-top">
                                {isMaterialGroup && isEditing ? (
                                  <input
                                    type="number"
                                    className="w-full text-right border-b border-gray-200 focus:border-blue-500 outline-none bg-transparent"
                                    value={item.cost || ""}
                                    onChange={(e) =>
                                      handleItemChange(
                                        item.id,
                                        "cost",
                                        e.target.value,
                                      )
                                    }
                                  />
                                ) : (
                                  <>
                                    {formatCurrency(itemCost)}
                                    {(group.type === "intermediate" || group.type === "product")
                                      && parseFloat(String(item.unit_quantity)) !== -1
                                      && unitUsage > 0
                                      && unitUsage !== 1 && (
                                      <div className="text-[9px] text-gray-400">
                                        1個=¥{(itemCost / unitUsage).toFixed(2)}
                                      </div>
                                    )}
                                    {(group.type === "intermediate" || group.type === "product")
                                      && parseFloat(String(item.unit_quantity)) === -1
                                      && (item.unit_weight || 0) > 0 && (
                                      <div className="text-[9px] text-gray-400">
                                        1個=¥{((item.unit_weight || 0) > 0 ? ((parseFloat(String(item.unit_price)) || 0)).toFixed(2) : '-')}
                                      </div>
                                    )}
                                  </>
                                )}
                              </td>
                              {/* Batch 1 */}
                              <td className="py-2 text-right font-mono text-blue-700 bg-blue-50/30 border-l border-gray-50 align-top">
                                <>
                                  <div className="font-bold">
                                    {formatNumber(b1Usage, group.type === "ingredient" ? 2 : 0)}
                                    <span className="text-[10px] font-normal ml-0.5">
                                      {(group.type === "product" || group.type === "intermediate")
                                        ? (parseFloat(String(item.unit_quantity)) === -1 ? "g" : "個")
                                        : isMaterialGroup ? "個" : "g"}
                                    </span>
                                  </div>
                                  {b1Bags > 0 &&
                                    !isMaterialGroup &&
                                    item.item_type !== "expense" &&
                                    group.type !== "product" && (
                                      <div className="text-[10px] text-blue-500 mt-0.5 font-bold">
                                        {formatNumber(b1Bags, 2)}{" "}
                                        <span className="font-normal opacity-70">
                                          pk
                                        </span>
                                      </div>
                                    )}
                                </>
                              </td>
                              {/* Batch 2 */}
                              <td className="py-2 text-right font-mono text-purple-700 bg-purple-50/30 border-l border-gray-50 align-top">
                                <>
                                  <div className="font-bold">
                                    {formatNumber(b2Usage, group.type === "ingredient" ? 2 : 0)}
                                    <span className="text-[10px] font-normal ml-0.5">
                                      {(group.type === "product" || group.type === "intermediate")
                                        ? (parseFloat(String(item.unit_quantity)) === -1 ? "g" : "個")
                                        : isMaterialGroup ? "個" : "g"}
                                    </span>
                                  </div>
                                  {b2Bags > 0 &&
                                    !isMaterialGroup &&
                                    item.item_type !== "expense" && (
                                      <div className="text-[10px] text-purple-500 mt-0.5 font-bold">
                                        {formatNumber(b2Bags, 2)}{" "}
                                        <span className="font-normal opacity-70">
                                          pk
                                        </span>
                                      </div>
                                    )}
                                </>
                              </td>
                              {isEditing && (
                                <td className="py-2 text-center align-top">
                                  <button
                                    onClick={() => deleteItem(item.id)}
                                    className="text-gray-400 hover:text-red-500 p-1"
                                    title="削除"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                      {/* Group Subtotal */}
                      <tfoot className="border-t border-gray-100">
                        <tr>
                          <td
                            colSpan={group.type === 'ingredient' ? 4 : 3}
                            className="py-2 text-right text-[10px] text-gray-400 uppercase tracking-wider"
                          >
                            Total
                          </td>
                          <td className="py-2 text-right font-mono font-bold text-gray-700 bg-gray-50/50">
                            {group.type === "ingredient" ||
                              group.type === "intermediate" ||
                              group.type === "product"
                              ? <>
                                {(() => {
                                  // 中間部品TOTAL: グラムモードの場合はg表示、個モードの場合は個表示
                                  const hasGramItems = (group.type === "intermediate" || group.type === "product")
                                    && group.items.some(i => parseFloat(String(i.unit_quantity)) === -1);
                                  const totalUsage = group.items.reduce(
                                    (sum, i) => sum + (parseFloat(String(i.usage_amount)) || 0), 0);
                                  const totalWeightG = group.items.reduce((sum, i) => {
                                    const usage = parseFloat(String(i.usage_amount)) || 0;
                                    const isGram = parseFloat(String(i.unit_quantity)) === -1;
                                    return sum + (isGram ? usage : usage * (i.unit_weight || 0));
                                  }, 0);
                                  if (group.type === "intermediate" || group.type === "product") {
                                    return <>
                                      <span className="font-bold">{formatNumber(totalWeightG, 1)}g</span>
                                      {!hasGramItems && <div className="text-[9px] text-purple-500 font-normal">{formatNumber(totalUsage, 2)}個</div>}
                                    </>;
                                  }
                                  return <>{formatNumber(totalUsage, 2)}g</>;
                                })()}
                              </>
                              : "-"}
                          </td>
                          {/* 原価合計 */}
                          <td className="py-2 text-right font-mono font-bold text-gray-900">
                            {formatCurrency(
                              group.items.reduce(
                                (sum, i) =>
                                  sum + (parseFloat(String(i.cost)) || 0),
                                0,
                              ),
                            )}
                          </td>
                          {/* バッチ1合計 */}
                          <td className="py-2 text-right font-mono font-bold text-blue-700 bg-blue-50/30 border-l border-gray-50">
                            {group.type === "ingredient" ||
                              group.type === "intermediate" ||
                              group.type === "product"
                              ? formatNumber(
                                group.items.reduce(
                                  (sum, i) =>
                                    sum +
                                    (parseFloat(String(i.usage_amount)) ||
                                      0) *
                                    batchSize1,
                                  0,
                                ),
                                2,
                              ) + (() => {
                                if (group.type === "product" || group.type === "intermediate") {
                                  const allGram = group.items.every(i => parseFloat(String(i.unit_quantity)) === -1);
                                  return allGram ? "g" : "個";
                                }
                                return "g";
                              })()
                              : "-"}
                          </td>
                          {/* バッチ2合計 */}
                          <td className="py-2 text-right font-mono font-bold text-purple-700 bg-purple-50/30 border-l border-gray-50">
                            {group.type === "ingredient" ||
                              group.type === "intermediate" ||
                              group.type === "product"
                              ? formatNumber(
                                group.items.reduce(
                                  (sum, i) =>
                                    sum +
                                    (parseFloat(String(i.usage_amount)) ||
                                      0) *
                                    batchSize2,
                                  0,
                                ),
                                2,
                              ) + (() => {
                                if (group.type === "product" || group.type === "intermediate") {
                                  const allGram = group.items.every(i => parseFloat(String(i.unit_quantity)) === -1);
                                  return allGram ? "g" : "個";
                                }
                                return "g";
                              })()
                              : "-"}
                          </td>
                          {isEditing && <td></td>}
                        </tr>
                      </tfoot>
                    </table>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-300 py-4 text-center border border-dashed rounded bg-gray-50/50">
                      アイテムがありません
                    </div>
                  )}
                  {group.type === "intermediate" && (
                    <div className="mt-4 mb-8 border-t-2 border-double border-gray-200 pt-4 px-2">
                      <div className="flex flex-col items-start gap-3 lg:flex-row lg:items-center lg:gap-8">
                        <div className="text-sm font-bold text-gray-600">全体重量 (原材料 + 中間加工品)</div>
                        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-4 lg:flex lg:w-auto lg:gap-12">
                          <div className="text-right">
                            <div className="text-[10px] text-gray-400 uppercase">基本(1)</div>
                            <div className="font-mono font-bold text-lg text-gray-800">
                              {formatNumber(items.reduce((sum, item) => {
                                if (["ingredient", "intermediate", "product"].includes(item.item_type)) {
                                  const usage = parseFloat(String(item.usage_amount)) || 0;
                                  return sum + (item.item_type === "ingredient" ? usage : usage * (item.unit_weight || 0));
                                }
                                return sum;
                              }, 0), 2)}g
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-blue-400 uppercase">{batchSize1}個分</div>
                            <div className="font-mono font-bold text-lg text-blue-700">
                              {formatNumber(items.reduce((sum, item) => {
                                if (["ingredient", "intermediate", "product"].includes(item.item_type)) {
                                  const usage = parseFloat(String(item.usage_amount)) || 0;
                                  const weight = item.item_type === "ingredient" ? usage : usage * (item.unit_weight || 0);
                                  return sum + (weight * batchSize1);
                                }
                                return sum;
                              }, 0), 2)}g
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-purple-400 uppercase">{batchSize2}個分</div>
                            <div className="font-mono font-bold text-lg text-purple-700">
                              {formatNumber(items.reduce((sum, item) => {
                                if (["ingredient", "intermediate", "product"].includes(item.item_type)) {
                                  const usage = parseFloat(String(item.usage_amount)) || 0;
                                  const weight = item.item_type === "ingredient" ? usage : usage * (item.unit_weight || 0);
                                  return sum + (weight * batchSize2);
                                }
                                return sum;
                              }, 0), 2)}g
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* 材料系小計 */}
                      <div className="mt-3 flex flex-col items-start gap-1 border-t border-gray-200 pt-3 lg:flex-row lg:items-center lg:gap-8">
                        <div className="text-sm font-bold text-emerald-700">原価小計 (セット内容 + 原材料 + 中間加工品)</div>
                        <div className="font-mono font-bold text-lg text-emerald-700">
                          {formatCurrency(
                            items
                              .filter(i => ["product", "ingredient", "intermediate"].includes(i.item_type))
                              .reduce((sum, i) => sum + (parseFloat(String(i.cost)) || 0), 0)
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {group.type === "expense" && (
                    <div className="mt-4 mb-2 border-t-2 border-double border-gray-200 pt-4 px-2">
                      <div className="flex flex-col items-start gap-1 lg:flex-row lg:items-center lg:gap-8">
                        <div className="text-sm font-bold text-orange-700">原価小計 (資材・包材 + 諸経費)</div>
                        <div className="font-mono font-bold text-lg text-orange-700">
                          {formatCurrency(
                            items
                              .filter(i => ["material", "expense"].includes(i.item_type))
                              .reduce((sum, i) => sum + (parseFloat(String(i.cost)) || 0), 0)
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-5 border-t pt-6 lg:mt-8 lg:grid-cols-12 lg:gap-8 lg:pt-8">
          {/* Bottom Section: Notes & Nutrition (Now Full Width split or separate) */}
          {/* Since table is wide, we move these to bottom */}

          <div className="min-w-0 lg:col-span-7 print:col-span-7">
            {/* Manufacturing Notes */}
            <div className="break-inside-avoid bg-gray-50 p-4 rounded border border-gray-100 print:bg-white print:border-l-2 print:border-gray-200 print:border-t-0 print:border-r-0 print:border-b-0 print:rounded-none h-full">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Edit className="w-4 h-4" />
                製造メモ
              </h3>
              <textarea
                className="w-full h-full min-h-[150px] text-sm leading-relaxed bg-transparent border-none resize-none p-0 focus:ring-0 text-gray-700 placeholder:text-gray-300"
                value={recipe.manufacturing_notes || ""}
                onChange={(e) =>
                  handleRecipeChange("manufacturing_notes", e.target.value)
                }
                placeholder="製造プロセスや注意点を記載..."
              />
            </div>
          </div>
          <div className="min-w-0 lg:col-span-5 print:hidden">
            {/* Nutrition */}
            <div className="break-inside-avoid">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 border-b pb-1">
                栄養成分表示
              </h3>
              <NutritionDisplay
                items={items.map((item) => ({
                  item_name: item.item_name,
                  item_type: item.item_type,
                  usage_amount: parseFloat(String(item.usage_amount)) || 0,
                  unit_quantity: parseFloat(String(item.unit_quantity)) || 0,
                  unit_weight: item.unit_weight || 0,
                  nutrition: getItemNutrition(item),
                }))}
                compact={true}
                fillingQuantity={Number.parseFloat(String(recipe.filling_quantity))}
              />
            </div>
          </div>
        </div>
      </main>
      {/* 下部固定 保存/キャンセルバー */}
      {hasChanges && (
        <div className={`sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t px-3 py-2 backdrop-blur shadow-[0_-2px_10px_rgba(0,0,0,0.08)] lg:bottom-0 lg:px-6 lg:py-3 print:hidden ${previewingVersionId ? 'bg-blue-50/95 border-blue-300' : draftMode ? 'bg-green-50/95 border-green-300' : 'bg-white/95 border-blue-200'}`}>
          <div className="mx-auto flex max-w-[1400px] flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className={`flex min-w-0 items-start gap-2 text-xs font-medium sm:items-center sm:text-sm ${previewingVersionId ? 'text-blue-700' : draftMode ? 'text-green-700' : 'text-amber-600'}`}>
              <div className={`w-2 h-2 rounded-full animate-pulse ${previewingVersionId ? 'bg-blue-500' : draftMode ? 'bg-green-500' : 'bg-amber-500'}`} />
              {previewingVersionId
                ? `Ver.${versions.find(v => v.id === previewingVersionId)?.version_number} を表示中 - 保存はされません`
                : draftMode
                  ? draftSourceVersionId
                    ? `Ver.${versions.find(v => v.id === draftSourceVersionId)?.version_number} を元に編集中 - 保存すると新しい履歴になります`
                    : '修正版の編集中 - 保存すると新しい履歴になります'
                  : '未保存の変更があります'
              }
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              {previewingVersionId ? (() => {
                const version = versions.find(v => v.id === previewingVersionId);
                if (!version) return null;
                return (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={clearVersionPreview}
                      disabled={isSaving}
                      className="gap-2 text-gray-500 hover:text-gray-700"
                    >
                      <X className="w-4 h-4" />
                      現在へ戻る
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => startRevisionFromVersion(version)}
                      disabled={isSaving}
                      className="h-auto gap-2 bg-green-600 px-3 py-1.5 text-white hover:bg-green-700 sm:px-6"
                    >
                      <Edit className="w-4 h-4" />
                      <span className="flex flex-col items-start leading-tight">
                        <span>新レシピを作成</span>
                        <span className="text-[10px] font-normal opacity-85">この版を元に新履歴</span>
                      </span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => restoreVersion(version)}
                      disabled={isSaving}
                      className="gap-2 h-auto py-1.5 border-red-300 text-red-700 hover:bg-red-50"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span className="flex flex-col items-start leading-tight">
                        <span>上書き保存</span>
                        <span className="text-[10px] font-normal">現在レシピを置換</span>
                      </span>
                    </Button>
                  </>
                );
              })() : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={cancelChanges}
                    disabled={isSaving}
                    className="gap-2 text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-4 h-4" />
                    キャンセル
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveChanges}
                    disabled={isSaving}
                    className="gap-2 bg-blue-600 px-4 text-white hover:bg-blue-700 sm:px-6"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isSaving
                      ? '保存中...'
                      : draftMode
                        ? '新しい履歴として保存'
                        : '保存'
                    }
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ====== Print-Only Layout ====== */}
      <div className="hidden print:block p-0 m-0 w-full text-black text-sm">
        {/* Print Header */}
        <div className="border-b border-black pb-0 mb-0">
          <h1 className="text-sm font-bold leading-none">{recipe.name}</h1>
          <div className="flex gap-3 text-[9px] text-gray-500">
            <span>カテゴリ: {recipe.category}</span>
            <span>開発日: {recipe.development_date || "-"}</span>
            <span>ID: {recipe.id.split("-")[0]}</span>
            {previewingVersionId && (() => {
              const pv = versions.find(v => v.id === previewingVersionId);
              return pv ? (
                <span className="font-bold text-amber-700">
                  Ver.{pv.version_number}{pv.version_note ? ` (${pv.version_note})` : ''}
                </span>
              ) : null;
            })()}
            {!previewingVersionId && versions.length > 0 && (
              <span>最新: v{versions[0]?.version_number}</span>
            )}
          </div>
        </div>
        {/* Print Specs Row */}
        <div className="flex gap-2 mb-0 text-xs">
          <div className="border border-gray-400 rounded px-2 py-0.5">
            <div className="text-[9px] font-bold text-gray-500 mb-0">
              充填量
            </div>
            <div className="text-xs font-bold leading-tight">
              {formatQuantityText(recipe.filling_quantity)}
            </div>
          </div>
          <div className="border border-gray-400 rounded px-2 py-0.5">
            <div className="text-[9px] font-bold text-gray-500 mb-0">
              内容量（表記量）
            </div>
            <div className="text-xs font-bold leading-tight">
              {formatQuantityText(recipe.label_quantity)}
            </div>
          </div>
          <div className="border border-gray-400 rounded px-2 py-0.5">
            <div className="text-[9px] font-bold text-gray-500 mb-0">
              保存方法
            </div>
            <div className="text-xs font-bold leading-tight">
              {recipe.storage_method || "-"}
            </div>
          </div>
          {recipe.sterilization_method && (
            <div className="border border-gray-400 rounded px-2 py-0.5">
              <div className="text-[9px] font-bold text-gray-500 mb-0">
                殺菌
              </div>
              <div className="text-lg font-bold">
                {recipe.sterilization_method}
                {recipe.sterilization_temperature &&
                  ` ${recipe.sterilization_temperature}℃`}
                {recipe.sterilization_time && ` ${recipe.sterilization_time}分`}
              </div>
            </div>
          )}
        </div>
        {/* Print Manufacturing Plan Table */}
        <div className="mb-3">
          <h2 className="text-xs font-bold border-b border-black pb-0 mb-0">
            製造計画（材料表）
          </h2>
          <div className="flex gap-4 mb-0 text-[10px] text-gray-600">
            <span>
              製造数 A: <strong className="text-black">{batchSize1}個</strong>
            </span>
            <span>
              製造数 B: <strong className="text-black">{batchSize2}個</strong>
            </span>
          </div>
        </div>
        {groupedItems
          .filter((g) => g.type !== "material" && g.type !== "expense")
          .map(
            (group, gIdx) =>
              group.items.length > 0 && (
                <div key={gIdx} className="mb-1">
                  <div className="text-[10px] font-bold bg-gray-100 px-1 py-0 inline-block rounded mb-0">
                    {group.title}
                  </div>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-gray-400 text-gray-600">
                        <th className="text-left py-0 w-4 text-[10px]">#</th>
                        <th className="text-left py-0 text-[10px]">名称</th>
                        <th className="text-right py-0 w-16 text-[10px]">
                          基本(1)
                        </th>
                        <th className="text-right py-1 w-28">
                          A ({batchSize1})
                        </th>
                        <th className="text-right py-1 w-28">
                          B ({batchSize2})
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((item, idx) => {
                        const unitUsage =
                          parseFloat(String(item.usage_amount)) || 0;
                        const unitQty =
                          parseFloat(String(item.unit_quantity)) || 0;
                        const b1Usage = unitUsage * batchSize1;
                        const b1Bags = unitQty > 0 ? b1Usage / unitQty : 0;
                        const b2Usage = unitUsage * batchSize2;
                        const b2Bags = unitQty > 0 ? b2Usage / unitQty : 0;
                        const isGramMode = parseFloat(String(item.unit_quantity)) === -1;
                        const unit = (group.type === "product" || group.type === "intermediate") ? (isGramMode ? "g" : "個") : "g";

                        return (
                          <tr
                            key={item.id}
                            className="border-b border-gray-200"
                          >
                            <td className="py-0 text-gray-400 text-[10px]">
                              {idx + 1}
                            </td>
                            <td className="py-0 font-medium text-[10px] leading-tight">
                              {item.item_name}
                              {unitQty > 0 && group.type !== "product" && group.type !== "intermediate" && (
                                <span className="text-gray-400 ml-1">
                                  ({formatNumber(unitQty, 0)}g/pk)
                                </span>
                              )}
                            </td>
                            <td className="py-0 text-right font-mono text-[10px]">
                              {formatNumber(unitUsage, group.type === "ingredient" ? 2 : 1)}
                              {unit}
                            </td>
                            <td className="py-0 text-right font-mono">
                              <span className="font-bold">
                                {formatNumber(b1Usage, group.type === "ingredient" ? 2 : 0)}
                                {unit}
                              </span>
                              {b1Bags > 0 && group.type !== "product" && group.type !== "intermediate" && (
                                <span className="text-gray-500 ml-1">
                                  ({formatNumber(b1Bags, 2)}pk)
                                </span>
                              )}
                            </td>
                            <td className="py-0 text-right font-mono">
                              <span className="font-bold">
                                {formatNumber(b2Usage, group.type === "ingredient" ? 2 : 0)}
                                {unit}
                              </span>
                              {b2Bags > 0 && group.type !== "product" && group.type !== "intermediate" && (
                                <span className="text-gray-500 ml-1">
                                  ({formatNumber(b2Bags, 2)}pk)
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-300 font-bold text-[10px]">
                        <td
                          colSpan={2}
                          className="py-1 text-right text-gray-500"
                        >
                          計
                        </td>
                        <td className="py-0 text-right font-mono text-[10px]">
                          {formatNumber(
                            group.items.reduce(
                              (s, i) =>
                                s + (parseFloat(String(i.usage_amount)) || 0),
                              0,
                            ),
                            group.type === "ingredient" ? 2 : 0,
                          ) + (() => {
                            if (group.type === "product" || group.type === "intermediate") {
                              const allGram = group.items.every(i => parseFloat(String(i.unit_quantity)) === -1);
                              return allGram ? "g" : "個";
                            }
                            return "g";
                          })()}
                        </td>
                        <td className="py-0 text-right font-mono">
                          {formatNumber(
                            group.items.reduce(
                              (s, i) =>
                                s +
                                (parseFloat(String(i.usage_amount)) || 0) *
                                batchSize1,
                              0,
                            ),
                            group.type === "ingredient" ? 2 : 0,
                          ) + (() => {
                            if (group.type === "product" || group.type === "intermediate") {
                              const allGram = group.items.every(i => parseFloat(String(i.unit_quantity)) === -1);
                              return allGram ? "g" : "個";
                            }
                            return "g";
                          })()}
                        </td>
                        <td className="py-0 text-right font-mono">
                          {formatNumber(
                            group.items.reduce(
                              (s, i) =>
                                s +
                                (parseFloat(String(i.usage_amount)) || 0) *
                                batchSize2,
                              0,
                            ),
                            group.type === "ingredient" ? 2 : 0,
                          ) + (() => {
                            if (group.type === "product" || group.type === "intermediate") {
                              const allGram = group.items.every(i => parseFloat(String(i.unit_quantity)) === -1);
                              return allGram ? "g" : "個";
                            }
                            return "g";
                          })()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  {group.type === "intermediate" && (
                    <div className="mt-1 mb-2 border-t border-black pt-1">
                      <div className="flex justify-between items-center px-1">
                        <div className="text-[10px] font-bold">全体重量 (原材料 + 中間加工品)</div>
                        <div className="flex gap-4">
                          <div className="text-right">
                            <span className="text-[8px] text-gray-500 mr-1 uppercase">基本(1)</span>
                            <span className="font-mono font-bold text-[10px]">
                              {formatNumber(items.reduce((sum, item) => {
                                if (["ingredient", "intermediate", "product"].includes(item.item_type)) {
                                  const usage = parseFloat(String(item.usage_amount)) || 0;
                                  return sum + (item.item_type === "ingredient" ? usage : usage * (item.unit_weight || 0));
                                }
                                return sum;
                              }, 0), 2)}g
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[8px] text-gray-500 mr-1 uppercase">A ({batchSize1})</span>
                            <span className="font-mono font-bold text-[10px]">
                              {formatNumber(items.reduce((sum, item) => {
                                if (["ingredient", "intermediate", "product"].includes(item.item_type)) {
                                  const usage = parseFloat(String(item.usage_amount)) || 0;
                                  const weight = item.item_type === "ingredient" ? usage : usage * (item.unit_weight || 0);
                                  return sum + (weight * batchSize1);
                                }
                                return sum;
                              }, 0), 2)}g
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[8px] text-gray-500 mr-1 uppercase">B ({batchSize2})</span>
                            <span className="font-mono font-bold text-[10px]">
                              {formatNumber(items.reduce((sum, item) => {
                                if (["ingredient", "intermediate", "product"].includes(item.item_type)) {
                                  const usage = parseFloat(String(item.usage_amount)) || 0;
                                  const weight = item.item_type === "ingredient" ? usage : usage * (item.unit_weight || 0);
                                  return sum + (weight * batchSize2);
                                }
                                return sum;
                              }, 0), 2)}g
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
          )}

        {/* Print Notes */}
        {recipe.manufacturing_notes && (
          <div className="mt-1 border-t border-gray-300 pt-0">
            <h3 className="text-[10px] font-bold text-gray-500 mb-0">
              製造メモ
            </h3>
            <p className="text-[10px] whitespace-pre-wrap leading-tight">
              {recipe.manufacturing_notes}
            </p>
          </div>
        )}
      </div>

      {/* ── 商品写真セクション (PC用・印刷非表示) ── */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-5 print:hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
            <Camera className="w-4 h-4 text-blue-600" />
            商品写真
            {recipeImages.length > 0 && (
              <span className="text-xs font-normal text-gray-400 ml-1">({recipeImages.length}枚)</span>
            )}
          </h3>
          <button
            onClick={() => {
              const url = `${window.location.origin}/recipe/photo/mobile?id=${recipe.id}`;
              navigator.clipboard.writeText(url).then(() => toast.success('📱 スマホ用URLをコピーしました'));
            }}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
          >
            📱 スマホで撮影
          </button>
        </div>

        {/* サムネイル一覧（ドラッグ&ドロップ対応） */}
        {recipeImages.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-4">
            {recipeImages.map((img, index) => (
              <div
                key={img.id}
                className={`relative group cursor-grab active:cursor-grabbing`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', String(index));
                  e.dataTransfer.effectAllowed = 'move';
                  (e.currentTarget as HTMLElement).style.opacity = '0.4';
                }}
                onDragEnd={(e) => {
                  (e.currentTarget as HTMLElement).style.opacity = '1';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  (e.currentTarget as HTMLElement).classList.add('ring-2', 'ring-blue-500');
                }}
                onDragLeave={(e) => {
                  (e.currentTarget as HTMLElement).classList.remove('ring-2', 'ring-blue-500');
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).classList.remove('ring-2', 'ring-blue-500');
                  const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                  const toIndex = index;
                  if (fromIndex === toIndex) return;

                  // ローカルで並び替え
                  const newImages = [...recipeImages];
                  const [moved] = newImages.splice(fromIndex, 1);
                  newImages.splice(toIndex, 0, moved);
                  // sort_orderを振り直し
                  const reordered = newImages.map((im, i) => ({ ...im, sort_order: i }));
                  setRecipeImages(reordered);

                  // 上部サムネイルも更新（1枚目がメインになるため）
                  if (recipe) {
                    setRecipe(prev => prev ? { ...prev, product_image_url: reordered[0]?.image_url || null } : prev);
                  }

                  // APIで永続化
                  try {
                    await fetch('/api/recipe/upload-image', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        recipeId: recipe.id,
                        imageOrder: reordered.map(im => ({ id: im.id, sort_order: im.sort_order })),
                      }),
                    });
                    toast.success('画像の順番を更新しました');
                  } catch { toast.error('並び替えに失敗しました'); }
                }}
              >
                {/* メインラベル */}
                {index === 0 && (
                  <div className="absolute top-1 left-1 z-10 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                    メイン
                  </div>
                )}
                <img
                  src={img.image_url}
                  alt=""
                  className={`w-32 h-32 object-cover rounded-lg border-2 transition-colors ${
                    index === 0 ? 'border-blue-400' : 'border-gray-200 group-hover:border-blue-400'
                  }`}
                />
                {/* 順番表示 */}
                <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                  {index + 1}
                </div>
                <button
                  onClick={async () => {
                    if (!confirm('この画像を削除しますか？')) return;
                    try {
                      const res = await fetch('/api/recipe/upload-image', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ imageId: img.id, recipeId: recipe.id }),
                      });
                      if (res.ok) {
                        setRecipeImages(prev => prev.filter(i => i.id !== img.id));
                        toast.success('画像を削除しました');
                      }
                    } catch { toast.error('削除に失敗しました'); }
                  }}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 border-2 border-white"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* D&D アップロードエリア */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setDragOver(false);
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            if (files.length === 0) return;
            await uploadPhotos(files);
          }}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition-colors sm:p-6 ${dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50'
            } ${photoUploading ? 'opacity-50 pointer-events-none' : ''}`}
          onClick={() => photoInputRef.current?.click()}
        >
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              if (e.target.files) {
                await uploadPhotos(Array.from(e.target.files));
                e.target.value = '';
              }
            }}
          />
          {photoUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-sm text-gray-500">アップロード中...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-8 h-8 text-gray-400" />
              <p className="text-sm text-gray-500">
                クリックまたはドラッグ&ドロップで画像をアップロード
              </p>
              <p className="text-xs text-gray-400">複数ファイル対応・自動で200-300KBに圧縮</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Web商品説明 & 商品ポイント セクション (PC用・印刷非表示) ── */}
      {(() => {
        const totalChars = (recipe.product_points || '').length + (recipe.web_description || '').length;
        const isOver = totalChars > 500;
        const overCount = totalChars - 500;
        return (
          <details className="print:hidden mt-6 bg-white rounded-xl border border-gray-200 shadow-sm group">
            <summary className="flex cursor-pointer list-none select-none flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-4 transition-colors hover:bg-gray-50 sm:px-5 [&::-webkit-details-marker]:hidden">
              <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                📝 商品ポイント & Web商品説明
              </h3>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${isOver ? 'bg-red-100 text-red-600 font-bold' : 'bg-gray-100 text-gray-500'}`}>
                  {totalChars}文字
                  {isOver && <span className="ml-1">（{overCount}文字超過）</span>}
                </span>
                <ChevronDown className="w-5 h-5 text-gray-400 transition-transform group-open:rotate-180" />
              </div>
            </summary>
            <div className="space-y-4 border-t border-gray-100 px-3 pb-4 pt-4 sm:px-5 sm:pb-5">
              {recipe.category === "ネット専用" && (() => {
                const productLpUrl = (recipe.product_lp_url || '').trim();
                const canOpenProductLp = /^https?:\/\/\S+$/i.test(productLpUrl);
                return (
                  <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                        <Link2 className="h-4 w-4 text-blue-600" />
                        商品LP
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(productLpUrl);
                            toast.success('商品LPをコピーしました');
                          }}
                          disabled={!productLpUrl}
                          className="rounded p-1.5 text-gray-400 transition hover:bg-white hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-30"
                          title="商品LPをコピー"
                        >
                          <ClipboardCopy className="h-4 w-4" />
                        </button>
                        <a
                          href={canOpenProductLp ? productLpUrl : undefined}
                          target="_blank"
                          rel="noreferrer"
                          aria-disabled={!canOpenProductLp}
                          className={`rounded p-1.5 transition ${canOpenProductLp ? 'text-gray-400 hover:bg-white hover:text-blue-600' : 'pointer-events-none text-gray-300'}`}
                          title="商品LPを開く"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                    <input
                      type="url"
                      inputMode="url"
                      value={recipe.product_lp_url || ''}
                      onChange={(e) => {
                        setRecipe(prev => prev ? { ...prev, product_lp_url: e.target.value } : null);
                        setHasChanges(true);
                      }}
                      placeholder="https://..."
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                );
              })()}
              {/* EC用商品名 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-semibold text-gray-700">🏷️ EC用商品名</label>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${(recipe.ec_product_name || '').length > 75 ? 'bg-red-100 text-red-600 font-bold' : (recipe.ec_product_name || '').length > 60 ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                      {(recipe.ec_product_name || '').length} / 75文字
                    </span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(recipe.ec_product_name || ''); toast.success('EC用商品名をコピーしました'); }}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition" title="コピー"
                    ><ClipboardCopy className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <input
                  type="text"
                  value={recipe.ec_product_name || ''}
                  onChange={(e) => {
                    setRecipe(prev => prev ? { ...prev, ec_product_name: e.target.value } : null);
                    setHasChanges(true);
                  }}
                  maxLength={75}
                  placeholder="ECサイトに掲載する商品名を入力（最大75文字）"
                  className={`w-full rounded-lg border px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none ${(recipe.ec_product_name || '').length > 75 ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                />
                {(recipe.ec_product_name || '').length > 60 && (recipe.ec_product_name || '').length <= 75 && (
                  <p className="text-xs text-amber-500 mt-1">残り{75 - (recipe.ec_product_name || '').length}文字</p>
                )}
                <EcProductNameSyncControls
                  recipeId={recipe.id}
                  recipeName={recipe.name}
                  ecProductName={recipe.ec_product_name}
                  expectedRecipeSnapshot={{
                    recipeId: recipe.id,
                    recipeName: recipe.name,
                    ecProductName: (recipe.ec_product_name || '').trim().slice(0, 75),
                    linkedProductId: recipe.linked_product_id ? String(recipe.linked_product_id).trim().slice(0, 100) : null,
                    janCode: recipe.jan_code ? String(recipe.jan_code).trim().slice(0, 32) : null,
                    seriesCode: recipe.series_code ? String(recipe.series_code).trim().slice(0, 100) : null,
                    productCode: recipe.product_code ? String(recipe.product_code).trim().slice(0, 100) : null,
                    fillingQuantity: recipe.filling_quantity != null ? String(recipe.filling_quantity).trim().slice(0, 50) : null,
                    fillingQuantityUnit: recipe.filling_quantity_unit ? String(recipe.filling_quantity_unit).trim().slice(0, 30) : null,
                    storageMethod: recipe.storage_method ? String(recipe.storage_method).trim().slice(0, 100) : null,
                  }}
                  hasUnsavedChanges={hasChanges}
                  isSaving={isSaving}
                />
              </div>
              {/* キャッチコピー（楽天・Yahoo用） */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-semibold text-gray-700">
                    ✨ キャッチコピー <span className="text-xs font-normal text-amber-500">※楽天・Yahooのみ</span>
                  </label>
                  <button
                    onClick={() => { navigator.clipboard.writeText(recipe.catchcopy || ''); toast.success('キャッチコピーをコピーしました'); }}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition" title="コピー"
                  ><ClipboardCopy className="w-3.5 h-3.5" /></button>
                </div>
                <input
                  type="text"
                  value={recipe.catchcopy || ''}
                  onChange={(e) => {
                    setRecipe(prev => prev ? { ...prev, catchcopy: e.target.value } : null);
                    setHasChanges(true);
                  }}
                  placeholder="商品のキャッチコピーを入力（楽天・Yahoo掲載用）"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
              {/* 商品ポイント — 2カラム横並び */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-semibold text-gray-700">商品ポイント</label>
                  <button
                    onClick={() => { navigator.clipboard.writeText(recipe.product_points || ''); toast.success('商品ポイントをコピーしました'); }}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition" title="コピー"
                  ><ClipboardCopy className="w-3.5 h-3.5" /></button>
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {/* 左: 編集用（■マーカー） */}
                  <div>
                    <div className="text-xs text-gray-400 mb-1 font-medium">✏️ 編集</div>
                    <textarea
                      value={recipe.product_points || ''}
                      onChange={(e) => {
                        setRecipe(prev => prev ? { ...prev, product_points: e.target.value } : null);
                        setHasChanges(true);
                      }}
                      rows={8}
                      placeholder="■ 商品の特徴を入力...&#10;■ アピールポイントを入力..."
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none overflow-hidden"
                      style={{ fieldSizing: 'content' as any, minHeight: '120px' }}
                    />
                  </div>
                  {/* 右: 自動プレビュー（■→✅️） */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="text-xs text-gray-400 font-medium">👁️ プレビュー（✅️版・自動生成）</div>
                        <span className="text-[11px] text-amber-600 font-medium">※Yahoo・楽天は✅️は使用できません</span>
                      </div>
                      <button
                        onClick={() => { navigator.clipboard.writeText((recipe.product_points || '').replace(/■/g, '✅️')); toast.success('✅️版をコピーしました'); }}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition" title="✅️版をコピー"
                      ><ClipboardCopy className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm whitespace-pre-wrap min-h-[120px] text-gray-700 leading-relaxed">
                      {(recipe.product_points || '').replace(/■/g, '✅️') || <span className="text-gray-300">左の入力が自動反映されます</span>}
                    </div>
                  </div>
                </div>
              </div>
              {/* Web商品説明 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-semibold text-gray-700">Web商品説明</label>
                  <button
                    onClick={() => { navigator.clipboard.writeText(recipe.web_description || ''); toast.success('Web商品説明をコピーしました'); }}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition" title="コピー"
                  ><ClipboardCopy className="w-3.5 h-3.5" /></button>
                </div>
                <textarea
                  value={recipe.web_description || ''}
                  onChange={(e) => {
                    setRecipe(prev => prev ? { ...prev, web_description: e.target.value } : null);
                    setHasChanges(true);
                  }}
                  rows={12}
                  placeholder="ECサイト等に掲載する商品説明文を入力..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none overflow-hidden"
                  style={{ fieldSizing: 'content' as any, minHeight: '180px' }}
                />
              </div>

              {/* ポートレート画像 */}
              <div className="border-t border-gray-100 pt-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-emerald-600" />
                      <label className="text-sm font-semibold text-gray-700">ポートレート画像</label>
                      <span className="text-xs text-gray-400">{portraitImages.length}枚</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">縦長画像を枚数制限なしで登録できます。ドラッグで表示順を変更できます。</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => portraitInputRef.current?.click()}
                    disabled={portraitUploading}
                  >
                    {portraitUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    画像を追加
                  </Button>
                </div>

                {portraitImages.length > 0 && (
                  <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                    {portraitImages.map((image, index) => (
                      <div
                        key={image.id}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData('application/x-recipe-portrait-image-index', String(index));
                          event.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(event) => {
                          if (!event.dataTransfer.types.includes('application/x-recipe-portrait-image-index')) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(event) => {
                          const value = event.dataTransfer.getData('application/x-recipe-portrait-image-index');
                          if (!value) return;
                          event.preventDefault();
                          reorderPortraitImages(Number(value), index);
                        }}
                        className="group relative overflow-hidden rounded-md border border-gray-200 bg-white"
                      >
                        <a href={image.image_url} target="_blank" rel="noreferrer" className="block aspect-[3/4] bg-gray-50">
                          <img src={image.image_url} alt={`${recipe.name} ポートレート画像 ${index + 1}`} className="h-full w-full object-contain" />
                        </a>
                        <div className="flex min-h-9 items-center justify-between gap-1 border-t border-gray-100 px-2 py-1">
                          <span className="min-w-0 truncate text-[10px] text-gray-500">
                            {index + 1}・{Math.ceil(image.file_size_bytes / 1024)}KB
                          </span>
                          <button
                            type="button"
                            onClick={() => deletePortraitImage(image.id)}
                            className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="ポートレート画像を削除"
                            aria-label={`${index + 1}枚目のポートレート画像を削除`}
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
                      if (event.dataTransfer.types.includes('Files')) {
                        event.preventDefault();
                        setPortraitDragOver(true);
                      }
                    }}
                    onDragOver={(event) => {
                      if (event.dataTransfer.types.includes('Files')) event.preventDefault();
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPortraitDragOver(false);
                    }}
                    onDrop={async (event) => {
                      if (!event.dataTransfer.types.includes('Files')) return;
                      event.preventDefault();
                      setPortraitDragOver(false);
                      const files = Array.from(event.dataTransfer.files).filter((item) => item.type.startsWith('image/'));
                      await uploadPortraitImages(files);
                    }}
                    onClick={() => !portraitUploading && portraitInputRef.current?.click()}
                    className={`flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-5 text-center transition-colors ${portraitDragOver ? 'border-emerald-500 bg-emerald-50' : 'border-gray-300 bg-gray-50 hover:border-emerald-400 hover:bg-emerald-50/40'} ${portraitUploading ? 'pointer-events-none opacity-60' : ''}`}
                  >
                    <input
                      ref={portraitInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="hidden"
                      onChange={async (event) => {
                        const files = Array.from(event.target.files || []);
                        event.target.value = '';
                        await uploadPortraitImages(files);
                      }}
                    />
                    {portraitUploading ? (
                      <><Loader2 className="mb-2 h-6 w-6 animate-spin text-emerald-600" /><p className="text-sm font-medium text-gray-600">画像を処理しています</p></>
                    ) : (
                      <><Upload className="mb-2 h-6 w-6 text-gray-400" /><p className="text-sm font-medium text-gray-700">PCから複数画像をドロップ</p><p className="mt-1 text-xs text-gray-500">JPEG・PNG・WebP／複数選択・枚数制限なし／250KB超は自動縮小</p></>
                    )}
                </div>
              </div>

              {/* Web商品画像 */}
              <div className="border-t border-gray-100 pt-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Images className="h-4 w-4 text-blue-600" />
                      <label className="text-sm font-semibold text-gray-700">Web商品画像</label>
                      <span className="text-xs text-gray-400">{webProductImages.length}枚</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">EC掲載用の画像を順番どおり管理します。250KBを超える画像は自動縮小します。</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => webImagesInputRef.current?.click()}
                    disabled={webImagesUploading}
                  >
                    {webImagesUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    画像を追加
                  </Button>
                </div>

                {webProductImages.length > 0 && (
                  <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                    {webProductImages.map((image, index) => (
                      <div
                        key={image.id}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData('application/x-recipe-web-image-index', String(index));
                          event.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(event) => {
                          if (!event.dataTransfer.types.includes('application/x-recipe-web-image-index')) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(event) => {
                          const value = event.dataTransfer.getData('application/x-recipe-web-image-index');
                          if (!value) return;
                          event.preventDefault();
                          reorderWebProductImages(Number(value), index);
                        }}
                        className="group relative overflow-hidden rounded-md border border-gray-200 bg-white"
                      >
                        <a href={image.image_url} target="_blank" rel="noreferrer" className="block aspect-square bg-gray-50">
                          <img src={image.image_url} alt={`${recipe.name} Web商品画像 ${index + 1}`} className="h-full w-full object-contain" />
                        </a>
                        <div className="flex min-h-9 items-center justify-between gap-1 border-t border-gray-100 px-2 py-1">
                          <span className="min-w-0 truncate text-[10px] text-gray-500">
                            {index + 1}・{image.source_type === 'rakuten' ? '楽天' : image.source_type === 'base' ? 'BASE' : image.source_type === 'shared_folder' ? '共有' : '手動'}・{Math.ceil(image.file_size_bytes / 1024)}KB
                          </span>
                          <button
                            type="button"
                            onClick={() => deleteWebProductImage(image.id)}
                            className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="画像を削除"
                            aria-label={`${index + 1}枚目を削除`}
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
                    if (event.dataTransfer.types.includes('Files')) {
                      event.preventDefault();
                      setWebImagesDragOver(true);
                    }
                  }}
                  onDragOver={(event) => {
                    if (event.dataTransfer.types.includes('Files')) event.preventDefault();
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setWebImagesDragOver(false);
                  }}
                  onDrop={async (event) => {
                    if (!event.dataTransfer.types.includes('Files')) return;
                    event.preventDefault();
                    setWebImagesDragOver(false);
                    const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'));
                    await uploadWebProductImages(files);
                  }}
                  onClick={() => !webImagesUploading && webImagesInputRef.current?.click()}
                  className={`flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-5 text-center transition-colors ${webImagesDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/40'} ${webImagesUploading ? 'pointer-events-none opacity-60' : ''}`}
                >
                  <input
                    ref={webImagesInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={async (event) => {
                      const files = Array.from(event.target.files || []);
                      event.target.value = '';
                      await uploadWebProductImages(files);
                    }}
                  />
                  {webImagesUploading ? (
                    <><Loader2 className="mb-2 h-6 w-6 animate-spin text-blue-600" /><p className="text-sm font-medium text-gray-600">画像を処理しています</p></>
                  ) : (
                    <><ImageIcon className="mb-2 h-6 w-6 text-gray-400" /><p className="text-sm font-medium text-gray-700">画像をドロップ、またはクリックして選択</p><p className="mt-1 text-xs text-gray-500">JPEG・PNG・WebP／複数選択対応</p></>
                  )}
                </div>
              </div>
            </div>
          </details>
        );
      })()}
      <style jsx global>
        {`
          @media print {
            @page {
              size: A4 landscape;
              margin: 8mm;
            }
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              background: white;
              font-size: 11px;
            }
            thead {
              display: table-header-group;
            }
            ::-webkit-scrollbar {
              display: none;
            }
          }
        `}
      </style>


    </div>
  );
}

export default function RecipeDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">読み込み中...</div>}>
      <RecipeDetailContent />
    </Suspense>
  );
}
