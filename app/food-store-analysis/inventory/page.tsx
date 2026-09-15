"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Save, Upload, Printer, Copy, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InventoryQrCode } from "@/components/brand-store/InventoryQrDialog";
import { toast } from "sonner";
import { inventoryFiscalLabel, currentInventoryFiscalYear } from "@/lib/inventory-fiscal";
import { inventoryFormulaErrors, isInventoryAmountCell, type InventoryWorkbook, type InventoryCell } from "@/lib/food-store-inventory";

type Inventory = { id: string; fiscal_year: number; inventory_date: string; status: "draft" | "completed"; revision: number; source_filename: string; workbook: InventoryWorkbook; updated_at: string };
type Change = { sheet: string; address: string; value: InventoryCell["value"]; formula?: string };
const endpoint = "/api/food-store/inventory";
function display(cell?: InventoryCell) {
  if (cell?.value === null || cell?.value === undefined) return "";
  return typeof cell.value === "number" ? cell.value.toLocaleString("ja-JP", { maximumFractionDigits: 10 }) : String(cell.value);
}

export default function FoodStoreInventoryPage() {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [histories, setHistories] = useState<Omit<Inventory, "workbook">[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [changes, setChanges] = useState<Record<string, Change>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<{ sheet: string; address: string; text: string; type: string } | null>(null);
  const [createMode, setCreateMode] = useState<"import" | "copy" | null>(null);
  const [year, setYear] = useState(currentInventoryFiscalYear());
  const [date, setDate] = useState(`${currentInventoryFiscalYear()}-07-31`);
  const [file, setFile] = useState<File | null>(null);
  const dirty = Object.keys(changes).length > 0;
  const load = useCallback(async (id?: string) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(endpoint + (id ? `?id=${encodeURIComponent(id)}` : ""));
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "取得できませんでした");
      setInventory(data.inventory); setHistories(data.histories); setChanges({}); setSheetIndex(0);
    } catch (err) { setError(err instanceof Error ? err.message : "取得できませんでした"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(new URLSearchParams(window.location.search).get("id") || undefined); }, [load]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const sheet = inventory?.workbook.sheets[sheetIndex];
  const errors = inventory ? inventoryFormulaErrors(inventory.workbook) : [];
  async function mutate(action: string) {
    if (!inventory) return;
    if (action === "complete" && !window.confirm(errors.length ? "計算エラーが残っています。元Excelの状態を含め、この内容で確定しますか？" : "この棚卸しを確定しますか？")) return;
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: inventory.id, revision: inventory.revision, action, changes: Object.values(changes) }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error);
      setInventory({ ...inventory, ...data.inventory }); setChanges({});
      setHistories(rows => rows.map(row => row.id === inventory.id ? { ...row, ...data.inventory } : row));
      toast.success(action === "save" ? "保存しました" : action === "complete" ? "確定しました" : "編集に戻しました");
    } catch (err) { toast.error(err instanceof Error ? err.message : "保存できませんでした"); }
    finally { setBusy(false); }
  }
  async function create() {
    if (dirty && !window.confirm("未保存の変更を破棄して年度を作成しますか？")) return;
    setBusy(true);
    try {
      let body: FormData | string;
      if (createMode === "import") {
        if (!file) throw new Error("Excelファイルを選択してください");
        const form = new FormData(); form.set("file", file); form.set("fiscalYear", String(year)); form.set("inventoryDate", date); body = form;
      } else body = JSON.stringify({ action: "copy", sourceId: inventory?.id, fiscalYear: year, inventoryDate: date });
      const response = await fetch(endpoint, { method: "POST", ...(typeof body === "string" ? { headers: { "Content-Type": "application/json" } } : {}), body });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error);
      setCreateMode(null); await load(data.id); toast.success("年度棚卸しを保存しました");
    } catch (err) { toast.error(err instanceof Error ? err.message : "作成できませんでした"); }
    finally { setBusy(false); }
  }
  async function download() {
    if (!inventory) return;
    try {
      const XLSX = await import("xlsx");
      const book = XLSX.utils.book_new();
      for (const source of inventory.workbook.sheets) {
        const target: import("xlsx").WorkSheet = { "!ref": `A1:${String.fromCharCode(64 + source.cols)}${source.rows}` };
        for (const [address, cell] of Object.entries(source.cells)) {
          if (cell.value === null && !cell.formula) continue;
          const errorCodes: Record<string, number> = { "#REF!": 23, "#VALUE!": 15, "#NAME?": 29, "#DIV/0!": 7, "#N/A": 42 };
          const code = typeof cell.value === "string" ? errorCodes[cell.value] : undefined;
          const rawFormula = cell.formula?.replace(/^=/, "");
          const formula = rawFormula && isInventoryAmountCell(source, address) && !/^ROUNDDOWN\(/i.test(rawFormula) ? `ROUNDDOWN(${rawFormula},0)` : rawFormula;
          target[address] = { t: code !== undefined ? "e" : typeof cell.value === "number" ? "n" : typeof cell.value === "boolean" ? "b" : "s", v: code ?? cell.value ?? "", ...(formula ? { f: formula } : {}), ...(isInventoryAmountCell(source, address) ? { z: "#,##0" } : cell.format ? { z: cell.format } : {}) };
        }
        target["!cols"] = Array.from({ length: source.cols }, (_, index) => ({ wch: index === 0 ? 42 : index === 4 ? 28 : 18 }));
        XLSX.utils.book_append_sheet(book, target, source.name);
      }
      XLSX.writeFile(book, `食のブランド館_決算棚卸し_${inventory.fiscal_year}年度.xlsx`);
    } catch { toast.error("Excel出力に失敗しました"); }
  }
  function applyEdit() {
    if (!editor || !inventory) return;
    let value: InventoryCell["value"] = editor.text;
    if (editor.type === "number") {
      value = editor.text === "" ? null : Number(editor.text);
      if (value !== null && !Number.isFinite(value)) { toast.error("数値を入力してください"); return; }
    } else if (editor.type === "boolean") value = editor.text === "true";
    const change: Change = { sheet: editor.sheet, address: editor.address, value, ...(editor.type === "formula" ? { formula: editor.text.startsWith("=") ? editor.text : `=${editor.text}`, value: null } : {}) };
    setChanges(current => ({ ...current, [`${editor.sheet}!${editor.address}`]: change }));
    setEditor(null);
  }
  return <main className="p-3 md:p-6 space-y-5">
    <style>{`@media print { aside, nav, .inventory-controls { display:none!important } main { padding:0!important } .inventory-table { overflow:visible!important } .inventory-table th,.inventory-table td { font-size:10pt!important; padding:4px!important } }`}</style>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><Link href="/food-store-analysis" className="inventory-controls inline-flex gap-1 items-center text-sm text-slate-600"><ArrowLeft size={16}/>食のブランド館分析</Link><h1 className="text-2xl font-bold mt-2">決算棚卸し</h1><p className="text-sm text-slate-500">{inventory ? inventoryFiscalLabel(inventory.fiscal_year) : "年度別の棚卸し表"}</p></div>
      <div className="inventory-controls flex flex-wrap gap-2">
        <InventoryQrCode path="/food-store-analysis/inventory" className="h-16 w-16" />
        <Button variant="outline" disabled={busy || loading} onClick={() => { setCreateMode("import"); setFile(null); }}><Upload size={16} className="mr-2"/>Excel取込</Button>
        <Button variant="outline" disabled={!inventory || busy || dirty} onClick={() => { const next = inventory!.fiscal_year + 1; setYear(next); setDate(`${next}-07-31`); setCreateMode("copy"); }}><Copy size={16} className="mr-2"/>翌年度へ複製</Button>
        <Button variant="outline" disabled={!inventory || dirty || busy} onClick={() => void download()}><Download size={16} className="mr-2"/>Excel出力</Button>
        <Button variant="outline" disabled={!inventory || dirty || busy} onClick={() => window.print()}><Printer size={16} className="mr-2"/>印刷</Button>
      </div>
    </header>
    {loading && <p className="flex gap-2"><Loader2 className="animate-spin"/>棚卸し表を読み込み中</p>}
    {error && <div role="alert" className="bg-red-50 text-red-700 p-4">{error}<Button variant="outline" className="ml-3" onClick={() => void load(inventory?.id)}>再読み込み</Button></div>}
    {!loading && !error && !inventory && <p className="border rounded-xl p-8 text-center">棚卸し表がありません。「Excel取込」から登録してください。</p>}
    {inventory && sheet && !loading && <>
      <section className="inventory-controls flex flex-wrap gap-3 items-center bg-slate-50 border rounded-xl p-4">
        <label className="text-sm">保存済み年度 <select className="border rounded p-2 ml-2 bg-white" value={inventory.id} disabled={busy} onChange={event => { if (!dirty || window.confirm("未保存の変更を破棄して年度を切り替えますか？")) void load(event.target.value); }}>{histories.map(row => <option key={row.id} value={row.id}>{row.fiscal_year}年度　{row.status === "completed" ? "確定" : "編集中"}</option>)}</select></label>
        <span className="text-sm">棚卸日 {inventory.inventory_date}</span><span className={`text-sm rounded px-2 py-1 ${inventory.status === "completed" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{inventory.status === "completed" ? "確定" : "編集中"}</span>
        <span className="text-xs text-slate-500">更新 {new Date(inventory.updated_at).toLocaleString("ja-JP")}</span>
        <div className="flex gap-2 ml-auto"><Button disabled={!dirty || busy} onClick={() => void mutate("save")}><Save size={16} className="mr-2"/>{busy ? "処理中" : `保存${dirty ? `（${Object.keys(changes).length}セル）` : ""}`}</Button><Button variant="outline" disabled={busy || dirty} onClick={() => void mutate(inventory.status === "completed" ? "reopen" : "complete")}><Check size={16} className="mr-2"/>{inventory.status === "completed" ? "編集に戻す" : "確定"}</Button></div>
      </section>
      {errors.length > 0 && <div role="status" className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-4 py-3 text-sm">計算エラー {errors.length}件：{errors.map(item => `${item.sheet} ${item.address} (${item.error})`).join("、")}。元Excelの参照切れもそのまま表示しています。</div>}
      <label className="inventory-controls block sm:hidden text-sm">シート<select className="block mt-2 p-3 rounded-lg border bg-white w-full" value={sheetIndex} onChange={e => setSheetIndex(Number(e.target.value))}>{inventory.workbook.sheets.map((item, index) => <option key={item.name} value={index}>{item.name}</option>)}</select></label>
      <div className="inventory-controls hidden sm:flex flex-wrap gap-2" role="tablist" aria-label="棚卸しシート">{inventory.workbook.sheets.map((item, index) => <button key={item.name} role="tab" aria-selected={index === sheetIndex} onClick={() => setSheetIndex(index)} className={`rounded-lg px-3 py-2 text-sm border ${index === sheetIndex ? "bg-slate-800 text-white" : "bg-white text-slate-700"}`}>{item.name}</button>)}</div>
      <h2 className="text-lg font-semibold">{sheet.name}</h2>
      <p className="inventory-controls text-xs text-slate-500">{inventory.status === "draft" ? "セルを押して編集し、保存してください。金額と合計は保存時に計算されます。" : "確定済みです。修正する場合は「編集に戻す」を押してください。"}　取込元：{inventory.source_filename}</p>
      {dirty && <p className="inventory-controls text-amber-700 text-sm">未保存の変更があります。金額・合計は保存後に更新されます。</p>}
      <div className="inventory-table overflow-auto border rounded-lg bg-white"><table className="w-full border-collapse text-sm"><thead><tr><th className="bg-slate-100 p-2 border w-10">行</th>{Array.from({ length: sheet.cols }, (_, i) => <th className="bg-slate-100 border p-2" key={i}>{String.fromCharCode(65 + i)}</th>)}</tr></thead><tbody>{Array.from({ length: sheet.rows }, (_, row) => <tr key={row} className={row % 2 ? "bg-slate-50/60" : ""}><th className="bg-slate-100 border p-2 text-xs text-slate-500">{row + 1}</th>{Array.from({ length: sheet.cols }, (_, col) => {
        const address = String.fromCharCode(65 + col) + (row + 1);
        const cell = sheet.cells[address];
        const change = changes[`${sheet.name}!${address}`];
        const visible = change ? (change.formula || display(change)) : display(cell);
        return <td key={address} className={`border p-0 ${change ? "bg-amber-50" : ""} ${col === 0 ? "min-w-64" : "min-w-28"}`}><button className={`block w-full px-3 py-2.5 min-h-10 whitespace-pre-wrap ${typeof (change || cell)?.value === "number" || cell?.formula ? "text-right tabular-nums" : "text-left"} ${String(cell?.value).startsWith("#") ? "text-red-600" : ""}`} disabled={busy || inventory.status === "completed"} title={cell?.formula || `${sheet.name} ${address}`} onClick={() => { const c = change || cell; setEditor({ sheet: sheet.name, address, text: c?.formula || String(c?.value ?? ""), type: c?.formula ? "formula" : typeof c?.value === "number" ? "number" : typeof c?.value === "boolean" ? "boolean" : (col === 1 || col === 2) && row > 1 && c?.value == null ? "number" : "text" }); }}>{visible || "\u00a0"}</button></td>;
      })}</tr>)}</tbody></table></div>
    </>}
    {editor && <div className="inventory-controls fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><section role="dialog" aria-modal="true" aria-label="セル編集" className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4"><h2 className="font-semibold">{editor.sheet}・{editor.address}</h2><label className="block text-sm">入力形式<select className="border rounded p-2 ml-2" value={editor.type} onChange={e => setEditor({ ...editor, type: e.target.value })}><option value="text">文字</option><option value="number">数値</option><option value="formula">計算式</option><option value="boolean">真偽値</option></select></label><textarea aria-label="セル内容" autoFocus className="border rounded p-3 w-full" rows={3} value={editor.text} onChange={e => setEditor({ ...editor, text: e.target.value })}/>{editor.type === "formula" && <p className="text-xs text-slate-500">セル参照、掛け算、SUMの範囲合計に対応。例：=B3*C3、=SUM(D3:D20)</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditor(null)}>キャンセル</Button><Button onClick={applyEdit}>変更を反映</Button></div></section></div>}
    {createMode && <div className="inventory-controls fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"><section role="dialog" aria-modal="true" aria-label="年度棚卸し作成" className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4"><h2 className="font-semibold">{createMode === "import" ? "Excelから棚卸しを登録" : "保存済みの内容を翌年度へ複製"}</h2><p className="text-sm text-slate-600">既存年度は上書きしません。文言・数量・単価・計算式をそのまま保存します。</p><label className="block">決算年度<input type="number" min={2000} max={2100} className="border rounded p-2 ml-3 w-28" value={year} onChange={e => { setYear(Number(e.target.value)); setDate(`${e.target.value}-07-31`); }}/></label><label className="block">棚卸日<input type="date" className="border rounded p-2 ml-3" value={date} onChange={e => setDate(e.target.value)}/></label>{createMode === "import" && <input aria-label="取込Excel" type="file" accept=".xlsx" onChange={e => setFile(e.target.files?.[0] || null)}/>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setCreateMode(null)}>キャンセル</Button><Button disabled={busy} onClick={() => void create()}>{busy ? "保存中" : "登録"}</Button></div></section></div>}
  </main>;
}
