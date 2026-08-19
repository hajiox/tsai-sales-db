"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, Camera, CheckCircle2, FileImage, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

type ScanResult = {
  id: string;
  targetProductionDate: string | null;
  items: Array<{ key: string; name: string; recognized: boolean; sourceItemName: string | null }>;
};

const todayInJapan = () => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

export default function CharSiuDeliveryNoteMobilePage() {
  const router = useRouter();
  const [productionDate, setProductionDate] = useState(todayInJapan);
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  useEffect(() => {
    const date = new URLSearchParams(window.location.search).get("productionDate");
    if (/^\d{4}-\d{2}-\d{2}$/.test(date || "")) setProductionDate(date!);
  }, []);

  const selectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []).slice(0, 4);
    event.target.value = "";
    setFiles(selected);
    setResult(null);
  };

  const send = async () => {
    if (!productionDate) return toast.error("製造日を入力してください");
    if (!files.length) return toast.error("納品書を撮影してください");
    setSending(true);
    try {
      const preparedFiles = await Promise.all(files.map((file, index) => compressDeliveryNoteImage(file, index)));
      if (preparedFiles.reduce((sum, file) => sum + file.size, 0) > 3.5 * 1024 * 1024) {
        throw new Error("写真の合計容量が大きすぎます。枚数を減らして再撮影してください");
      }
      const body = new FormData();
      body.set("targetProductionDate", productionDate);
      preparedFiles.forEach((file) => body.append("files", file));
      const response = await fetch("/api/recipe/char-siu-production/invoice-scan", { method: "POST", body });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "納品書を送信できませんでした");
      setResult(data.scan);
      toast.success("PCのチャーシュー製造原価入力へ送信しました");
    } catch (error: any) {
      toast.error(error.message || "納品書を送信できませんでした");
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    setFiles([]);
    setResult(null);
  };

  return (
    <main className="fixed inset-0 z-50 overflow-y-auto bg-slate-50 px-4 py-4">
      <div className="mx-auto max-w-lg space-y-4">
        <header className="flex items-center gap-3 border-b border-slate-300 pb-4">
          <button
            type="button"
            onClick={() => router.push("/recipe/char-siu-production")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700"
            aria-label="チャーシュー製造原価入力へ戻る"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-950">納品書をスマホで撮影</h1>
            <p className="mt-0.5 text-xs text-slate-500">豚バラ肉・ネギ・生姜の仕入情報をPCへ送信</p>
          </div>
        </header>

        <section className="border border-slate-200 bg-white p-4">
          <label htmlFor="target-production-date" className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
            <CalendarDays className="h-4 w-4" />
            使用する製造日
          </label>
          <input
            id="target-production-date"
            type="date"
            value={productionDate}
            onChange={(event) => setProductionDate(event.target.value)}
            className="h-12 w-full rounded-md border border-slate-300 px-3 text-base font-semibold outline-none focus:border-slate-700"
          />
        </section>

        <section className="border border-slate-200 bg-white p-4">
          <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center border-2 border-dashed border-amber-300 bg-amber-50 px-4 py-6 text-center">
            <Camera className="h-8 w-8 text-amber-700" />
            <span className="mt-3 text-base font-bold text-slate-900">納品書を撮影</span>
            <span className="mt-1 text-xs text-slate-500">複数ページは4枚までまとめて選択できます</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              disabled={sending}
              onChange={selectFiles}
              className="sr-only"
            />
          </label>
          {files.length > 0 && (
            <div className="mt-3 space-y-2">
              {files.map((file) => (
                <div key={`${file.name}-${file.lastModified}`} className="flex min-w-0 items-center gap-2 border-b border-slate-100 pb-2 text-sm text-slate-700 last:border-0">
                  <FileImage className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="truncate">{file.name}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {result && (
          <section className="border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 font-bold text-emerald-900">
              <CheckCircle2 className="h-5 w-5" />
              PCへ送信済み
            </div>
            <p className="mt-1 text-xs text-emerald-800">PC側に確認モーダルが表示されます。単価と数量を確認してください。</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {result.items.map((item) => (
                <div key={item.key} className="bg-white px-2 py-2 text-center text-xs">
                  <div className="font-bold text-slate-800">{item.name}</div>
                  <div className={item.recognized ? "mt-1 text-emerald-700" : "mt-1 text-red-600"}>
                    {item.recognized ? "読取済み" : "要確認"}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-[auto_1fr] gap-2 pb-6">
          <button
            type="button"
            onClick={reset}
            disabled={sending}
            className="flex h-12 w-12 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 disabled:opacity-50"
            aria-label="入力をクリア"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={send}
            disabled={sending || !files.length || !productionDate}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-slate-950 px-5 text-base font-bold text-white disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
            {sending ? "AI読取・送信中" : "PCへ送信"}
          </button>
        </div>
      </div>
    </main>
  );
}

async function compressDeliveryNoteImage(file: File, index: number) {
  const targetBytes = 800 * 1024;
  if (file.size <= targetBytes && ["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`${file.name}を圧縮できませんでした。JPEGで撮影してください`));
      element.src = objectUrl;
    });
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    let width = Math.max(1, Math.round(image.naturalWidth * scale));
    let height = Math.max(1, Math.round(image.naturalHeight * scale));
    let quality = 0.8;
    let blob: Blob | null = null;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("写真を圧縮できませんでした");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      blob = await canvasToJpeg(canvas, quality);
      if (blob.size <= targetBytes) break;
      width = Math.max(1, Math.round(width * 0.82));
      height = Math.max(1, Math.round(height * 0.82));
      quality = Math.max(0.55, quality - 0.08);
    }
    if (!blob) throw new Error("写真を圧縮できませんでした");
    const baseName = file.name.replace(/\.[^.]+$/, "").slice(0, 100) || `delivery-note-${index + 1}`;
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("写真を圧縮できませんでした")), "image/jpeg", quality);
  });
}
