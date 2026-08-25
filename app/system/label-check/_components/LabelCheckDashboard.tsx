"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Gauge,
  ImageIcon,
  RefreshCw,
  ScanLine,
  Search,
  X,
  Zap,
} from "lucide-react";

type HistoryRow = {
  id: string;
  mode: "simple" | "normal";
  file_name: string | null;
  product_name: string | null;
  expiry_date_printed: string | null;
  expiry_date_normalized: string | null;
  manufacturing_date: string | null;
  matched_recipe_name: string | null;
  shelf_life: string | null;
  expected_expiry: string | null;
  judgment: "OK" | "NG" | "UNKNOWN" | "MANUAL";
  deviation_percent: number | null;
  deviation_days: number | null;
  worker_name: string | null;
  checked_by: string | null;
  created_at: string;
  image_id: string | null;
  image_count: number;
};

type DashboardResponse = {
  rows: HistoryRow[];
  stats: { total: number; ok: number; ng: number; unknown: number; simple: number; normal: number };
  pagination: { page: number; total: number; total_pages: number };
};

const initialData: DashboardResponse = {
  rows: [],
  stats: { total: 0, ok: 0, ng: 0, unknown: 0, simple: 0, normal: 0 },
  pagination: { page: 1, total: 0, total_pages: 1 },
};

