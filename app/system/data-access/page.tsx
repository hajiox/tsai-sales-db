"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const resources = [
  ["recipes", "レシピ"], ["ingredients", "食材"], ["materials", "資材"],
  ["expenses", "経費"], ["reviews", "レビュー"], ["sales", "WEB売上"],
] as const;
type Connection = { id: string; label: string; scopes: string[]; resource_ids: Record<string, string[]>; expires_at: string; revoked_at: string | null; last_used_at: string | null };
type Change = { id: string; connection_id: string; resource: string; operation: string; record_id: string; values: Record<string, unknown>; before_data: Record<string, unknown> | null; requires_approval: boolean; status: string; expires_at: string; created_at: string };
type Audit = { id: string; connection_id: string; resource: string; operation: string; record_id: string; created_at: string };
type Overview = { connections: Connection[]; changes: Change[]; audit: Audit[] };
const api = "/api/data-access/connections";
const resourceName = (value: string) => resources.find(([key]) => key === value)?.[1] ?? value;
const statusNames: Record<string, string> = { pending: "準備済み", approved: "承認済み", applied: "適用済み", rejected: "却下" };
const fieldNames: Record<string, string> = {
  name: "名称", category: "カテゴリ", manufacturer: "メーカー", product_description: "商品説明", supplier: "仕入先", notes: "メモ",
  manufacturing_notes: "製造メモ", web_description: "Web商品説明", product_points: "商品ポイント", price: "価格", selling_price: "販売価格",
  unit_price: "単価", unit_quantity: "入数", tax_included: "税込", is_intermediate: "中間部品", total_weight: "総重量", yield_rate: "歩留まり",
  lot_size: "ロット数", case_quantity: "ケース入数", storage_method: "保存方法", shelf_life: "賞味期限", filling_quantity: "充填量",
  filling_quantity_unit: "充填量の単位", label_quantity: "表示内容量", net_content_unit: "内容量の単位", sterilization_method: "殺菌方法",
  sterilization_temperature: "殺菌温度", sterilization_time: "殺菌時間", ingredient_label: "原材料表示", raw_materials: "原材料",
  allergens: "アレルゲン", origin: "原産地", nutrition_per: "栄養成分の基準量", calories: "熱量", protein: "たんぱく質", fat: "脂質",
  carbohydrate: "炭水化物", sodium: "ナトリウム", salt: "食塩相当量",
};
const dateText = (value: string | null) => value ? new Date(value).toLocaleString("ja-JP") : "未使用";
const valueText = (value: unknown) => value === null || value === undefined ? "未設定" : typeof value === "string" ? value : JSON.stringify(value);

