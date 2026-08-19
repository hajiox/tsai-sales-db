"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calculator,
  CalendarDays,
  Factory,
  KeyRound,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { calculateCharSiuProduction } from "@/lib/char-siu-production";

type Settings = {
  hourly_wage: number;
  block_unit_weight_g: number;
  lard_unit_weight_g: number;
  minced_chashu_unit_weight_g: number;
  labor_rate_staff_count: number;
  labor_rate_excluded_count: number;
  labor_rate_effective_date: string | null;
  labor_rate_synced_at: string | null;
  labor_rate_source: string;
};

type MaterialRow = {
  material_key: string;
  material_name: string;
  usage_amount: number;
  usage_unit: string;
  purchase_unit_quantity: number;
  purchase_price_tax_included: number;
  unit_cost: number;
  material_cost: number;
  sort_order: number;
  price_source: string;
  source_reference: string | null;
  source_confidence: number | null;
  source_note: string | null;
};

type OutputRow = {
  output_key: string;
  output_name: string;
  quantity: number;
  unit_weight_g: number;
  output_weight_g: number;
  allocation_ratio: number;
  allocated_cost: number;
  unit_cost: number | null;
  sort_order: number;
};

type ProductionRun = {
  id: string;
  production_date: string;
  worker_count: number;
  work_hours: number;
  hourly_wage: number;
  total_person_hours: number;
  material_cost: number;
  labor_cost: number;
  total_cost: number;
  total_output_quantity: number;
  total_output_weight_g: number;
  average_cost_per_item: number | null;
  average_cost_per_kg: number | null;
  notes: string;
  labor_rate_staff_count: number;
  labor_rate_excluded_count: number;
  labor_rate_source: string;
  labor_rate_synced_at: string | null;
  materials: MaterialRow[];
  outputs: OutputRow[];
};

type RunDraft = {
  productionDate: string;
  workerCount: string;
  workHours: string;
  hourlyWage: string;
  notes: string;
  materials: Array<{
    key: string;
    name: string;
    usageUnit: string;
    usageAmount: string;
    purchaseUnitQuantity: string;
    purchasePriceTaxIncluded: string;
  }>;
  outputs: Array<{
    key: string;
    name: string;
    quantity: string;
    unitWeightG: string;
  }>;
};

const currentMonth = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
}).format(new Date());

