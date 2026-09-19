"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell } from "recharts";
import { ACTIONS, CHANNELS, METRICS, comparable, type Snapshot, type SnapshotSummary, type ImportInput, type Analysis, type Rank } from "@/lib/web-sales-abcd/model";

type Mapping = { key: string; name: string; access: string; conversions: string; sales: string; profit: string; state: string };
type Action = { id: string; product_key: string; action_date: string; description: string };
const fields = { key: "商品ID・商品コード", name: "商品名", access: "アクセス（分母）", conversions: "購入実績（分子）", sales: "売上金額（任意）", profit: "利益金額（任意）", state: "状態（任意）" };
const colors: Record<Rank, string> = { A: "#059669", B: "#d97706", C: "#2563eb", D: "#7c3aed", 保留: "#64748b" };
const inputClass = "rounded border border-slate-300 px-3 py-2 bg-white text-slate-900 w-full";
const buttonClass = "rounded border border-slate-300 px-4 py-2 bg-white hover:bg-slate-50 disabled:opacity-50";
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
const format = (n: number | null, digits = 0) => n == null ? "未取得" : n.toLocaleString("ja-JP", { maximumFractionDigits: digits });
async function api(url: string, body?: unknown) {
  const response = await fetch(url, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "取得に失敗しました");
  return data;
}
const initialSettings = (): Omit<ImportInput, "items"> => {
  const now = new Date(); const end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 0)).toISOString().slice(0, 10);
  return { channel: "amazon", start: end.slice(0, 7) + "-01", end, metric: "units_sessions", source: "", scope: "商品別・全流入", coverage: "all", minimumAccess: 100, accessThreshold: null, cvrThreshold: null };
};