export default function DataAccessPage() {
  const [overview, setOverview] = useState<Overview>({ connections: [], changes: [], audit: [] });
  const [label, setLabel] = useState("");
  const [days, setDays] = useState(30);
  const [scopes, setScopes] = useState<string[]>(["recipes:read", "ingredients:read", "materials:read", "expenses:read"]);
  const [restrictedIds, setRestrictedIds] = useState<Record<string, string>>({});
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(api, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error?.message ?? "接続情報を取得できません");
      setOverview(result.data);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "接続情報を取得できません"); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  async function execute(body: Record<string, unknown>) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error?.message ?? "操作を完了できません");
      if (result.data?.token) { setToken(result.data.token); setLabel(""); }
      setMessage(body.action === "create" ? "接続を作成しました。接続キーはこの画面で一度だけ表示されます。" : body.action === "revoke" ? "接続を停止しました。" : body.decision === "approve" ? "変更を承認しました。依頼元が確定すると適用されます。" : "変更を却下しました。");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "操作を完了できません"); }
    finally { setBusy(false); }
  }
  function toggleScope(scope: string, checked: boolean) {
    setScopes(current => checked ? [...new Set([...current, scope, scope.replace(/:write$/, ":read")])] : current.filter(item => item !== scope && (scope.endsWith(":write") || item !== scope.replace(/:read$/, ":write"))));
  }
  const pending = overview.changes.filter(change => change.status === "pending" && new Date(change.expires_at).getTime() > Date.now());
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div><h1 className="text-2xl font-bold">AIデータ接続</h1><p className="mt-2 text-sm text-slate-600">Codexなどに、許可したデータの閲覧・登録・更新だけを提供します。接続ごとに権限と有効期限を設定できます。</p></div>
        <Button variant="outline" onClick={() => void refresh()} disabled={busy}>再読み込み</Button>
      </div>
      {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-red-800">{error}</p>}
      {message && <p role="status" className="rounded border border-green-200 bg-green-50 p-3 text-green-800">{message}</p>}
      {token && <Card><CardHeader><CardTitle>接続キー（一度だけ表示）</CardTitle></CardHeader><CardContent className="space-y-3">
        <p className="text-sm text-slate-600">接続先のCodexにだけ設定してください。Chat本文や共有資料には貼り付けず、設定後は表示を閉じてください。</p>
        <Input aria-label="新しい接続キー" type="password" value={token} readOnly autoComplete="off" />
        <div className="flex gap-3"><Button onClick={async () => { try { await navigator.clipboard.writeText(token); setMessage("接続キーをコピーしました。"); } catch { setError("コピーできませんでした。接続キー欄から手動でコピーしてください。"); } }}>接続キーをコピー</Button><Button variant="outline" onClick={() => setToken("")}>表示を閉じる</Button></div>
      </CardContent></Card>}
      <Card><CardHeader><CardTitle>接続を追加</CardTitle></CardHeader><CardContent>
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); const resourceIds = Object.fromEntries(Object.entries(restrictedIds).filter(([, text]) => text.trim()).map(([resource, text]) => [resource, text.split(/[\s,、]+/).filter(Boolean)])); void execute({ action: "create", label, scopes, resourceIds, expiresInDays: days }); }}>
          <div className="grid gap-4 md:grid-cols-2"><label className="space-y-1 text-sm"><span>接続名</span><Input value={label} maxLength={80} required onChange={event => setLabel(event.target.value)} placeholder="例：分析用Codex" /></label><label className="space-y-1 text-sm"><span>有効期間（日）</span><Input type="number" min={1} max={90} required value={days} onChange={event => setDays(Number(event.target.value))} /></label></div>
          <fieldset className="rounded border p-4"><legend className="px-2 text-sm font-semibold">許可するデータと操作</legend><div className="grid gap-3 md:grid-cols-3">{resources.map(([resource, text]) => <div key={resource} className="rounded bg-slate-50 p-3"><p className="mb-2 font-medium">{text}</p><label className="mr-4 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={scopes.includes(`${resource}:read`)} onChange={event => toggleScope(`${resource}:read`, event.target.checked)} />閲覧</label>{!["reviews", "sales"].includes(resource) && <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={scopes.includes(`${resource}:write`)} onChange={event => toggleScope(`${resource}:write`, event.target.checked)} />登録・限定更新</label>}</div>)}</div></fieldset>
          <details className="rounded border p-3"><summary className="cursor-pointer text-sm font-medium">対象データをIDで制限する（任意）</summary><p className="my-3 text-sm text-slate-600">空欄はその種類の全件を許可します。IDを指定すると、その接続は指定したデータだけを扱えます。複数のIDはカンマまたは改行で区切ってください。</p><div className="grid gap-3 md:grid-cols-2">{resources.map(([resource, text]) => <label key={resource} className="space-y-1 text-sm"><span>{text}の対象ID</span><textarea className="min-h-16 w-full rounded border p-2 font-mono text-xs" value={restrictedIds[resource] ?? ""} onChange={event => setRestrictedIds(current => ({ ...current, [resource]: event.target.value }))} maxLength={7600} /></label>)}</div></details>
          <p className="text-sm text-slate-600">新規登録・更新は、接続に許可した範囲でそのまま保存できます。変更ごとの承認操作は不要です。</p>
          <Button type="submit" disabled={busy || !scopes.length}>{busy ? "処理中…" : "接続を作成"}</Button>
        </form>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>接続一覧</CardTitle></CardHeader><CardContent>
        {overview.connections.length === 0 ? <p className="text-sm text-slate-500">接続はまだありません。</p> : <div className="space-y-3">{overview.connections.map(connection => {
          const active = !connection.revoked_at && new Date(connection.expires_at).getTime() > Date.now();
          return <div key={connection.id} className="flex flex-wrap items-start justify-between gap-3 rounded border p-4"><div className="min-w-0"><p className="font-semibold">{connection.label} <span className={`ml-2 text-xs ${active ? "text-green-700" : "text-slate-500"}`}>{active ? "有効" : connection.revoked_at ? "停止済み" : "期限切れ"}</span></p><p className="my-2 text-sm">{connection.scopes.map(scope => `${resourceName(scope.split(":")[0])}：${scope.endsWith(":write") ? "登録・限定更新" : "閲覧"}`).join(" ／ ")}</p><p className="text-xs text-slate-500">期限：{dateText(connection.expires_at)}　最終使用：{dateText(connection.last_used_at)}</p>{Object.entries(connection.resource_ids).map(([resource, ids]) => <p key={resource} className="mt-1 break-all text-xs text-slate-500">{resourceName(resource)}の対象：{ids.length}件</p>)}</div><Button variant="outline" disabled={!active || busy} onClick={() => { if (window.confirm(`「${connection.label}」の接続を停止します。再開には新しい接続キーが必要です。`)) void execute({ action: "revoke", id: connection.id }); }}>接続を停止</Button></div>;
        })}</div>}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>準備済みの変更 {pending.length}件</CardTitle></CardHeader><CardContent className="space-y-4">
        <p className="text-sm text-slate-500">接続元が保存を完了するまで表示します。管理者の承認操作は不要です。</p>
        {pending.length === 0 && <p className="text-sm text-slate-500">保存前の変更はありません。</p>}
        {pending.map(change => <div key={change.id} className="space-y-3 rounded border p-4"><p className="font-semibold">{overview.connections.find(connection => connection.id === change.connection_id)?.label ?? "接続"}：{resourceName(change.resource)}の{change.operation === "create" ? "新規登録" : "更新"}</p><p className="text-xs text-slate-500">対象：{change.record_id}　期限：{dateText(change.expires_at)}</p><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">項目</th><th className="p-2">変更前</th><th className="p-2">変更後</th></tr></thead><tbody>{Object.entries(change.values).map(([key, value]) => <tr key={key} className="border-b align-top"><th className="p-2 text-left font-normal">{fieldNames[key] ?? key}</th><td className="max-w-sm whitespace-pre-wrap break-words p-2 text-slate-500">{valueText(change.before_data?.[key])}</td><td className="max-w-sm whitespace-pre-wrap break-words p-2">{valueText(value)}</td></tr>)}</tbody></table></div><div className="flex gap-3"><Button variant="outline" disabled={busy} onClick={() => void execute({ action: "review", id: change.id, decision: "reject" })}>却下</Button></div></div>)}
      </CardContent></Card>
      <Card><CardHeader><CardTitle>変更履歴</CardTitle></CardHeader><CardContent><p className="mb-3 text-sm text-slate-600">直近50件。変更前後の内容は保存され、変更依頼のIDで照合できます。</p>{overview.changes.length === 0 ? <p className="text-sm text-slate-500">変更履歴はありません。</p> : <div className="space-y-2">{overview.changes.map(change => <details key={change.id} className="rounded border p-3"><summary className="cursor-pointer text-sm">{dateText(change.created_at)}　{resourceName(change.resource)}　{statusNames[change.status] ?? change.status}　{overview.connections.find(connection => connection.id === change.connection_id)?.label}</summary><p className="my-2 break-all text-xs text-slate-500">変更依頼：{change.id} ／ 対象：{change.record_id}</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-3 text-xs">{JSON.stringify({ before: change.before_data, changes: change.values }, null, 2)}</pre></details>)}</div>}</CardContent></Card>
    </div>
  );
}