export default function CharSiuProductionCostPage() {
  const router = useRouter();
  const [auth, setAuth] = useState<"loading" | "required" | "authenticated">("loading");
  const [password, setPassword] = useState("");
  const [authenticating, setAuthenticating] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsDraft, setSettingsDraft] = useState({ blockWeight: "", lardWeight: "", mincedChashuWeight: "" });
  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<RunDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch("/api/finance/auth", { cache: "no-store" });
      const data = await response.json();
      setAuth(data.authenticated ? "authenticated" : "required");
    } catch {
      setAuth("required");
    }
  }, []);

  const loadData = useCallback(async (targetMonth: string, preferredId?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (targetMonth) params.set("month", targetMonth);
      const response = await fetch(`/api/finance/char-siu-production?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (response.status === 403) {
        setAuth("required");
        return;
      }
      if (!response.ok || !data.success) throw new Error(data.error || "製造原価を取得できませんでした");
      setSettings(data.settings);
      setSettingsDraft({
        blockWeight: numberText(data.settings?.block_unit_weight_g),
        lardWeight: numberText(data.settings?.lard_unit_weight_g),
        mincedChashuWeight: numberText(data.settings?.minced_chashu_unit_weight_g),
      });
      const nextRuns: ProductionRun[] = data.runs || [];
      setRuns(nextRuns);
      const nextSelected = nextRuns.find((run) => run.id === preferredId) || nextRuns[0] || null;
      setSelectedId(nextSelected?.id || "");
      setDraft(nextSelected ? toDraft(nextSelected) : null);
    } catch (error: any) {
      toast.error(error.message || "製造原価を取得できませんでした");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (auth === "authenticated") loadData(month);
  }, [auth, loadData, month]);

  const selectedRun = runs.find((run) => run.id === selectedId) || null;
  const preview = useMemo(() => {
    if (!draft) return null;
    return calculateCharSiuProduction({
      workerCount: Number(draft.workerCount),
      workHours: Number(draft.workHours),
      hourlyWage: Number(draft.hourlyWage),
      materials: draft.materials.map((material) => ({
        materialKey: material.key as any,
        usageAmount: Number(material.usageAmount),
        purchaseUnitQuantity: Number(material.purchaseUnitQuantity),
        purchasePriceTaxIncluded: Number(material.purchasePriceTaxIncluded),
      })),
      outputs: draft.outputs.map((output) => ({
        outputKey: output.key as any,
        quantity: Number(output.quantity),
        unitWeightG: Number(output.unitWeightG),
      })),
    });
  }, [draft]);

  const authenticate = async (event: FormEvent) => {
    event.preventDefault();
    setAuthenticating(true);
    try {
      const response = await fetch("/api/finance/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) throw new Error("パスワードが違います");
      setPassword("");
      setAuth("authenticated");
    } catch (error: any) {
      toast.error(error.message || "認証に失敗しました");
    } finally {
      setAuthenticating(false);
    }
  };

  const selectRun = (run: ProductionRun) => {
    setSelectedId(run.id);
    setDraft(toDraft(run));
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/finance/char-siu-production", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "settings",
          blockUnitWeightG: settingsDraft.blockWeight,
          lardUnitWeightG: settingsDraft.lardWeight,
          mincedChashuUnitWeightG: settingsDraft.mincedChashuWeight,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "設定を保存できませんでした");
      setSettings(data.settings);
      toast.success("出来高の基準重量を保存しました");
    } catch (error: any) {
      toast.error(error.message || "設定を保存できませんでした");
    } finally {
      setSaving(false);
    }
  };

  const syncLaborSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/finance/char-siu-production", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_labor" }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "TSGの時間単価を取得できませんでした");
      setSettings(data.settings);
      toast.success("TSGの製造スタッフ平均時間単価を更新しました");
    } catch (error: any) {
      toast.error(error.message || "TSGの時間単価を取得できませんでした");
    } finally {
      setSaving(false);
    }
  };

  const saveRun = async () => {
    if (!selectedRun || !draft) return;
    setSaving(true);
    try {
      const response = await fetch("/api/finance/char-siu-production", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run",
          id: selectedRun.id,
          productionDate: draft.productionDate,
          workerCount: draft.workerCount,
          workHours: draft.workHours,
          notes: draft.notes,
          materials: draft.materials.map((material) => ({
            key: material.key,
            usageAmount: material.usageAmount,
            purchaseUnitQuantity: material.purchaseUnitQuantity,
            purchasePriceTaxIncluded: material.purchasePriceTaxIncluded,
          })),
          outputs: draft.outputs.map((output) => ({
            key: output.key,
            quantity: output.quantity,
            unitWeightG: output.unitWeightG,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "製造原価を保存できませんでした");
      toast.success("製造原価を再計算しました");
      await loadData(month, selectedRun.id);
    } catch (error: any) {
      toast.error(error.message || "製造原価を保存できませんでした");
    } finally {
      setSaving(false);
    }
  };

  const syncRunLabor = async () => {
    if (!selectedRun) return;
    setSaving(true);
    try {
      const response = await fetch("/api/finance/char-siu-production", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_run_labor", id: selectedRun.id }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "この製造日の時間単価を取得できませんでした");
      toast.success("製造日のTSG平均時間単価で再計算しました");
      await loadData(month, selectedRun.id);
    } catch (error: any) {
      toast.error(error.message || "この製造日の時間単価を取得できませんでした");
    } finally {
      setSaving(false);
    }
  };

  const deleteRun = async () => {
    if (!selectedRun || !window.confirm(`${formatDate(selectedRun.production_date)}の製造実績を削除しますか？`)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/finance/char-siu-production?id=${encodeURIComponent(selectedRun.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "削除できませんでした");
      toast.success("製造実績を削除しました");
      await loadData(month);
    } catch (error: any) {
      toast.error(error.message || "削除できませんでした");
    } finally {
      setSaving(false);
    }
  };

  if (auth === "loading") {
    return <FullPageLoading />;
  }

  if (auth === "required") {
    return (
      <main className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-50 px-4 lg:static lg:min-h-[75vh]">
        <form onSubmit={authenticate} className="w-full max-w-sm border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-slate-950 text-white">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-bold text-slate-950">財務管理者認証</h1>
              <p className="text-xs text-slate-500">チャーシュー製造原価</p>
            </div>
          </div>
          <label htmlFor="finance-password" className="mb-2 block text-sm font-semibold text-slate-700">パスワード</label>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="finance-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
              className="h-11 w-full rounded-md border border-slate-300 pl-10 pr-3 outline-none focus:border-slate-800"
            />
          </div>
          <button
            type="submit"
            disabled={!password || authenticating}
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-slate-950 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {authenticating && <Loader2 className="h-4 w-4 animate-spin" />}
            認証
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 z-50 overflow-x-hidden overflow-y-auto bg-slate-50 px-4 py-5 sm:px-6 lg:static lg:min-h-screen lg:overflow-visible lg:px-8">
      <div className="mx-auto max-w-[1480px] space-y-5">
        <header className="flex flex-col gap-3 border-b border-slate-300 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/finance/dashboard")}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              title="財務ダッシュボードへ戻る"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="flex items-center gap-2 text-xl font-bold text-slate-950 sm:text-2xl">
                <Calculator className="h-6 w-6 text-emerald-600" />
                チャーシュー製造原価
              </h1>
              <p className="mt-1 text-xs text-slate-500">TSG人件費・取得元別の保存単価・重量按分</p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <CalendarDays className="h-4 w-4" />
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 outline-none focus:border-slate-700"
            />
          </label>
        </header>

        <section className="border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 sm:px-5">
            <Settings2 className="h-5 w-5 text-slate-600" />
            <h2 className="font-bold text-slate-900">連携状況と出来高設定</h2>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4 sm:p-5">
            <div className="min-w-0 border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-bold text-slate-500">TSG 製造スタッフ平均時間単価</div>
              <div className="mt-1 text-xl font-black tabular-nums text-slate-950">{Number(settings?.hourly_wage || 0) > 0 ? formatYen(settings?.hourly_wage, 2) : "未同期"}</div>
              <div className="mt-1 text-[11px] text-slate-500">
                対象 {formatNumber(settings?.labor_rate_staff_count)}人
                {Number(settings?.labor_rate_excluded_count || 0) > 0 ? ` / 除外 ${formatNumber(settings?.labor_rate_excluded_count)}人` : ""}
                {settings?.labor_rate_effective_date ? ` / ${formatDate(settings.labor_rate_effective_date)}時点` : ""}
              </div>
            </div>
            <AdminNumberField label="ブロック1個重量" value={settingsDraft.blockWeight} suffix="g" onChange={(value) => setSettingsDraft((current) => ({ ...current, blockWeight: value }))} />
            <AdminNumberField label="ラード1個重量" value={settingsDraft.lardWeight} suffix="g" onChange={(value) => setSettingsDraft((current) => ({ ...current, lardWeight: value }))} />
            <AdminNumberField label="挽チャーシュー1個重量" value={settingsDraft.mincedChashuWeight} suffix="g" onChange={(value) => setSettingsDraft((current) => ({ ...current, mincedChashuWeight: value }))} />
          </div>
          <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <span className="text-xs text-slate-500">最終同期 {settings?.labor_rate_synced_at ? formatDateTime(settings.labor_rate_synced_at) : "未同期"}</span>
            <div className="flex gap-2">
              <button type="button" onClick={syncLaborSettings} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                <RefreshCw className="h-4 w-4" />
                TSG再同期
              </button>
              <button type="button" onClick={saveSettings} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                <Save className="h-4 w-4" />
                重量設定保存
              </button>
            </div>
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="border border-slate-200 bg-white xl:self-start">
            <div className="border-b border-slate-200 px-4 py-3 font-bold text-slate-900">製造履歴</div>
            {loading ? <LoadingBlock /> : runs.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-500">この月の実績はありません</div>
            ) : (
              <div className="max-h-[720px] divide-y divide-slate-100 overflow-y-auto">
                {runs.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => selectRun(run)}
                    className={`w-full px-4 py-3 text-left hover:bg-slate-50 ${selectedId === run.id ? "border-l-4 border-emerald-600 bg-emerald-50/70 pl-3" : ""}`}
                  >
                    <div className="font-bold text-slate-900">{formatDate(run.production_date)}</div>
                    <div className="mt-1 flex justify-between text-xs text-slate-500">
                      <span>{run.worker_count}人 / {formatNumber(run.total_person_hours, 2)}人時</span>
                      <span>{formatNumber(run.total_output_quantity)}個</span>
                    </div>
                    <div className="mt-1 text-sm font-bold text-emerald-700">{formatYen(run.total_cost)}</div>
                  </button>
                ))}
              </div>
            )}
          </aside>

          <div className="min-w-0 space-y-5">
            {!draft || !selectedRun || !preview ? (
              <div className="flex min-h-60 items-center justify-center border border-slate-200 bg-white text-sm text-slate-500">製造実績を選択してください</div>
            ) : (
              <>
                <section className="grid gap-px overflow-hidden border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-5">
                  <Metric label="材料費" value={formatYen(preview.materialCost)} />
                  <Metric label="人件費" value={formatYen(preview.laborCost)} />
                  <Metric label="製造原価合計" value={formatYen(preview.totalCost)} strong />
                  <Metric label="全体平均原価" value={formatYen(preview.averageCostPerItem)} sub="1個平均" />
                  <Metric label="重量平均原価" value={formatYen(preview.averageCostPerKg)} sub="1kgあたり" />
                </section>

                <section className="border border-slate-200 bg-white">
                  <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-4 sm:p-5">
                    <AdminNumberField label="製造日" value={draft.productionDate} inputType="date" suffix="" onChange={(value) => setDraft((current) => current && ({ ...current, productionDate: value }))} />
                    <AdminNumberField label="人数" value={draft.workerCount} suffix="人" onChange={(value) => setDraft((current) => current && ({ ...current, workerCount: value }))} />
                    <AdminNumberField label="1人あたり時間" value={draft.workHours} suffix="時間" onChange={(value) => setDraft((current) => current && ({ ...current, workHours: value }))} />
                    <div className="min-w-0">
                      <span className="mb-2 block text-xs font-bold text-slate-600">TSG保存時間単価</span>
                      <div className="flex h-10 items-center justify-between border border-slate-200 bg-slate-50 px-3">
                        <strong className="tabular-nums text-slate-900">{formatYen(draft.hourlyWage, 2)}</strong>
                        <span className="text-[11px] text-slate-500">{selectedRun.labor_rate_staff_count}人平均</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                    <span>取得元: {laborSourceLabel(selectedRun.labor_rate_source)} / 同期 {selectedRun.labor_rate_synced_at ? formatDateTime(selectedRun.labor_rate_synced_at) : "記録なし"}</span>
                    <button type="button" onClick={syncRunLabor} disabled={saving} className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      <RefreshCw className="h-3.5 w-3.5" />
                      この製造日で再同期
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[960px] text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-500">
                        <tr>
                          <th className="px-4 py-3 text-left">材料</th>
                          <th className="px-4 py-3 text-left">取得元</th>
                          <th className="px-4 py-3 text-right">使用量</th>
                          <th className="px-4 py-3 text-right">仕入入数</th>
                          <th className="px-4 py-3 text-right">仕入原価（税込）</th>
                          <th className="px-4 py-3 text-right">単位原価</th>
                          <th className="px-4 py-3 text-right">材料費</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {draft.materials.map((material, index) => {
                          const calculated = preview.materials[index];
                          const sourceRow = selectedRun.materials.find((row) => row.material_key === material.key);
                          return (
                            <tr key={material.key}>
                              <td className="px-4 py-3 font-bold text-slate-900">{material.name}</td>
                              <td className="px-4 py-3">
                                <div className="text-xs font-semibold text-slate-700">{materialSourceLabel(sourceRow?.price_source)}</div>
                                {sourceRow?.source_note && <div className="mt-0.5 max-w-44 truncate text-[10px] text-slate-400" title={sourceRow.source_note}>{sourceRow.source_note}</div>}
                              </td>
                              <td className="px-4 py-2"><TableNumber value={material.usageAmount} suffix={material.usageUnit} onChange={(value) => updateMaterial(setDraft, index, "usageAmount", value)} /></td>
                              <td className="px-4 py-2"><TableNumber value={material.purchaseUnitQuantity} suffix={material.usageUnit} onChange={(value) => updateMaterial(setDraft, index, "purchaseUnitQuantity", value)} /></td>
                              <td className="px-4 py-2"><TableNumber value={material.purchasePriceTaxIncluded} suffix="円" onChange={(value) => updateMaterial(setDraft, index, "purchasePriceTaxIncluded", value)} /></td>
                              <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatYen(calculated?.unitCost, 4)}</td>
                              <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">{formatYen(calculated?.materialCost)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 px-4 py-3 font-bold text-slate-900 sm:px-5">出来高別原価</div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] text-sm">
                      <thead className="bg-slate-50 text-xs text-slate-500">
                        <tr>
                          <th className="px-4 py-3 text-left">商品</th>
                          <th className="px-4 py-3 text-right">出来高</th>
                          <th className="px-4 py-3 text-right">1個重量</th>
                          <th className="px-4 py-3 text-right">按分率</th>
                          <th className="px-4 py-3 text-right">配賦原価</th>
                          <th className="px-4 py-3 text-right">個別原価</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {draft.outputs.map((output, index) => {
                          const calculated = preview.outputs[index];
                          return (
                            <tr key={output.key}>
                              <td className="px-4 py-3 font-bold text-slate-900">{output.name}</td>
                              <td className="px-4 py-2"><TableNumber value={output.quantity} suffix="個" onChange={(value) => updateOutput(setDraft, index, "quantity", value)} /></td>
                              <td className="px-4 py-2"><TableNumber value={output.unitWeightG} suffix="g" onChange={(value) => updateOutput(setDraft, index, "unitWeightG", value)} /></td>
                              <td className="px-4 py-3 text-right tabular-nums text-slate-600">{formatPercent(calculated?.allocationRatio)}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatYen(calculated?.allocatedCost)}</td>
                              <td className="px-4 py-3 text-right text-base font-bold tabular-nums text-emerald-700">{calculated?.quantity ? formatYen(calculated.unitCost) : "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="border border-slate-200 bg-white p-4 sm:p-5">
                  <label htmlFor="finance-production-notes" className="mb-2 block text-sm font-bold text-slate-900">製造メモ</label>
                  <textarea
                    id="finance-production-notes"
                    value={draft.notes}
                    onChange={(event) => setDraft((current) => current && ({ ...current, notes: event.target.value }))}
                    rows={3}
                    className="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-700"
                  />
                  <div className="mt-4 flex items-center justify-between">
                    <button type="button" onClick={deleteRun} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-md border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                      <Trash2 className="h-4 w-4" />
                      削除
                    </button>
                    <button type="button" onClick={saveRun} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-700 px-5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      原価を再計算して保存
                    </button>
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value, sub, strong = false }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className="min-w-0 bg-white px-4 py-4">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={`mt-1 truncate tabular-nums ${strong ? "text-xl font-black text-emerald-700" : "text-lg font-bold text-slate-950"}`} title={value}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

function AdminNumberField({ label, value, suffix, onChange, inputType = "number" }: { label: string; value: string; suffix: string; onChange: (value: string) => void; inputType?: "number" | "date" }) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 block text-xs font-bold text-slate-600">{label}</span>
      <div className="flex h-10 overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-slate-700">
        <input type={inputType} inputMode={inputType === "number" ? "decimal" : undefined} min={inputType === "number" ? "0" : undefined} step={inputType === "number" ? "0.01" : undefined} value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 px-3 text-right font-semibold outline-none" />
        {suffix && <span className="flex items-center border-l border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-500">{suffix}</span>}
      </div>
    </label>
  );
}

function TableNumber({ value, suffix, onChange }: { value: string; suffix: string; onChange: (value: string) => void }) {
  return (
    <div className="ml-auto flex h-9 w-36 overflow-hidden rounded-md border border-slate-300 focus-within:border-slate-700">
      <input type="number" inputMode="decimal" min="0" step="0.01" value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 px-2 text-right font-semibold outline-none" />
      <span className="flex min-w-10 items-center justify-center border-l border-slate-200 bg-slate-50 px-1 text-[11px] text-slate-500">{suffix}</span>
    </div>
  );
}

function LoadingBlock() {
  return <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />読み込み中</div>;
}

function FullPageLoading() {
  return <main className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50 lg:static lg:min-h-[75vh]"><Loader2 className="h-7 w-7 animate-spin text-slate-500" /></main>;
}

function toDraft(run: ProductionRun): RunDraft {
  return {
    productionDate: run.production_date,
    workerCount: numberText(run.worker_count),
    workHours: numberText(run.work_hours),
    hourlyWage: numberText(run.hourly_wage),
    notes: run.notes || "",
    materials: [...run.materials].sort((a, b) => a.sort_order - b.sort_order).map((material) => ({
      key: material.material_key,
      name: material.material_name,
      usageUnit: material.usage_unit,
      usageAmount: numberText(material.usage_amount),
      purchaseUnitQuantity: numberText(material.purchase_unit_quantity),
      purchasePriceTaxIncluded: numberText(material.purchase_price_tax_included),
    })),
    outputs: [...run.outputs].sort((a, b) => a.sort_order - b.sort_order).map((output) => ({
      key: output.output_key,
      name: output.output_name,
      quantity: numberText(output.quantity),
      unitWeightG: numberText(output.unit_weight_g),
    })),
  };
}

function updateMaterial(setter: React.Dispatch<React.SetStateAction<RunDraft | null>>, index: number, key: "usageAmount" | "purchaseUnitQuantity" | "purchasePriceTaxIncluded", value: string) {
  setter((current) => current && ({
    ...current,
    materials: current.materials.map((material, materialIndex) => materialIndex === index ? { ...material, [key]: value } : material),
  }));
}

function updateOutput(setter: React.Dispatch<React.SetStateAction<RunDraft | null>>, index: number, key: "quantity" | "unitWeightG", value: string) {
  setter((current) => current && ({
    ...current,
    outputs: current.outputs.map((output, outputIndex) => outputIndex === index ? { ...output, [key]: value } : output),
  }));
}

function numberText(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : "";
}

function formatDate(value: string) {
  const [year, month, day] = String(value || "").split("-");
  return year && month && day ? `${year}/${month}/${day}` : value;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function laborSourceLabel(value: string) {
  if (value === "tsg_manufacturing_average") return "TSG 製造スタッフ平均";
  if (value === "tsg_cached") return "TSG前回同期値（通信失敗時）";
  return "旧設定値";
}

function materialSourceLabel(value?: string) {
  if (value === "delivery_note_ai") return "納品書AI";
  if (value === "recipe_master") return "レシピ材料DB";
  if (value === "admin_override") return "管理者修正";
  return "旧保存値";
}

function formatNumber(value: unknown, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits }).format(Number(value) || 0);
}

function formatYen(value: unknown, maximumFractionDigits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "-";
  return `¥${new Intl.NumberFormat("ja-JP", { maximumFractionDigits }).format(Number(value))}`;
}

function formatPercent(value: unknown) {
  return `${formatNumber((Number(value) || 0) * 100, 1)}%`;
}
