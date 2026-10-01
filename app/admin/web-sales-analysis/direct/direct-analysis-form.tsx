"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { webSalesAnalysisResultSchema } from "@/lib/web-sales-analysis/schema";

type PacketResponse = {
  month: string;
  packet: Record<string, unknown>;
  packetHash: string;
  saveRequestId: string;
  costWarnings: { productId: string; name: string; reason: string }[];
};

type SaveResponse = {
  status: string;
  analysisId: string;
  jobId: string;
  version: number;
  duplicate: boolean;
  tsgPostStatus: string;
};

export default function DirectAnalysisForm() {
  const [month, setMonth] = useState("2026-09");
  const [source, setSource] = useState<PacketResponse | null>(null);
  const [model, setModel] = useState("");
  const [resultJson, setResultJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState<SaveResponse | null>(null);
  const loadSequence = useRef(0);

  const loadPacket = useCallback(async (targetMonth: string) => {
    const sequence = ++loadSequence.current;
    setBusy(true);
    setMessage("");
    setSource(null);
    setSaved(null);
    try {
      const response = await fetch(`/api/web-sales/analysis/direct/packet?month=${encodeURIComponent(targetMonth)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `パケット取得に失敗しました (${response.status})`);
      if (sequence === loadSequence.current) setSource(body as PacketResponse);
    } catch (error) {
      if (sequence === loadSequence.current) setMessage(error instanceof Error ? error.message : "パケットを取得できませんでした");
    } finally {
      if (sequence === loadSequence.current) setBusy(false);
    }
  }, []);

  useEffect(() => { void loadPacket("2026-09"); }, [loadPacket]);

  async function save() {
    if (!source || source.month !== month || busy || saved) return;
    setMessage("");
    const trimmedModel = model.trim();
    if (!trimmedModel) {
      setMessage("実際に使用したモデル名を入力してください");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(resultJson);
    } catch {
      setMessage("分析結果は有効なJSONで入力してください");
      return;
    }
    const checked = webSalesAnalysisResultSchema.safeParse(parsed);
    if (!checked.success) {
      setMessage(`分析結果の形式が正しくありません: ${checked.error.issues[0]?.path.join(".")} ${checked.error.issues[0]?.message}`);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/web-sales/analysis/direct/save", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: source.month,
          requestId: source.saveRequestId,
          packetHash: source.packetHash,
          packet: source.packet,
          model: trimmedModel,
          data: checked.data,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `保存に失敗しました (${response.status})`);
      setSaved(body as SaveResponse);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存結果を確認できませんでした。同じ画面から再試行してください");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8 text-slate-900">
      <h1 className="text-2xl font-semibold">WEB売上月次分析の直接保存</h1>
      <p className="text-sm text-slate-600">管理者用。最新パケットを取得し、分析結果JSONだけを入力して保存します。</p>
      <div className="flex items-end gap-3">
        <label className="space-y-1 text-sm">対象月
          <input className="block rounded border px-3 py-2" type="month" value={month} disabled={busy} onChange={(event) => {
            loadSequence.current += 1;
            setMonth(event.target.value);
            setSource(null);
            setSaved(null);
            setBusy(false);
          }} />
        </label>
        <button className="rounded bg-slate-700 px-4 py-2 text-white disabled:opacity-50" type="button" disabled={busy || !month} onClick={() => void loadPacket(month)}>最新パケットを取得</button>
      </div>
      {source && (
        <div className="rounded border border-slate-300 bg-slate-50 p-4 text-sm">
          <p>対象月: {source.month} ／ パケットハッシュ: <code className="break-all">{source.packetHash}</code></p>
          <p>原価確認待ち: {source.costWarnings.length}商品。該当月の利益指標は未確定として扱います。</p>
          <p>取得後に元データが変わった場合、保存は拒否されます。分析し直してから最新パケットを取得してください。</p>
        </div>
      )}
      <label className="block space-y-1 text-sm">使用モデル
        <input className="block w-full rounded border px-3 py-2" value={model} maxLength={100} onChange={(event) => setModel(event.target.value)} placeholder="例: gpt-6.1-sol" />
      </label>
      <label className="block space-y-1 text-sm">分析結果JSON
        <textarea className="block min-h-96 w-full rounded border p-3 font-mono text-xs" value={resultJson} onChange={(event) => setResultJson(event.target.value)} spellCheck={false} placeholder="status, executive_summary, sales_analysis, expense_analysis, floor_staff_summary, actions, risks, data_quality を含むJSON" />
      </label>
      <button className="rounded bg-blue-700 px-5 py-2 text-white disabled:opacity-50" type="button" disabled={!source || source.month !== month || busy || Boolean(saved)} onClick={() => void save()}>{busy ? "処理中…" : "分析結果を保存"}</button>
      {message && <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{message}</p>}
      {saved && (
        <div role="status" className="rounded border border-green-300 bg-green-50 p-4 text-sm">
          <p>保存状態: {saved.status} ／ 第{saved.version}版 {saved.duplicate ? "（同一依頼の再確認）" : ""}</p>
          <p>分析ID: <code>{saved.analysisId}</code></p>
          <p>ジョブID: <code>{saved.jobId}</code> ／ TSG投稿: {saved.tsgPostStatus}</p>
        </div>
      )}
    </main>
  );
}