export default function LabelCheckDashboard() {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [mode, setMode] = useState("all");
  const [judgment, setJudgment] = useState("all");
  const [page, setPage] = useState(1);
  const [previewImageId, setPreviewImageId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), per_page: "20" });
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (mode !== "all") params.set("mode", mode);
      if (judgment !== "all") params.set("judgment", judgment);
      const response = await fetch(`/api/label-check?${params}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "履歴を取得できません");
      setData(json);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "履歴を取得できません");
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, judgment, mode, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-4 text-slate-950 sm:px-5 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-cyan-100 text-cyan-800">
              <Gauge className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold sm:text-2xl">裏ラベルチェック</h1>
              <p className="mt-0.5 text-sm text-slate-600">賞味期限の判定履歴</p>
            </div>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Link
              href="/system/label-check/check?mode=normal"
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold hover:bg-slate-100 sm:flex-none"
            >
              <ScanLine className="h-4 w-4" />通常チェック
            </Link>
            <Link
              href="/system/label-check/check?mode=simple"
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-cyan-700 px-4 text-sm font-bold text-white hover:bg-cyan-800 sm:flex-none"
            >
              <Zap className="h-4 w-4" />簡易チェック
            </Link>
          </div>
        </header>

        <section className="grid border-b border-slate-200 sm:grid-cols-2 lg:grid-cols-4">
          <Summary label="全履歴" value={data.stats.total} detail={`簡易 ${data.stats.simple} / 通常 ${data.stats.normal}`} tone="slate" />
          <Summary label="OK" value={data.stats.ok} detail="許容範囲内" tone="green" />
          <Summary label="NG" value={data.stats.ng} detail="要確認" tone="red" />
          <Summary label="未判定" value={data.stats.unknown} detail="レシピ・日付未確定" tone="amber" />
        </section>

        <section className="flex flex-col gap-3 border-b border-slate-200 py-4 lg:flex-row lg:items-center">
          <label className="relative block min-w-0 flex-1 lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="商品名・レシピ名・作業者で検索"
              className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
            />
          </label>
          <Segmented
            value={mode}
            onChange={(value) => { setMode(value); setPage(1); }}
            options={[{ value: "all", label: "全方式" }, { value: "simple", label: "簡易" }, { value: "normal", label: "通常" }]}
          />
          <Segmented
            value={judgment}
            onChange={(value) => { setJudgment(value); setPage(1); }}
            options={[{ value: "all", label: "全判定" }, { value: "OK", label: "OK" }, { value: "NG", label: "NG" }, { value: "UNKNOWN", label: "未判定" }]}
          />
          <button
            type="button"
            onClick={() => void load()}
            aria-label="更新"
            title="更新"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-slate-300 bg-white hover:bg-slate-100"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </section>

        {error && <div className="mt-4 border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div>}

        <section className="py-4">
          <div className="overflow-x-auto border border-slate-200 bg-white">
            <table className="w-full min-w-[940px] border-collapse text-sm">
              <thead className="bg-slate-100 text-left text-xs font-semibold text-slate-600">
                <tr>
                  <th className="w-20 px-3 py-3">画像</th>
                  <th className="px-3 py-3">実行日時・方式</th>
                  <th className="px-3 py-3">商品・レシピ</th>
                  <th className="px-3 py-3">印字賞味期限</th>
                  <th className="px-3 py-3">設定期間</th>
                  <th className="px-3 py-3">計算日</th>
                  <th className="px-3 py-3">判定</th>
                  <th className="px-3 py-3">作業者</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.rows.map((row) => (
                  <tr key={row.id} className="align-middle hover:bg-slate-50">
                    <td className="px-3 py-2">
                      {row.image_id ? (
                        <button
                          type="button"
                          onClick={() => setPreviewImageId(row.image_id)}
                          className="relative block h-14 w-14 overflow-hidden rounded border border-slate-300 bg-slate-100"
                          aria-label="画像を表示"
                        >
                          <Image src={`/api/label-check/image/${row.image_id}`} alt="裏ラベル" fill sizes="56px" unoptimized className="object-cover" />
                          <span className="absolute inset-0 grid place-items-center bg-slate-950/0 text-white opacity-0 transition hover:bg-slate-950/45 hover:opacity-100"><Eye className="h-5 w-5" /></span>
                        </button>
                      ) : (
                        <span className="grid h-14 w-14 place-items-center rounded border border-dashed border-slate-300 text-slate-400"><ImageIcon className="h-5 w-5" /></span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <div className="font-semibold">{formatDate(row.created_at)}</div>
                      <span className={`mt-1 inline-flex rounded border px-1.5 py-0.5 text-[11px] font-bold ${row.mode === "simple" ? "border-sky-300 bg-sky-50 text-sky-800" : "border-violet-300 bg-violet-50 text-violet-800"}`}>
                        {row.mode === "simple" ? "簡易" : "通常"}
                      </span>
                    </td>
                    <td className="max-w-[300px] px-3 py-3">
                      <div className="truncate font-semibold">{row.product_name || row.file_name || "品名不明"}</div>
                      <div className="mt-1 truncate text-xs text-slate-500">{row.matched_recipe_name || "レシピ照合なし"}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 font-medium">{row.expiry_date_normalized || row.expiry_date_printed || "-"}</td>
                    <td className="whitespace-nowrap px-3 py-3">{row.shelf_life || "-"}</td>
                    <td className="whitespace-nowrap px-3 py-3">{row.expected_expiry || "-"}</td>
                    <td className="px-3 py-3"><JudgmentBadge value={row.judgment} /></td>
                    <td className="max-w-[180px] truncate px-3 py-3 font-semibold text-slate-700">{row.worker_name || "未記録（旧データ）"}</td>
                  </tr>
                ))}
                {!loading && data.rows.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">該当する履歴はありません。</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-slate-600">{data.pagination.total.toLocaleString()}件</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1}
                className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 bg-white disabled:opacity-40"
                aria-label="前のページ"
              ><ChevronLeft className="h-4 w-4" /></button>
              <span className="min-w-20 text-center font-semibold">{page} / {data.pagination.total_pages}</span>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(data.pagination.total_pages, value + 1))}
                disabled={page >= data.pagination.total_pages}
                className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 bg-white disabled:opacity-40"
                aria-label="次のページ"
              ><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </section>
      </div>

      {previewImageId && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-3" onClick={() => setPreviewImageId(null)}>
          <div className="relative h-[88dvh] w-full max-w-4xl overflow-hidden rounded-md bg-white" onClick={(event) => event.stopPropagation()}>
            <Image src={`/api/label-check/image/${previewImageId}`} alt="裏ラベル拡大" fill sizes="(max-width: 896px) 100vw, 896px" unoptimized className="object-contain" />
            <button type="button" onClick={() => setPreviewImageId(null)} className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-md bg-slate-950/80 text-white" aria-label="閉じる"><X className="h-5 w-5" /></button>
          </div>
        </div>
      )}
    </main>
  );
}

function Summary({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: "slate" | "green" | "red" | "amber" }) {
  const colors = { slate: "text-slate-800", green: "text-emerald-700", red: "text-red-700", amber: "text-amber-700" };
  const Icon = tone === "green" ? CheckCircle2 : tone === "red" ? AlertTriangle : tone === "amber" ? AlertTriangle : Gauge;
  return (
    <div className="border-b border-slate-200 px-4 py-5 sm:border-r lg:border-b-0 lg:last:border-r-0">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Icon className={`h-4 w-4 ${colors[tone]}`} />{label}</div>
      <div className={`mt-2 text-2xl font-bold ${colors[tone]}`}>{value.toLocaleString()}件</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div className="inline-flex h-10 overflow-hidden rounded-md border border-slate-300 bg-white p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`min-w-14 rounded px-2 text-xs font-bold transition ${value === option.value ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >{option.label}</button>
      ))}
    </div>
  );
}

function JudgmentBadge({ value }: { value: HistoryRow["judgment"] }) {
  if (value === "OK") return <span className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" />OK</span>;
  if (value === "NG") return <span className="inline-flex items-center gap-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-bold text-red-800"><AlertTriangle className="h-3.5 w-3.5" />NG</span>;
  return <span className="inline-flex rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">未判定</span>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