export default function AbcdPage() {
  const [channel, setChannel] = useState<ImportInput["channel"]>("amazon");
  const [history, setHistory] = useState<SnapshotSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [previous, setPrevious] = useState<Snapshot | null>(null);
  const [previousId, setPreviousId] = useState("");
  const [actions, setActions] = useState<Action[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [settings, setSettings] = useState(initialSettings);
  const [csv, setCsv] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [metadata, setMetadata] = useState("");
  const [mapping, setMapping] = useState<Mapping>({ key: "", name: "", access: "", conversions: "", sales: "", profit: "", state: "" });
  const [preview, setPreview] = useState<{ input: ImportInput; analysis: Analysis } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [rankFilter, setRankFilter] = useState("全て");
  const [search, setSearch] = useState("");
  const [productKey, setProductKey] = useState("");
  const [actionDate, setActionDate] = useState(today);
  const [description, setDescription] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(""); setSnapshot(null); setSelected(""); setPrevious(null); setPreviousId(""); setActions([]); setHistory([]);
    setSettings(s => ({ ...s, channel, metric: channel === "amazon" ? "units_sessions" : channel === "base" || channel === "qoo10" ? "orders_views" : channel === "tiktok" ? "buyers_visitors" : "orders_visitors" }));
    setCsv(""); setHeaders([]); setPreview(null); setConfirmed(false);
    api(`/api/web-sales/abcd?channel=${channel}`).then(data => {
      if (!cancelled) { setHistory(data.snapshots); setSelected(data.snapshots[0]?.id || ""); }
    }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [channel]);
  useEffect(() => {
    let cancelled = false;
    setSnapshot(null); setActions([]); setPreviousId(""); setPrevious(null); setProductKey("");
    if (!selected) return;
    setLoading(true);
    api(`/api/web-sales/abcd?id=${selected}`).then(data => {
      if (!cancelled) { setSnapshot(data.snapshot); setActions(data.actions); }
    }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);
  useEffect(() => {
    let cancelled = false; setPrevious(null);
    if (!previousId) return;
    api(`/api/web-sales/abcd?id=${previousId}`).then(data => { if (!cancelled) setPrevious(data.snapshot); }).catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [previousId]);
  useEffect(() => { setPreview(null); setConfirmed(false); }, [settings, mapping, csv]);

  const analysis = snapshot?.payload.analysis;
  const comparisonOk = snapshot && previous && comparable(snapshot, previous);
  const previousItems = useMemo(() => new Map(previous?.payload.analysis.items.map(i => [i.key, i]) || []), [previous]);
  const filtered = useMemo(() => (analysis?.items || []).filter(i => (rankFilter === "全て" || rankFilter === i.rank) && `${i.key} ${i.name}`.toLowerCase().includes(search.toLowerCase())), [analysis, rankFilter, search]);
  const points = filtered.filter(i => i.access != null && i.cvr != null);

  async function run(work: () => Promise<void>) { setBusy(true); setError(""); setNotice(""); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "処理に失敗しました"); } finally { setBusy(false); } }
  async function loadFile(file: File, encoding: string) {
    if (file.size > 3_000_000) throw new Error("CSVは3MB以下にしてください");
    const text = new TextDecoder(encoding).decode(await file.arrayBuffer());
    const data = await api("/api/web-sales/abcd", { mode: "inspect", csv: text });
    setCsv(text); setHeaders(data.headers); setMapping(data.mapping); setMetadata(data.metadata);
    setSettings(s => ({ ...s, source: file.name }));
    setNotice(`${data.rowCount}件を読み込みました。列・期間・指標を確認してください。`);
  }
  async function exportExcel() {
    if (!snapshot) return;
    const XLSX = await import("xlsx");
    const book = XLSX.utils.book_new();
    const rows = snapshot.payload.analysis.items.map(i => ({ 商品ID: i.key, 商品名: i.name, 分類: i.rank, 前回分類: comparisonOk ? previousItems.get(i.key)?.rank || "前回未取得" : "比較なし", アクセス: i.access, 購入実績: i.conversions, "購入率(%)": i.cvr, 売上金額: i.sales, 利益金額: i.profit, 販売状態: i.state, 保留理由: i.reason, 対応候補: i.action }));
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), "商品ABCD分析");
    const s = snapshot.payload.input; const a = snapshot.payload.analysis;
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ["EC", CHANNELS[s.channel]], ["対象期間", s.start, s.end], ["取得元", s.source], ["集計範囲", s.scope], ["取得範囲", s.coverage === "all" ? "全商品" : "一部商品のみ"], ["指標", METRICS[s.metric]], ["最低アクセス", s.minimumAccess], ["アクセス基準", a.accessThreshold], ["購入率基準(%)", a.cvrThreshold], ["ルール", a.ruleVersion], ["保存日時", snapshot.created_at], ["比較対象", comparisonOk ? `${previous!.period_start}〜${previous!.period_end}` : "なし"], ["注意", "率は元の分子・分母から計算。未取得は空欄。利益はCSVで指定した定義。分類は因果関係を示すものではありません。"],
    ]), "条件・定義");
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(actions.map(a => ({ 商品ID: a.product_key, 実施日: a.action_date, 改善内容: a.description }))), "改善履歴");
    XLSX.writeFile(book, `ABCD_${channel}_${s.start}_${s.end}.xlsx`);
  }

  return <div className="p-4 md:p-8 space-y-6 max-w-[1600px] mx-auto text-slate-900">
    <div className="flex flex-wrap justify-between gap-3 items-start"><div><Link className="text-sm text-blue-700" href="/web-sales/dashboard">← WEB販売管理</Link><h1 className="text-2xl font-bold mt-2">商品ABCD分析</h1><p className="text-slate-600 mt-1">アクセスと購入率から、商品ごとの改善優先度を確認します。</p></div><button className={buttonClass} onClick={() => setShowImport(v => !v)}>{showImport ? "取込を閉じる" : "分析CSVを取り込む"}</button></div>
    {error && <div role="alert" className="bg-red-50 border border-red-200 p-4 rounded text-red-800">{error}</div>}
    {notice && <div role="status" className="bg-blue-50 p-3 rounded">{notice}</div>}
    <div className="flex flex-wrap gap-4 items-end"><label>EC<select aria-label="EC" className={inputClass} value={channel} disabled={busy} onChange={e => setChannel(e.target.value as typeof channel)}>{Object.entries(CHANNELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><label className="flex-1 min-w-64">保存済み分析（新しい対象期間順・最大100件）<select className={inputClass} value={selected} disabled={busy || loading} onChange={e => setSelected(e.target.value)}><option value="">分析を選択</option>{history.map(h => <option key={h.id} value={h.id}>{h.period_start}〜{h.period_end} / {h.item_count}商品 / 保存 {new Date(h.created_at).toLocaleString("ja-JP")}</option>)}</select></label></div>
    {channel === "mercari" && <p className="p-3 bg-amber-50">メルカリShopsのショップ全体の訪問者数は使えません。商品別・同一期間のアクセスが取得できる場合だけ取り込んでください。</p>}
    {channel === "base" && <p className="p-3 bg-amber-50">BASEの商品別閲覧数はWeb・Pay ID合算です。分子も同じ範囲に揃え、ページ閲覧数ベースの参考率として扱ってください。</p>}
    {showImport && <section className="border rounded-xl p-5 bg-slate-50 space-y-4">
      <h2 className="font-bold text-lg">商品別データの取込</h2><p className="text-sm">公式の分析CSVを選び、商品ID・商品名・アクセス・購入実績の列を対応させます。売上0の商品も残します。購入率の列ではなく、その分子の件数・点数を指定してください。</p>
      <div className="flex flex-wrap gap-4"><label>UTF-8 CSV<input className="block" type="file" accept=".csv" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void run(() => loadFile(file, "utf-8")); e.target.value = ""; }} /></label><label>文字化けする場合：Shift_JIS CSV<input className="block" type="file" accept=".csv" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void run(() => loadFile(file, "shift_jis")); e.target.value = ""; }} /></label></div>
      <p className="text-sm text-slate-600">共通CSVの列名例：商品ID, 商品名, アクセス数, 注文件数, 売上金額, 利益, 状態。状態は「通常」「新商品」「欠品」。未取得は空欄、実測0は0。</p>
      {metadata && <pre className="text-xs whitespace-pre-wrap p-2 bg-white border">{metadata}</pre>}
      <div className="grid md:grid-cols-3 gap-3">
        <label>開始日<input type="date" className={inputClass} value={settings.start} onChange={e => setSettings({ ...settings, start: e.target.value })} /></label><label>終了日<input type="date" className={inputClass} value={settings.end} onChange={e => setSettings({ ...settings, end: e.target.value })} /></label>
        <label>指標の定義<select className={inputClass} value={settings.metric} onChange={e => setSettings({ ...settings, metric: e.target.value as ImportInput["metric"] })}>{Object.entries(METRICS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
        <label>取得元・帳票名<input className={inputClass} value={settings.source} maxLength={200} onChange={e => setSettings({ ...settings, source: e.target.value })} /></label>
        <label>集計範囲（商品ページ/SKU・流入範囲等）<input className={inputClass} value={settings.scope} maxLength={200} onChange={e => setSettings({ ...settings, scope: e.target.value })} /></label>
        <label>取得範囲<select className={inputClass} value={settings.coverage} onChange={e => setSettings({ ...settings, coverage: e.target.value as "all" | "partial" })}><option value="all">全商品（売上0を含む）</option><option value="partial">一部商品のみ</option></select></label>
        <label>判定に必要な最低アクセス<input className={inputClass} type="number" min={1} value={settings.minimumAccess} onChange={e => setSettings({ ...settings, minimumAccess: Number(e.target.value) })} /></label>
        <label>アクセス基準（空欄：対象商品の中央値）<input className={inputClass} type="number" min={1} value={settings.accessThreshold ?? ""} onChange={e => setSettings({ ...settings, accessThreshold: e.target.value ? Number(e.target.value) : null })} /></label>
        <label>購入率基準 %（空欄：分子合計÷分母合計）<input className={inputClass} type="number" min={0.0001} step="any" value={settings.cvrThreshold ?? ""} onChange={e => setSettings({ ...settings, cvrThreshold: e.target.value ? Number(e.target.value) : null })} /></label>
      </div>
      <p className="text-xs text-slate-600">自動基準は通常販売かつ最低アクセスを満たす2商品以上から算出。購入実績が全て0の場合は購入率基準を指定するまで保留。最低アクセス100は初期値で、各ECの実績に合わせて変更できます。</p>
      {!!headers.length && <div className="grid md:grid-cols-4 gap-3">{Object.entries(fields).map(([key, label]) => <label key={key}>{label}<select className={inputClass} value={mapping[key as keyof Mapping]} onChange={e => setMapping({ ...mapping, [key]: e.target.value })}><option value="">列を選択</option>{headers.map(h => <option key={h}>{h}</option>)}</select></label>)}</div>}
      <button className={buttonClass} disabled={busy || !csv} onClick={() => void run(async () => { setPreview(await api("/api/web-sales/abcd", { mode: "preview", csv, mapping, settings })); })}>分類をプレビュー</button>
      {preview && <div className="bg-white p-4 border rounded space-y-3"><p>{preview.analysis.items.length}商品：{(["A", "B", "C", "D", "保留"] as Rank[]).map(r => `${r} ${preview.analysis.items.filter(i => i.rank === r).length}件`).join(" / ")}</p><p>アクセス基準 {format(preview.analysis.accessThreshold, 2)} / 購入率基準 {format(preview.analysis.cvrThreshold, 3)}%</p><div className="max-h-64 overflow-auto"><table className="w-full text-sm"><thead><tr><th>商品</th><th>アクセス</th><th>購入実績</th><th>分類</th><th>理由</th></tr></thead><tbody>{preview.analysis.items.slice(0, 100).map(i => <tr key={i.key}><td>{i.name}</td><td>{format(i.access)}</td><td>{format(i.conversions)}</td><td>{i.rank}</td><td>{i.reason}</td></tr>)}</tbody></table></div><p className="text-xs">プレビューは先頭100商品。保存は全商品です。</p><label className="block"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> 会津ブランド館の対象EC・期間・商品単位で、アクセスと購入実績の集計範囲が一致していることを確認しました</label><button className={buttonClass} disabled={busy || !confirmed} onClick={() => void run(async () => {
        const result = await api("/api/web-sales/abcd", { mode: "save", csv, mapping, settings, confirmed });
        const data = await api(`/api/web-sales/abcd?channel=${channel}`); setHistory(data.snapshots); setSelected(result.id); setShowImport(false); setNotice(result.duplicate ? "同じ内容の保存済み分析を表示します。" : "分析を保存しました。");
      })}>分析結果を保存</button></div>}
    </section>}
    {loading && <p role="status">分析を読み込んでいます…</p>}
    {!loading && !snapshot && <div className="border rounded-xl p-8 bg-white"><h2 className="font-bold">商品別アクセスデータがまだありません</h2><p className="mt-2 text-slate-600">売上だけではABCD分類できません。「分析CSVを取り込む」から商品別データを保存してください。既存の売上集計はそのまま利用できます。</p></div>}
    {snapshot && analysis && <>
      <section className="rounded-xl border bg-white p-4 space-y-2"><p className="font-semibold">{snapshot.period_start}〜{snapshot.period_end} / {snapshot.item_count}商品 / {METRICS[snapshot.metric]}</p><p className="text-sm">{snapshot.scope} ・ {snapshot.source} ・ {snapshot.payload.input.coverage === "all" ? "全商品" : "一部商品の分析"}</p><p className="text-sm">基準：アクセス {format(analysis.accessThreshold, 2)} / 購入率 {format(analysis.cvrThreshold, 3)}% ・ 最低アクセス {snapshot.payload.input.minimumAccess} ・ {analysis.ruleVersion}</p><p className="text-xs text-slate-500">各EC内の分類です。広告クリック率とは異なります。利益は取り込んだCSVの金額で、空欄は未取得です。</p></section>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{(["A", "B", "C", "D", "保留"] as Rank[]).map(r => <button key={r} onClick={() => setRankFilter(r)} className="text-left rounded-xl border p-4 bg-white" style={{ borderTop: `4px solid ${colors[r]}` }}><span className="text-xl font-bold">{r}：{analysis.items.filter(i => i.rank === r).length}商品</span><p className="text-xs mt-2">{ACTIONS[r]}</p></button>)}</div>
      <div className="flex flex-wrap items-end gap-3"><label>分類<select className={inputClass} value={rankFilter} onChange={e => setRankFilter(e.target.value)}>{["全て", "A", "B", "C", "D", "保留"].map(v => <option key={v}>{v}</option>)}</select></label><label>商品検索<input className={inputClass} value={search} onChange={e => setSearch(e.target.value)} placeholder="商品名・ID" /></label><label className="flex-1">比較対象<select className={inputClass} value={previousId} onChange={e => setPreviousId(e.target.value)}><option value="">比較しない</option>{history.filter(h => h.id !== snapshot.id && h.period_end < snapshot.period_start).map(h => <option value={h.id} key={h.id}>{h.period_start}〜{h.period_end} / {h.source}</option>)}</select></label><button className={buttonClass} disabled={busy} onClick={() => void run(exportExcel)}>全商品のExcelを作成</button></div>
      {previous && !comparisonOk && <p className="p-3 bg-amber-50">期間の日数・集計範囲・指標・最低アクセス・ルールが異なるため、分類の比較を表示していません。</p>}
      {comparisonOk && <p className="text-sm text-slate-600">比較対象の基準：アクセス {format(previous!.payload.analysis.accessThreshold, 2)} / 購入率 {format(previous!.payload.analysis.cvrThreshold, 3)}%。基準値が変わると、実績が同じでも分類が変わります。</p>}
      <div className="bg-white rounded-xl border p-4"><h2 className="font-bold">アクセス × 購入率（{filtered.length}商品を表示）</h2><div className="h-80">{points.length ? <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 25 }}><CartesianGrid strokeDasharray="3 3" /><XAxis type="number" dataKey="cvr" name="購入率" unit="%" label={{ value: "購入率 →", position: "insideBottom", offset: -10 }} /><YAxis type="number" dataKey="access" name="アクセス" /><Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => { const i = payload?.[0]?.payload; return active && i ? <div className="bg-white border rounded p-3 text-sm"><b>{i.name}</b><p>{i.rank} / アクセス {format(i.access)} / 購入率 {format(i.cvr, 2)}%</p></div> : null; }} />{analysis.accessThreshold != null && <ReferenceLine y={analysis.accessThreshold} stroke="#64748b" strokeDasharray="5 5" ifOverflow="extendDomain" />}{analysis.cvrThreshold != null && <ReferenceLine x={analysis.cvrThreshold} stroke="#64748b" strokeDasharray="5 5" ifOverflow="extendDomain" />}<Scatter data={points}>{points.map(i => <Cell key={i.key} fill={colors[i.rank]} />)}</Scatter></ScatterChart></ResponsiveContainer> : <p className="p-8 text-slate-500">描画できるアクセス・購入率がありません。</p>}</div><p className="text-xs">右上A / 左上B / 右下C / 左下D。灰色は判定保留。アクセス0・未取得の商品はグラフに表示せず、一覧に残します。</p></div>
      <div className="overflow-auto bg-white border rounded-xl max-h-[650px]"><table className="min-w-[1100px] w-full text-sm"><thead className="bg-slate-100 sticky top-0"><tr>{["商品", "分類", "前回", "アクセス", "購入実績", "購入率", "売上", "利益", "改善候補・保留理由"].map(t => <th className="p-3 text-left" key={t}>{t}</th>)}</tr></thead><tbody>{filtered.map(i => <tr key={i.key} className="border-t"><td className="p-3 max-w-72"><button className="text-blue-700 text-left" onClick={() => setProductKey(i.key)}>{i.name}</button><div className="text-xs text-slate-500">{i.key}</div></td><td className="p-3 font-bold" style={{ color: colors[i.rank] }}>{i.rank}</td><td className="p-3">{comparisonOk ? previousItems.get(i.key)?.rank || "未取得" : "—"}</td><td className="p-3">{format(i.access)}</td><td className="p-3">{format(i.conversions)}</td><td className="p-3">{i.cvr == null ? "—" : `${format(i.cvr, 2)}%`}</td><td className="p-3">{format(i.sales)}</td><td className="p-3">{format(i.profit)}</td><td className="p-3 max-w-96">{i.reason || i.action}</td></tr>)}</tbody></table></div>
      <section className="bg-white border rounded-xl p-5 space-y-3"><h2 className="font-bold text-lg">改善の実施記録</h2><p className="text-sm text-slate-600">画像変更、説明の修正、集客テストなど、実施した内容を記録します。外部ECへの変更は行いません。</p><div className="grid md:grid-cols-3 gap-3"><label>対象商品<select className={inputClass} value={productKey} onChange={e => setProductKey(e.target.value)}><option value="">商品を選択</option>{analysis.items.map(i => <option key={i.key} value={i.key}>{i.name}</option>)}</select></label><label>実施日<input type="date" className={inputClass} value={actionDate} onChange={e => setActionDate(e.target.value)} /></label><label>実施内容<input className={inputClass} maxLength={1000} value={description} onChange={e => setDescription(e.target.value)} placeholder="例：1枚目の商品画像を変更" /></label></div><button className={buttonClass} disabled={busy || !productKey || !description.trim()} onClick={() => void run(async () => { const result = await api("/api/web-sales/abcd", { mode: "action", snapshot_id: snapshot.id, product_key: productKey, action_date: actionDate, description }); setActions(a => [result.action, ...a]); setDescription(""); setNotice("改善履歴を保存しました。"); })}>実施内容を記録</button>{actions.map(a => <p key={a.id} className="border-t pt-2 text-sm">{a.action_date} ・ {analysis.items.find(i => i.key === a.product_key)?.name || a.product_key}：{a.description}</p>)}</section>
    </>}
  </div>;
}
