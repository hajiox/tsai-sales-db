"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  FileImage,
  Images,
  Loader2,
  RefreshCw,
  ScanLine,
  Search,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import type { LabelCheckMode, LabelOcrResult, RecipeCandidate } from "@/lib/label-check/types";

type Photo = { file: File; url: string };
type Stage = "capture" | "preparing" | "ocr" | "matching" | "review" | "saving" | "result";
type RecipeRow = {
  id: string;
  name: string;
  category: string | null;
  shelf_life: string | null;
  raw_materials_ocr: string | null;
};
type CheckResult = {
  check_id: string;
  judgment: "OK" | "NG";
  shelf_life: string;
  shelf_life_days: number;
  expected_expiry: string;
  deviation_percent: number;
  deviation_days: number;
  warnings?: string[];
};

const SHELF_LIFE_PRESETS = [
  { label: "60日", value: "製造から60日" },
  { label: "1年", value: "製造から1年" },
  { label: "18ヶ月", value: "製造から18ヶ月" },
  { label: "2年", value: "製造から2年" },
];
const RECIPE_CATEGORIES = ["ネット専用", "自社", "OEM"];

export default function LabelCheckWorkflow() {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<LabelCheckMode>(searchParams.get("mode") === "normal" ? "normal" : "simple");
  const [stage, setStage] = useState<Stage>("capture");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [ocr, setOcr] = useState<LabelOcrResult | null>(null);
  const [ocrElapsedMs, setOcrElapsedMs] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<RecipeCandidate[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeCandidate | null>(null);
  const [productName, setProductName] = useState("");
  const [rawMaterials, setRawMaterials] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [manufacturingDate, setManufacturingDate] = useState("");
  const [shelfLife, setShelfLife] = useState("");
  const [saveRecipeShelfLife, setSaveRecipeShelfLife] = useState(false);
  const [saveRecipeRawMaterials, setSaveRecipeRawMaterials] = useState(false);
  const [showRecipeList, setShowRecipeList] = useState(false);
  const [recipeCategory, setRecipeCategory] = useState("ネット専用");
  const [recipeQuery, setRecipeQuery] = useState("");
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState("");
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const photoUrls = useRef<string[]>([]);
  const requestId = useRef(crypto.randomUUID());

  useEffect(() => () => {
    photoUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const reset = useCallback((nextMode = mode) => {
    photoUrls.current.forEach((url) => URL.revokeObjectURL(url));
    photoUrls.current = [];
    setMode(nextMode);
    setStage("capture");
    setPhotos([]);
    setOcr(null);
    setOcrElapsedMs(null);
    setCandidates([]);
    setSelectedRecipe(null);
    setProductName("");
    setRawMaterials("");
    setExpiryDate("");
    setManufacturingDate("");
    setShelfLife("");
    setSaveRecipeShelfLife(false);
    setSaveRecipeRawMaterials(false);
    setShowRecipeList(false);
    setRecipeQuery("");
    setRecipes([]);
    setResult(null);
    setError("");
    requestId.current = crypto.randomUUID();
  }, [mode]);

  const runOcr = useCallback(async (inputPhotos: Photo[], checkMode: LabelCheckMode) => {
    setStage("ocr");
    setError("");
    try {
      const formData = new FormData();
      formData.set("mode", checkMode);
      inputPhotos.forEach((photo) => formData.append("files", photo.file));
      const response = await fetch("/api/label-check/ocr", { method: "POST", body: formData });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "OCR解析に失敗しました");
      const nextOcr = json.data as LabelOcrResult;
      setOcr(nextOcr);
      setOcrElapsedMs(Number(json.elapsed_ms) || null);
      setProductName(nextOcr.product_name || "");
      setRawMaterials(nextOcr.raw_materials || "");
      setExpiryDate(nextOcr.expiry_date_normalized || "");
      setManufacturingDate(nextOcr.manufacturing_date_normalized || "");

      if (checkMode === "normal") {
        setStage("matching");
        const matchResponse = await fetch("/api/label-check/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_name: nextOcr.product_name,
            raw_materials: nextOcr.raw_materials,
            manufacturer: nextOcr.manufacturer,
          }),
        });
        const matchJson = await matchResponse.json();
        if (!matchResponse.ok) throw new Error(matchJson.error || "レシピ照合に失敗しました");
        setCandidates(matchJson.matches || []);
      }
      setStage("review");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "解析に失敗しました");
      setStage("capture");
    }
  }, []);

  const addFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setError("");
    setStage("preparing");
    try {
      const selected = Array.from(fileList).slice(0, mode === "simple" ? 1 : Math.max(0, 4 - photos.length));
      const compressedFiles: File[] = [];
      for (const file of selected) compressedFiles.push(await compressImage(file));
      const added = compressedFiles.map((file) => {
        const url = URL.createObjectURL(file);
        photoUrls.current.push(url);
        return { file, url };
      });
      if (mode === "simple") {
        setPhotos(added);
        await runOcr(added, "simple");
      } else {
        setPhotos((current) => [...current, ...added]);
        setStage("capture");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "画像を処理できません");
      setStage("capture");
    }
  }, [mode, photos.length, runOcr]);

  const removePhoto = (index: number) => {
    setPhotos((current) => {
      const target = current[index];
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((_, photoIndex) => photoIndex !== index);
    });
  };

  useEffect(() => {
    if (!showRecipeList) return;
    const timer = window.setTimeout(async () => {
      setRecipesLoading(true);
      try {
        const params = new URLSearchParams({ category: recipeCategory });
        if (recipeQuery.trim()) params.set("q", recipeQuery.trim());
        const response = await fetch(`/api/label-check/recipes?${params}`, { cache: "no-store" });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "レシピを取得できません");
        setRecipes(json.recipes || []);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "レシピを取得できません");
      } finally {
        setRecipesLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [recipeCategory, recipeQuery, showRecipeList]);

  const chooseRecipe = (recipe: RecipeCandidate) => {
    setSelectedRecipe(recipe);
    setShelfLife(recipe.shelf_life || "");
    setSaveRecipeShelfLife(!recipe.shelf_life);
    setShowRecipeList(false);
  };

  const chooseRecipeRow = (recipe: RecipeRow) => {
    chooseRecipe({
      recipe_id: recipe.id,
      recipe_name: recipe.name,
      category: recipe.category,
      shelf_life: recipe.shelf_life,
      confidence: 1,
      reason: "手動選択",
    });
  };

  const completeCheck = async () => {
    if (!expiryDate) {
      setError("賞味期限を確認してください");
      return;
    }
    if (!shelfLife.trim()) {
      setError("賞味期限期間を選択または入力してください");
      return;
    }
    if (mode === "normal" && !selectedRecipe) {
      setError("照合するレシピを選択してください");
      return;
    }

    setStage("saving");
    setError("");
    try {
      const formData = new FormData();
      formData.set("payload", JSON.stringify({
        request_id: requestId.current,
        mode,
        file_name: photos[0]?.file.name || null,
        product_name: productName || null,
        raw_materials: rawMaterials || null,
        expiry_date_printed: ocr?.expiry_date || expiryDate,
        expiry_date_normalized: expiryDate,
        manufacturing_date: manufacturingDate || null,
        shelf_life: shelfLife.trim(),
        matched_recipe: selectedRecipe ? {
          id: selectedRecipe.recipe_id,
          name: selectedRecipe.recipe_name,
          shelf_life: selectedRecipe.shelf_life,
        } : null,
        confidence: ocr?.confidence ?? null,
        label_data: ocr || {},
        save_recipe_shelf_life: mode === "normal" && saveRecipeShelfLife,
        save_recipe_raw_materials: mode === "normal" && saveRecipeRawMaterials,
      }));
      photos.forEach((photo) => formData.append("images", photo.file));
      const response = await fetch("/api/label-check/complete", { method: "POST", body: formData });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "判定を保存できません");
      setResult(json);
      setStage("result");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "判定を保存できません");
      setStage("review");
    }
  };

  const busy = stage === "preparing" || stage === "ocr" || stage === "matching" || stage === "saving";

  return (
    <main className="min-h-dvh bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-3 sm:px-5">
          <Link href="/system/label-check" className="inline-flex h-10 items-center gap-1 rounded-md px-2 text-sm font-bold text-slate-700 hover:bg-slate-100">
            <ArrowLeft className="h-4 w-4" />履歴
          </Link>
          <div className="text-center">
            <div className="text-sm font-bold">裏ラベルチェック</div>
            <div className="text-[11px] font-semibold text-slate-500">{mode === "simple" ? "簡易" : "通常"}</div>
          </div>
          <button type="button" onClick={() => reset()} className="grid h-10 w-10 place-items-center rounded-md text-slate-600 hover:bg-slate-100" aria-label="最初から" title="最初から"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-3 py-4 pb-[max(32px,env(safe-area-inset-bottom))] sm:px-5">
        {error && (
          <div className="mb-4 flex items-start gap-2 border border-red-300 bg-red-50 px-3 py-3 text-sm font-semibold text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {stage === "capture" && (
          <section>
            <div className="mb-4 inline-flex h-11 w-full overflow-hidden rounded-md border border-slate-300 bg-white p-0.5">
              <button type="button" onClick={() => reset("simple")} className={`flex flex-1 items-center justify-center gap-2 rounded text-sm font-bold ${mode === "simple" ? "bg-cyan-700 text-white" : "text-slate-600"}`}><Zap className="h-4 w-4" />簡易チェック</button>
              <button type="button" onClick={() => reset("normal")} className={`flex flex-1 items-center justify-center gap-2 rounded text-sm font-bold ${mode === "normal" ? "bg-violet-700 text-white" : "text-slate-600"}`}><ScanLine className="h-4 w-4" />通常チェック</button>
            </div>

            <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" multiple={mode === "normal"} onChange={(event) => { void addFiles(event.target.files); event.target.value = ""; }} />
            <input ref={galleryInput} type="file" accept="image/*" className="hidden" multiple={mode === "normal"} onChange={(event) => { void addFiles(event.target.files); event.target.value = ""; }} />

            <div className="border-y border-slate-200 bg-white py-7 text-center">
              <div className={`mx-auto grid h-16 w-16 place-items-center rounded-md ${mode === "simple" ? "bg-cyan-100 text-cyan-800" : "bg-violet-100 text-violet-800"}`}>
                {mode === "simple" ? <Zap className="h-8 w-8" /> : <Images className="h-8 w-8" />}
              </div>
              <h1 className="mt-4 text-xl font-bold">{mode === "simple" ? "ラベルを1枚撮影" : "ラベルを撮影"}</h1>
              <div className="mt-5 grid grid-cols-2 gap-2 px-3 sm:mx-auto sm:max-w-md">
                <button type="button" onClick={() => cameraInput.current?.click()} className={`inline-flex h-14 items-center justify-center gap-2 rounded-md text-base font-bold text-white ${mode === "simple" ? "bg-cyan-700 hover:bg-cyan-800" : "bg-violet-700 hover:bg-violet-800"}`}><Camera className="h-5 w-5" />撮影</button>
                <button type="button" onClick={() => galleryInput.current?.click()} className="inline-flex h-14 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white text-base font-bold hover:bg-slate-100"><FileImage className="h-5 w-5" />写真を選択</button>
              </div>
            </div>

            {mode === "normal" && photos.length > 0 && (
              <div className="mt-4">
                <PhotoGrid photos={photos} onRemove={removePhoto} />
                <div className="mt-3 flex gap-2">
                  {photos.length < 4 && <button type="button" onClick={() => cameraInput.current?.click()} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white text-sm font-bold"><Camera className="h-4 w-4" />追加撮影</button>}
                  <button type="button" onClick={() => void runOcr(photos, "normal")} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-violet-700 text-sm font-bold text-white"><Sparkles className="h-4 w-4" />{photos.length}枚を解析</button>
                </div>
              </div>
            )}
          </section>
        )}

        {busy && (
          <section className="grid min-h-[62dvh] place-items-center text-center">
            <div>
              <Loader2 className={`mx-auto h-12 w-12 animate-spin ${mode === "simple" ? "text-cyan-700" : "text-violet-700"}`} />
              <div className="mt-4 text-lg font-bold">{stage === "preparing" ? "画像を準備中" : stage === "ocr" ? "ラベルを読み取り中" : stage === "matching" ? "レシピを照合中" : "判定を保存中"}</div>
              <div className="mt-1 text-sm text-slate-500">そのままお待ちください</div>
            </div>
          </section>
        )}

        {stage === "review" && ocr && (
          <section className="space-y-5">
            <PhotoGrid photos={photos} />

            <div className="border-y border-slate-200 bg-white py-4">
              <div className="flex items-center justify-between gap-3 px-1">
                <h2 className="font-bold">読み取り結果</h2>
                {ocrElapsedMs !== null && <span className="text-xs font-semibold text-slate-500">OCR {(ocrElapsedMs / 1000).toFixed(1)}秒</span>}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="商品名" value={productName} onChange={setProductName} />
                <DateField label="印字賞味期限" value={expiryDate} onChange={setExpiryDate} required />
                <DateField label="製造日" value={manufacturingDate} onChange={setManufacturingDate} />
                {mode === "normal" && <div className="sm:col-span-2"><TextAreaField label="原材料名" value={rawMaterials} onChange={setRawMaterials} /></div>}
              </div>
              {ocr.warnings.length > 0 && <div className="mt-3 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-xs text-amber-900">{ocr.warnings.join(" / ")}</div>}
            </div>

            {mode === "normal" && (
              <div className="border-b border-slate-200 pb-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-bold">照合レシピ</h2>
                  <button type="button" onClick={() => setShowRecipeList((value) => !value)} className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-xs font-bold"><Search className="h-3.5 w-3.5" />一覧から選択</button>
                </div>
                {selectedRecipe && (
                  <div className="mt-3 flex items-center justify-between gap-3 border border-emerald-300 bg-emerald-50 px-3 py-3 text-sm">
                    <div className="min-w-0"><div className="truncate font-bold text-emerald-900">{selectedRecipe.recipe_name}</div><div className="mt-0.5 text-xs text-emerald-800">{selectedRecipe.shelf_life || "賞味期限期間未設定"}</div></div>
                    <button type="button" onClick={() => { setSelectedRecipe(null); setShelfLife(""); }} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-emerald-800" aria-label="選択解除"><X className="h-4 w-4" /></button>
                  </div>
                )}
                {!selectedRecipe && candidates.length > 0 && (
                  <div className="mt-3 divide-y divide-slate-200 border border-slate-200 bg-white">
                    {candidates.map((candidate) => (
                      <button key={candidate.recipe_id} type="button" onClick={() => chooseRecipe(candidate)} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-slate-50">
                        <div className="min-w-0"><div className="truncate text-sm font-bold">{candidate.recipe_name}</div><div className="mt-0.5 text-xs text-slate-500">{candidate.shelf_life || "期間未設定"} / 一致度 {Math.round(candidate.confidence * 100)}%</div></div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                      </button>
                    ))}
                  </div>
                )}
                {showRecipeList && (
                  <div className="mt-3 border border-slate-200 bg-white p-3">
                    <div className="flex gap-1 overflow-x-auto">
                      {RECIPE_CATEGORIES.map((category) => <button key={category} type="button" onClick={() => setRecipeCategory(category)} className={`h-9 whitespace-nowrap rounded px-3 text-xs font-bold ${recipeCategory === category ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}>{category}</button>)}
                    </div>
                    <label className="relative mt-3 block">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input value={recipeQuery} onChange={(event) => setRecipeQuery(event.target.value)} placeholder="レシピ名で検索" className="h-10 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm" />
                    </label>
                    <div className="mt-2 max-h-64 divide-y divide-slate-200 overflow-y-auto border-t border-slate-200">
                      {recipesLoading && <div className="py-6 text-center text-sm text-slate-500">読み込み中...</div>}
                      {!recipesLoading && recipes.map((recipe) => <button key={recipe.id} type="button" onClick={() => chooseRecipeRow(recipe)} className="flex w-full items-center justify-between gap-3 py-3 text-left"><span className="min-w-0 truncate text-sm font-semibold">{recipe.name}</span><span className="shrink-0 text-xs text-slate-500">{recipe.shelf_life || "未設定"}</span></button>)}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="border-b border-slate-200 pb-5">
              <h2 className="font-bold">賞味期限期間</h2>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {SHELF_LIFE_PRESETS.map((preset) => (
                  <button key={preset.value} type="button" onClick={() => setShelfLife(preset.value)} className={`h-12 rounded-md border text-sm font-bold ${shelfLife === preset.value ? "border-cyan-700 bg-cyan-700 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{preset.label}</button>
                ))}
              </div>
              <input value={shelfLife} onChange={(event) => setShelfLife(event.target.value)} placeholder="例：製造から1年" className="mt-2 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100" />
              {mode === "normal" && selectedRecipe && (
                <div className="mt-3 space-y-2 text-sm">
                  {(!selectedRecipe.shelf_life || selectedRecipe.shelf_life !== shelfLife) && <CheckOption checked={saveRecipeShelfLife} onChange={setSaveRecipeShelfLife} label="この期間をレシピへ保存" />}
                  {rawMaterials && <CheckOption checked={saveRecipeRawMaterials} onChange={setSaveRecipeRawMaterials} label="OCR原材料をレシピ照合情報へ保存" />}
                </div>
              )}
            </div>

            <button type="button" onClick={() => void completeCheck()} className={`inline-flex h-14 w-full items-center justify-center gap-2 rounded-md text-lg font-bold text-white ${mode === "simple" ? "bg-cyan-700 hover:bg-cyan-800" : "bg-violet-700 hover:bg-violet-800"}`}>
              <Check className="h-5 w-5" />判定する
            </button>
            <button type="button" onClick={() => reset()} className="h-11 w-full rounded-md border border-slate-300 bg-white text-sm font-bold text-slate-700">撮り直す</button>
          </section>
        )}

        {stage === "result" && result && (
          <section className="pt-4">
            <div className={`border-y py-8 text-center ${result.judgment === "OK" ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
              {result.judgment === "OK" ? <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-700" /> : <AlertTriangle className="mx-auto h-16 w-16 text-red-700" />}
              <div className={`mt-3 text-4xl font-black ${result.judgment === "OK" ? "text-emerald-800" : "text-red-800"}`}>{result.judgment}</div>
              <div className="mt-1 text-sm font-semibold text-slate-600">{productName || "裏ラベル"}</div>
            </div>
            <dl className="grid grid-cols-2 border-b border-slate-200 bg-white text-sm">
              <ResultCell label="印字賞味期限" value={expiryDate} />
              <ResultCell label="計算上の賞味期限" value={result.expected_expiry} />
              <ResultCell label="設定期間" value={`${result.shelf_life}（${result.shelf_life_days}日）`} />
              <ResultCell label="差異" value={`${result.deviation_days > 0 ? "+" : ""}${result.deviation_days}日 / ${result.deviation_percent}%`} />
            </dl>
            {result.warnings?.map((warning) => <div key={warning} className="mt-3 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900">{warning}</div>)}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Link href="/system/label-check" className="inline-flex h-12 items-center justify-center rounded-md border border-slate-300 bg-white text-sm font-bold">履歴を見る</Link>
              <button type="button" onClick={() => reset(mode)} className={`inline-flex h-12 items-center justify-center gap-2 rounded-md text-sm font-bold text-white ${mode === "simple" ? "bg-cyan-700" : "bg-violet-700"}`}>{mode === "simple" ? <Zap className="h-4 w-4" /> : <ScanLine className="h-4 w-4" />}続けてチェック</button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function PhotoGrid({ photos, onRemove }: { photos: Photo[]; onRemove?: (index: number) => void }) {
  return (
    <div className={`grid gap-2 ${photos.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
      {photos.map((photo, index) => (
        <div key={photo.url} className="relative aspect-[4/3] overflow-hidden rounded-md border border-slate-300 bg-slate-100">
          <Image src={photo.url} alt={`ラベル画像${index + 1}`} fill sizes="(max-width: 768px) 100vw, 360px" unoptimized className="object-contain" />
          {onRemove && <button type="button" onClick={() => onRemove(index)} className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-md bg-slate-950/75 text-white" aria-label="画像を削除"><X className="h-4 w-4" /></button>}
        </div>
      ))}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-xs font-bold text-slate-600">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950" /></label>;
}

function DateField({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label className="block text-xs font-bold text-slate-600">{label}{required && <span className="ml-1 text-red-600">必須</span>}<input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-950" /></label>;
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-xs font-bold text-slate-600">{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} className="mt-1 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-950" /></label>;
}

function CheckOption({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <label className="flex min-h-10 items-center gap-3"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-cyan-700" /><span className="font-medium text-slate-700">{label}</span></label>;
}

function ResultCell({ label, value }: { label: string; value: string }) {
  return <div className="min-h-24 border-b border-r border-slate-200 p-3 even:border-r-0"><dt className="text-xs font-semibold text-slate-500">{label}</dt><dd className="mt-2 break-words font-bold text-slate-900">{value || "-"}</dd></div>;
}

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("画像ファイルを選択してください");
  const image = await loadImage(file);
  const maxDimension = 1600;
  const ratio = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * ratio));
  const height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画像を処理できません");
  context.drawImage(image, 0, 0, width, height);

  let quality = 0.82;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > 900 * 1024 && quality > 0.46) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, quality);
  }
  canvas.width = 0;
  canvas.height = 0;
  const baseName = file.name.replace(/\.[^.]+$/, "") || "label";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("画像を読み込めません")); };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("画像を圧縮できません")), "image/jpeg", quality);
  });
}
