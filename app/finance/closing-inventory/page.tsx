"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, ExternalLink, RefreshCw } from "lucide-react";
import { inventoryFiscalLabel, inventoryFiscalYearOptions } from "@/lib/inventory-fiscal";
import type { ClosingInventoryReport } from "@/lib/finance/closing-inventory";

const statusLabel = (status: string) => status === "missing" ? "未作成" : status === "completed" ? "確定済み" : "入力中";
const yen = (amount: number | null) => amount === null ? "—" : `${amount.toLocaleString("ja-JP")}円`;
const button = "inline-flex items-center justify-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium disabled:opacity-50";

export default function ClosingInventoryPage() {
  const [report, setReport] = useState<ClosingInventoryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const load = useCallback(async (year?: number) => {
    const id = ++requestId.current;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/finance/closing-inventory${year ? `?fiscalYear=${year}` : ""}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "取得できませんでした");
      if (id === requestId.current) setReport(data);
    } catch (err) {
      if (id === requestId.current) { setReport(null); setError(err instanceof Error ? err.message : "取得できませんでした"); }
    } finally { if (id === requestId.current) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function exportExcel() {
    if (!report || loading) return;
    setExporting(true);
    try {
      const [{ buildClosingInventoryExcel }, XLSX] = await Promise.all([import("@/lib/finance/closing-inventory-excel"), import("xlsx")]);
      XLSX.writeFile(buildClosingInventoryExcel(report), `決算棚卸し一覧_${report.fiscalYear}年度.xlsx`);
    } catch { setError("Excelを作成できませんでした。再度お試しください。"); }
    finally { setExporting(false); }
  }
  return <div className="space-y-6 p-4 lg:p-8">
    <Link href="/finance/dashboard" className="inline-flex items-center gap-2 text-sm text-slate-600"><ArrowLeft size={16}/>財務分析システム</Link>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-bold">決算棚卸し一覧</h1><p className="mt-2 text-sm text-slate-600">各システムに保存した年度別の棚卸しをまとめて確認できます。</p></div>
      <div className="flex flex-wrap gap-2"><button className={button} disabled={loading} onClick={() => load(report?.fiscalYear)}><RefreshCw size={16} className={loading ? "animate-spin" : ""}/>最新情報に更新</button><button className={`${button} border-emerald-700 text-emerald-800`} disabled={!report || loading || exporting} onClick={exportExcel}><Download size={16}/>{exporting ? "作成中…" : "Excel作成"}</button></div>
    </header>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-800">{error}</p>}
    {report && <label className="flex flex-wrap items-center gap-3 font-medium">決算年度<select aria-label="決算年度" className="max-w-full rounded-lg border bg-white p-3" value={report.fiscalYear} disabled={loading} onChange={e => load(Number(e.target.value))}>{inventoryFiscalYearOptions([...report.years, report.fiscalYear]).map(year => <option key={year} value={year}>{inventoryFiscalLabel(year)}</option>)}</select></label>}
    {loading ? <p role="status" className="p-8 text-slate-500">棚卸しデータを取得しています…</p> : report && <>
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-600">{report.hasIncomplete ? "入力済み金額の合計（暫定）" : "棚卸金額の合計"}</p><p className="mt-2 text-3xl font-bold tabular-nums">{yen(report.total)}</p><p className="mt-2 text-xs text-slate-500">税込・税別・実売単価ベースの金額を合算</p></div>
        <div className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-600">確定済み</p><p className="mt-2 text-3xl font-bold">{report.rows.filter(row => row.status === "completed").length}<span className="text-base font-normal text-slate-500"> / {report.rows.length} 区分</span></p></div>
        <div className="rounded-xl border bg-white p-5"><p className="text-sm text-slate-600">未作成・入力中・要確認</p><p className="mt-2 text-3xl font-bold text-amber-700">{report.rows.filter(row => row.status !== "completed" || row.pendingCount || row.warning || row.amount === null).length}<span className="text-base font-normal"> 区分</span></p></div>
      </section>
      <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[950px] text-sm"><thead className="bg-slate-100 text-left"><tr>{["システム・棚卸し", "棚卸日", "状況", "金額基準", "棚卸金額", "確認事項", "元画面"].map(label => <th key={label} className="p-4 whitespace-nowrap">{label}</th>)}</tr></thead><tbody>{report.rows.map(row => <tr key={row.key} className="border-t align-top"><td className="p-4"><p className="text-xs text-slate-500">{row.system}</p><p className="mt-1 font-semibold">{row.label}</p></td><td className="p-4 whitespace-nowrap">{row.date ?? "—"}</td><td className="p-4 whitespace-nowrap"><span className={`rounded px-2 py-1 text-xs ${row.status === "completed" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{statusLabel(row.status)}</span></td><td className="p-4">{row.basis}</td><td className="p-4 text-right font-semibold tabular-nums whitespace-nowrap">{yen(row.amount)}</td><td className="max-w-60 p-4 text-amber-800">{row.warning || (row.status === "missing" ? "この年度の棚卸しは未作成です" : "—")}</td><td className="p-4"><Link href={row.href} target="_blank" rel="noopener noreferrer" aria-label={`${row.label}の元画面`} className="inline-flex items-center gap-1 whitespace-nowrap text-blue-700">開く<ExternalLink size={14}/></Link></td></tr>)}</tbody><tfoot className="border-t bg-slate-50 font-bold"><tr><td colSpan={4} className="p-4">{report.hasIncomplete ? "入力済み金額の合計（暫定）" : "合計"}</td><td className="p-4 text-right whitespace-nowrap">{yen(report.total)}</td><td colSpan={2}/></tr></tfoot></table></div>
      <div className="space-y-2 text-xs text-slate-500"><p>各元画面の金額基準を引き継ぎ、円未満を切り捨てて集計しています。未入力分は金額に含みません。Excelには一覧と各棚卸しの明細を出力します。</p><p>取得日時：{new Date(report.fetchedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}　元画面で保存した変更は「最新情報に更新」で反映されます。</p></div>
    </>}
  </div>;
}
