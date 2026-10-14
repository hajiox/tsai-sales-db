"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ClipboardList, Loader2, RefreshCw } from "lucide-react";

export const STAFF_DRAFTS_ENDPOINT = "/api/recipe/char-siu-production/staff-drafts";

export type StaffProductionDraft = {
  id: string;
  revision: number;
  status: "draft" | "needs_review" | "completed";
  input: {
    productionDate: string;
    packagingDate: string | null;
    cookingWorkerCount?: number | null;
    cookingWorkHours?: number | null;
    packagingWorkerCount?: number | null;
    packagingWorkHours?: number | null;
    materials: Array<{ key: string; usageAmount: number | null }>;
    outputs: Array<{ key: string; quantity: number | null }>;
    notes: string;
  };
  deviceId: string;
  operatorName: string;
  connectionId: string;
  connectionLabel: string;
  scanId: string | null;
  runId: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  completedAt: string | null;
  photos: Array<{ id: string; fileName: string; mimeType: string; size: number; scanStatus: string | null; url: string }>;
};

export function staffPhotoUrl(draftId: string, photo: StaffProductionDraft["photos"][number]): string | null {
  const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
  if (!uuid.test(draftId) || !uuid.test(photo.id)) return null;
  const expected = `${STAFF_DRAFTS_ENDPOINT}/${encodeURIComponent(draftId)}/photos/${encodeURIComponent(photo.id)}`;
  return photo.url === expected ? expected : null;
}

export default function StaffProductionDraftsPanel({ selectedId, busy, refreshKey, onSelect }: {
  selectedId: string | null;
  busy: boolean;
  refreshKey: number;
  onSelect: (draft: StaffProductionDraft) => void | Promise<void>;
}) {
  const [drafts, setDrafts] = useState<StaffProductionDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(STAFF_DRAFTS_ENDPOINT, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.drafts)) throw new Error(data.error || "スタッフ記録を取得できませんでした");
      if (sequence === requestSequence.current) setDrafts(data.drafts);
    } catch (cause) {
      if (sequence === requestSequence.current) setError(cause instanceof Error ? cause.message : "スタッフ記録を取得できませんでした");
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  const openDraft = async (draft: StaffProductionDraft) => {
    if (busy || openingId || draft.status === "completed") return;
    setOpeningId(draft.id);
    try { await onSelect(draft); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "スタッフ記録を開けませんでした"); }
    finally { setOpeningId(null); }
  };
  const counts = {
    draft: drafts.filter((item) => item.status === "draft").length,
    needsReview: drafts.filter((item) => item.status === "needs_review").length,
    completed: drafts.filter((item) => item.status === "completed").length,
  };

  return (
    <details className="rounded-md border border-slate-200 bg-white lg:rounded-none">
      <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-800 sm:px-5">
        <ClipboardList className="mr-2 inline h-4 w-4" />
        スタッフ記録
        <span className="ml-3 text-xs font-normal text-slate-500">下書き {counts.draft} / 要単価確認 {counts.needsReview} / 正式登録済み {counts.completed}</span>
      </summary>
      <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs leading-5 text-slate-500">提出済み記録の単価を確認して正式登録します。工程・数量の修正はスタッフ側で行い、再提出してください。</p>
          <button type="button" onClick={() => void load()} disabled={loading || busy || !!openingId} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-xs font-semibold disabled:opacity-40">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}一覧を更新
          </button>
        </div>
        {error && <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-red-700"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</p>}
        {!loading && !error && drafts.length === 0 && <p className="py-5 text-center text-sm text-slate-500">スタッフ記録はありません</p>}
        {loading && drafts.length === 0 && <p role="status" className="py-5 text-center text-sm text-slate-500">スタッフ記録を読み込んでいます</p>}
        <div className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto">
          {drafts.map((draft) => (
            <div key={draft.id} className={`py-3 ${selectedId === draft.id ? "border-l-2 border-cyan-600 pl-3" : ""}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <span className={`mr-2 rounded px-2 py-0.5 text-xs font-bold ${draft.status === "needs_review" ? "bg-amber-100 text-amber-900" : draft.status === "completed" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                    {draft.status === "needs_review" ? "要単価確認" : draft.status === "completed" ? "正式登録済み" : "下書き・提出待ち"}
                  </span>
                  <span className="text-sm font-semibold text-slate-800">煮込み {draft.input.productionDate || "未入力"} / 包装 {draft.input.packagingDate || "未入力"}</span>
                  <p className="mt-1 break-all text-xs text-slate-500">入力者（申告）: {draft.operatorName} / {draft.connectionLabel} / 端末 {draft.deviceId}</p>
                  {draft.photos.length > 0 && <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {draft.photos.map((photo) => {
                      const url = staffPhotoUrl(draft.id, photo);
                      return url ? <a key={photo.id} href={url} target="_blank" rel="noopener noreferrer" className="text-cyan-800 underline">原本: {photo.fileName}</a> : <span key={photo.id} className="text-slate-500">{photo.fileName}</span>;
                    })}
                  </div>}
                </div>
                <button type="button" onClick={() => void openDraft(draft)} disabled={busy || !!openingId || draft.status === "completed"} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold disabled:opacity-40">
                  {openingId === draft.id && <Loader2 className="h-4 w-4 animate-spin" />}
                  {draft.status === "completed" ? "登録済み" : selectedId === draft.id ? "再読込して確認" : draft.status === "draft" ? "下書きを確認" : "単価を確認して登録"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}
