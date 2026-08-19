"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  ArrowLeft,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileSearch,
  Factory,
  History,
  Loader2,
  PackageCheck,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  ScanLine,
  Smartphone,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

type MaterialConfig = {
  key: string;
  name: string;
  unit: string;
  sortOrder: number;
  priceSource: "delivery_note_ai" | "recipe_master";
};
type OutputConfig = {
  key: string;
  name: string;
  unitWeightG: number;
  sortOrder: number;
};
type ProductionRun = {
  id: string;
  production_date: string;
  worker_count: number;
  work_hours: number;
  notes: string;
  materials: Array<{ material_key: string; usage_amount: number }>;
  outputs: Array<{ output_key: string; quantity: number }>;
};

type FormState = {
  id: string;
  productionDate: string;
  workerCount: string;
  workHours: string;
  notes: string;
  materials: Record<string, string>;
  outputs: Record<string, string>;
  deliveryNoteScanId: string;
};

type DeliveryNoteScan = {
  id: string;
  status: "ready" | "needs_review" | "error";
  documentDate: string | null;
  targetProductionDate: string | null;
  sourceKind: "mobile_qr" | "doc_scanner" | "direct_upload";
  docScannerDocId?: string | null;
  createdAt?: string | null;
  fileNames: string[];
  items: Array<{
    key: string;
    name: string;
    recognized: boolean;
    sourceItemName: string | null;
    purchaseUnitQuantityG: number | null;
    purchasePriceTaxIncluded: number | null;
    taxRate: number;
    confidence: number | null;
    evidence: string | null;
  }>;
};

type DocScannerDocument = {
  docId: string;
  counterpartyName: string;
  documentDate: string | null;
  sourceType: string;
  receivedAt: string | null;
  items: Array<{
    id: string;
    name: string;
    quantity: number | null;
    unit: string | null;
    unitPrice: number | null;
    amount: number | null;
    taxRate: number | null;
  }>;
};

const todayInJapan = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export default function CharSiuProductionInputPage() {
  const router = useRouter();
  const [materials, setMaterials] = useState<MaterialConfig[]>([]);
  const [outputs, setOutputs] = useState<OutputConfig[]>([]);
  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [scan, setScan] = useState<DeliveryNoteScan | null>(null);
  const [inboxScans, setInboxScans] = useState<DeliveryNoteScan[]>([]);
  const [docScannerDocuments, setDocScannerDocuments] = useState<
    DocScannerDocument[]
  >([]);
  const [reviewScan, setReviewScan] = useState<DeliveryNoteScan | null>(null);
  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const dismissedScanIds = useRef(new Set<string>());
  const [form, setForm] = useState<FormState>(() => emptyForm([], []));

  const loadData = useCallback(async (keepForm = false) => {
    setLoading(true);
    try {
      const response = await fetch("/api/recipe/char-siu-production", {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok || !data.success)
        throw new Error(data.error || "製造実績を取得できませんでした");
      const nextMaterials = [...(data.config?.materials || [])].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      const nextOutputs = [...(data.config?.outputs || [])].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      setMaterials(nextMaterials);
      setOutputs(nextOutputs);
      setRuns(data.runs || []);
      if (!keepForm) setForm(emptyForm(nextMaterials, nextOutputs));
    } catch (error: any) {
      toast.error(error.message || "製造実績を取得できませんでした");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refreshDeliveryNotes = useCallback(
    async (productionDate: string, autoOpen = false) => {
      if (!productionDate) return;
      try {
        const response = await fetch(
          `/api/recipe/char-siu-production/delivery-notes?productionDate=${encodeURIComponent(productionDate)}`,
          { cache: "no-store" },
        );
        const data = await response.json();
        if (!response.ok || !data.success)
          throw new Error(
            data.error || "納品書の受信一覧を取得できませんでした",
          );
        const nextScans: DeliveryNoteScan[] = data.scans || [];
        setInboxScans(nextScans);
        setDocScannerDocuments(data.docScannerDocuments || []);
        if (autoOpen) {
          setReviewScan(
            (current) =>
              current ||
              nextScans.find(
                (candidate) =>
                  candidate.status === "needs_review" &&
                  !dismissedScanIds.current.has(candidate.id),
              ) ||
              null,
          );
        }
      } catch (error: any) {
        if (!autoOpen)
          toast.error(
            error.message || "納品書の受信一覧を取得できませんでした",
          );
      }
    },
    [],
  );

  useEffect(() => {
    if (form.id || !form.productionDate) return;
    refreshDeliveryNotes(form.productionDate, true);
    const timer = window.setInterval(
      () => refreshDeliveryNotes(form.productionDate, true),
      5000,
    );
    return () => window.clearInterval(timer);
  }, [form.id, form.productionDate, refreshDeliveryNotes]);

  useEffect(() => {
    if (!form.productionDate) return;
    const targetUrl = `${window.location.origin}/recipe/char-siu-production/scan?productionDate=${encodeURIComponent(form.productionDate)}`;
    QRCode.toDataURL(targetUrl, {
      width: 176,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [form.productionDate]);

  const totalPersonHours = useMemo(() => {
    const workers = Number(form.workerCount) || 0;
    const hours = Number(form.workHours) || 0;
    return workers * hours;
  }, [form.workerCount, form.workHours]);

  const totalOutputCount = useMemo(
    () =>
      outputs.reduce(
        (sum, output) => sum + (Number(form.outputs[output.key]) || 0),
        0,
      ),
    [form.outputs, outputs],
  );

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/recipe/char-siu-production", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id || undefined,
          productionDate: form.productionDate,
          workerCount: form.workerCount,
          workHours: form.workHours,
          notes: form.notes,
          deliveryNoteScanId: form.deliveryNoteScanId || undefined,
          materials: materials.map((material) => ({
            key: material.key,
            usageAmount: form.materials[material.key] || 0,
          })),
          outputs: outputs.map((output) => ({
            key: output.key,
            quantity: form.outputs[output.key] || 0,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success)
        throw new Error(data.error || "保存に失敗しました");
      toast.success(
        form.id ? "製造実績を更新しました" : "製造実績を登録しました",
      );
      await loadData();
    } catch (error: any) {
      toast.error(error.message || "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const importDocScannerDocument = async (document: DocScannerDocument) => {
    setIntakeLoading(true);
    try {
      const response = await fetch(
        "/api/recipe/char-siu-production/delivery-notes",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            docScannerDocId: document.docId,
            targetProductionDate: form.productionDate,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok || !data.success)
        throw new Error(data.error || "DocScannerから取り込めませんでした");
      setReviewScan(data.scan);
      setDocPickerOpen(false);
    } catch (error: any) {
      toast.error(error.message || "DocScannerから取り込めませんでした");
    } finally {
      setIntakeLoading(false);
    }
  };

  const confirmReviewScan = async () => {
    if (!reviewScan?.targetProductionDate)
      return toast.error("製造日を入力してください");
    setReviewSaving(true);
    try {
      const response = await fetch(
        "/api/recipe/char-siu-production/delivery-notes",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scanId: reviewScan.id,
            targetProductionDate: reviewScan.targetProductionDate,
            items: reviewScan.items,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok || !data.success)
        throw new Error(data.error || "納品書を確定できませんでした");
      setScan(data.scan);
      setForm((current) => ({
        ...current,
        productionDate: data.scan.targetProductionDate,
        deliveryNoteScanId: data.scan.id,
      }));
      setReviewScan(null);
      toast.success("単価・仕入数量を製造日に紐づけました");
      await refreshDeliveryNotes(data.scan.targetProductionDate, false);
    } catch (error: any) {
      toast.error(error.message || "納品書を確定できませんでした");
    } finally {
      setReviewSaving(false);
    }
  };

  const closeReview = () => {
    if (reviewScan) dismissedScanIds.current.add(reviewScan.id);
    setReviewScan(null);
  };

  const changeProductionDate = (productionDate: string) => {
    setScan(null);
    setForm((current) => ({
      ...current,
      productionDate,
      deliveryNoteScanId: "",
    }));
  };

  const editRun = (run: ProductionRun) => {
    setForm({
      id: run.id,
      productionDate: run.production_date,
      workerCount: String(run.worker_count ?? 1),
      workHours: String(run.work_hours ?? ""),
      notes: run.notes || "",
      materials: Object.fromEntries(
        materials.map((material) => [
          material.key,
          numberText(
            run.materials.find((row) => row.material_key === material.key)
              ?.usage_amount,
          ),
        ]),
      ),
      outputs: Object.fromEntries(
        outputs.map((output) => [
          output.key,
          numberText(
            run.outputs.find((row) => row.output_key === output.key)?.quantity,
          ),
        ]),
      ),
      deliveryNoteScanId: "",
    });
    setScan(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const reset = () => {
    setForm(emptyForm(materials, outputs));
    setScan(null);
    setReviewScan(null);
  };

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-slate-50 px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-[calc(6rem+env(safe-area-inset-bottom))] sm:pt-5 lg:static lg:min-h-screen lg:overflow-visible lg:px-8 lg:py-5">
      <div className="mx-auto max-w-[1280px] space-y-4 sm:space-y-5">
        <header className="flex flex-col gap-3 border-b border-slate-300 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/recipe")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 lg:h-10 lg:w-10"
              title="レシピ一覧へ戻る"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="flex items-center gap-2 text-lg font-bold leading-tight text-slate-950 sm:text-2xl">
                <Factory className="h-5 w-5 shrink-0 text-amber-600 sm:h-6 sm:w-6" />
                チャーシュー製造原価入力
              </h1>
              <p className="mt-1 text-xs text-slate-500">製造実績</p>
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 lg:h-10"
            >
              <RotateCcw className="h-4 w-4" />
              新規入力
            </button>
            <button
              type="button"
              onClick={save}
              disabled={
                saving || loading || (!form.id && scan?.status !== "ready")
              }
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 lg:h-10"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {form.id ? "更新" : "登録"}
            </button>
          </div>
        </header>

        <section className="rounded-md border border-slate-200 bg-white p-4 sm:p-5 lg:rounded-none">
          <div className="grid gap-5 md:grid-cols-3 md:gap-4">
            <Field label="製造日" icon={<CalendarDays className="h-4 w-4" />}>
              <input
                type="date"
                value={form.productionDate}
                onChange={(event) => changeProductionDate(event.target.value)}
                className="h-11 w-full rounded-md border border-slate-300 px-3 text-base outline-none focus:border-slate-700"
              />
            </Field>
            <Field label="関わった人数" icon={<Users className="h-4 w-4" />}>
              <NumberInput
                value={form.workerCount}
                min="1"
                step="1"
                suffix="人"
                onChange={(value) =>
                  setForm((current) => ({ ...current, workerCount: value }))
                }
              />
            </Field>
            <Field
              label="作業時間（1人あたり）"
              icon={<Clock3 className="h-4 w-4" />}
            >
              <NumberInput
                value={form.workHours}
                min="0"
                step="0.25"
                suffix="時間"
                onChange={(value) =>
                  setForm((current) => ({ ...current, workHours: value }))
                }
              />
            </Field>
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3 text-sm md:mt-4">
            <span className="text-slate-500">総作業時間</span>
            <strong className="text-base text-slate-900">
              {formatNumber(totalPersonHours, 2)} 人時
            </strong>
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white lg:rounded-none">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-slate-600" />
              <h2 className="font-bold text-slate-900">
                納品書から単価・仕入数量を取り込む
              </h2>
            </div>
            {!form.id &&
              inboxScans.some((item) => item.status === "needs_review") && (
                <span className="rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
                  確認待ち{" "}
                  {
                    inboxScans.filter((item) => item.status === "needs_review")
                      .length
                  }
                  件
                </span>
              )}
          </div>
          <div className="p-4 sm:p-5">
            {form.id ? (
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                登録時に保存した納品書単価を使用します
              </div>
            ) : (
              <div className="grid gap-5 md:grid-cols-[220px_1fr]">
                <div className="flex flex-col items-stretch border-b border-slate-200 pb-5 md:items-center md:border-b-0 md:border-r md:pb-0 md:pr-5">
                  <div className="mb-2 flex items-center gap-2 self-start text-sm font-bold text-slate-900">
                    <Smartphone className="h-4 w-4 text-amber-700" />
                    スマホで撮影
                  </div>
                  <a
                    href={`/recipe/char-siu-production/scan?productionDate=${encodeURIComponent(form.productionDate)}`}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-amber-600 px-4 text-sm font-bold text-white hover:bg-amber-700 md:hidden"
                  >
                    <Smartphone className="h-4 w-4" />
                    納品書を撮影する
                  </a>
                  <div className="hidden md:block">
                    {qrDataUrl ? (
                      <Image
                        src={qrDataUrl}
                        alt="納品書撮影画面を開くQRコード"
                        width={176}
                        height={176}
                        unoptimized
                        className="border border-slate-200"
                      />
                    ) : (
                      <div className="flex h-44 w-44 items-center justify-center border border-slate-200 bg-slate-50">
                        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-left text-xs leading-5 text-slate-500 md:text-center">
                    QRは製造日 {formatDate(form.productionDate)} を設定済みです
                  </p>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        <FileSearch className="h-4 w-4 text-cyan-700" />
                        DocScannerから取り込む
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        DocScannerが受信した納品書・レシート明細から、豚バラ肉・ネギ・生姜を抽出します
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDocPickerOpen(true)}
                      className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-md bg-cyan-700 px-4 text-sm font-bold text-white hover:bg-cyan-800 sm:h-10 sm:w-auto"
                    >
                      <FileSearch className="h-4 w-4" />
                      受信一覧{" "}
                      {docScannerDocuments.length > 0
                        ? `(${docScannerDocuments.length})`
                        : ""}
                    </button>
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-4">
                    {scan?.status === "ready" ? (
                      <div className="flex flex-col gap-3 bg-emerald-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-emerald-950">
                              単価・仕入数量を確認済み
                            </div>
                            <div className="truncate text-xs text-emerald-800">
                              {sourceLabel(scan.sourceKind)} / 製造日{" "}
                              {formatDate(
                                scan.targetProductionDate ||
                                  form.productionDate,
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReviewScan(scan)}
                          className="h-11 w-full rounded-md border border-emerald-300 bg-white px-3 text-xs font-bold text-emerald-800 sm:h-9 sm:w-auto"
                        >
                          内容を再確認
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          QR送信後は自動で確認モーダルが開きます
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            refreshDeliveryNotes(form.productionDate, true)
                          }
                          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 sm:h-9 sm:w-auto"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          受信を更新
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-md border border-slate-200 bg-white lg:rounded-none">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 sm:px-5">
            <Factory className="h-5 w-5 text-slate-600" />
            <h2 className="font-bold text-slate-900">材料使用量</h2>
          </div>
          {loading ? (
            <LoadingRow />
          ) : (
            <div className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0">
              {materials.map((material, index) => (
                <div
                  key={material.key}
                  className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5 ${index % 2 === 0 ? "sm:border-r sm:border-slate-100" : ""}`}
                >
                  <label
                    htmlFor={`material-${material.key}`}
                    className="min-w-0 flex-1 text-sm font-semibold text-slate-800"
                  >
                    <span className="block">{material.name}</span>
                    <span className="mt-0.5 block text-[11px] font-normal text-slate-400">
                      {material.priceSource === "delivery_note_ai"
                        ? "納品書AI単価"
                        : "材料DB連動"}
                    </span>
                  </label>
                  <div className="w-full sm:w-36">
                    <NumberInput
                      id={`material-${material.key}`}
                      value={form.materials[material.key] || ""}
                      min="0"
                      step="0.01"
                      suffix={material.unit}
                      onChange={(value) =>
                        setForm((current) => ({
                          ...current,
                          materials: {
                            ...current.materials,
                            [material.key]: value,
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-md border border-slate-200 bg-white lg:rounded-none">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-slate-600" />
              <h2 className="font-bold text-slate-900">出来高</h2>
            </div>
            <strong className="text-sm text-emerald-700">
              合計 {formatNumber(totalOutputCount)} 個
            </strong>
          </div>
          {loading ? (
            <LoadingRow />
          ) : (
            <div className="grid gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-3">
              {outputs.map((output) => (
                <div key={output.key} className="bg-white p-4">
                  <div className="mb-3 sm:min-h-10">
                    <div className="text-sm font-bold leading-5 text-slate-900">
                      {output.name}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      基準 {formatNumber(output.unitWeightG)}g / 個
                    </div>
                  </div>
                  <NumberInput
                    value={form.outputs[output.key] || ""}
                    min="0"
                    step="1"
                    suffix="個"
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        outputs: { ...current.outputs, [output.key]: value },
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-md border border-slate-200 bg-white p-4 sm:p-5 lg:rounded-none">
          <label
            htmlFor="production-notes"
            className="mb-2 block text-sm font-bold text-slate-900"
          >
            製造メモ
          </label>
          <textarea
            id="production-notes"
            value={form.notes}
            onChange={(event) =>
              setForm((current) => ({ ...current, notes: event.target.value }))
            }
            rows={3}
            className="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-700 sm:text-sm"
            placeholder="ロット、原料状態、作業上の特記事項"
          />
        </section>

        <section className="rounded-md border border-slate-200 bg-white lg:rounded-none">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 sm:px-5">
            <History className="h-5 w-5 text-slate-600" />
            <h2 className="font-bold text-slate-900">入力履歴</h2>
          </div>
          {loading ? (
            <LoadingRow />
          ) : runs.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              製造実績はまだありません
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {runs.map((run) => {
                const runOutputCount = run.outputs.reduce(
                  (sum, output) => sum + Number(output.quantity || 0),
                  0,
                );
                return (
                  <div
                    key={run.id}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5"
                  >
                    <div className="min-w-40">
                      <div className="font-bold text-slate-900">
                        {formatDate(run.production_date)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {run.worker_count}人 × {formatNumber(run.work_hours, 2)}
                        時間
                      </div>
                    </div>
                    <div className="flex-1 text-sm text-slate-600">
                      出来高{" "}
                      <strong className="text-slate-900">
                        {formatNumber(runOutputCount)}個
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => editRun(run)}
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 sm:h-9 sm:w-auto"
                    >
                      <Pencil className="h-4 w-4" />
                      編集
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {docPickerOpen && (
        <DocScannerPickerModal
          documents={docScannerDocuments}
          loading={intakeLoading}
          productionDate={form.productionDate}
          onClose={() => setDocPickerOpen(false)}
          onRefresh={() => refreshDeliveryNotes(form.productionDate, false)}
          onSelect={importDocScannerDocument}
        />
      )}

      {reviewScan && (
        <DeliveryNoteReviewModal
          scan={reviewScan}
          currentProductionDate={form.productionDate}
          saving={reviewSaving}
          onChange={setReviewScan}
          onClose={closeReview}
          onConfirm={confirmReviewScan}
        />
      )}
    </main>
  );
}

function DocScannerPickerModal({
  documents,
  loading,
  productionDate,
  onClose,
  onRefresh,
  onSelect,
}: {
  documents: DocScannerDocument[];
  loading: boolean;
  productionDate: string;
  onClose: () => void;
  onRefresh: () => void;
  onSelect: (document: DocScannerDocument) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-5 lg:z-[70]"
      role="dialog"
      aria-modal="true"
      aria-label="DocScanner受信一覧"
    >
      <div className="max-h-[100dvh] w-full max-w-3xl overflow-y-auto rounded-t-md bg-white shadow-2xl sm:max-h-[86vh] sm:rounded-md">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div>
            <h3 className="font-bold text-slate-950">DocScanner受信一覧</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              選択した書類を製造日 {formatDate(productionDate)}{" "}
              の確認モーダルへ送ります
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="flex h-11 w-11 items-center justify-center rounded-md border border-slate-300 text-slate-700 sm:h-9 sm:w-9"
              aria-label="受信一覧を更新"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-md border border-slate-300 text-slate-700 sm:h-9 sm:w-9"
              aria-label="閉じる"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {documents.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <FileSearch className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-semibold text-slate-700">
                対象材料を含む受信書類はありません
              </p>
              <p className="mt-1 text-xs text-slate-500">
                DocScannerで納品書またはレシートを読み取った後、更新してください
              </p>
            </div>
          ) : (
            documents.map((document) => (
              <div key={document.docId} className="px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">
                        {document.counterpartyName}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {document.sourceType === "receipt"
                          ? "レシート"
                          : "納品書"}
                      </span>
                      <span className="text-xs text-slate-500">
                        書類日 {formatDate(document.documentDate || "-")}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {document.items.map((item) => (
                        <span
                          key={item.id}
                          className="max-w-full truncate border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs text-cyan-900"
                        >
                          {item.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => onSelect(document)}
                    className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-bold text-white disabled:opacity-40 sm:h-10 sm:w-auto"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileSearch className="h-4 w-4" />
                    )}
                    取り込んで確認
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function DeliveryNoteReviewModal({
  scan,
  currentProductionDate,
  saving,
  onChange,
  onClose,
  onConfirm,
}: {
  scan: DeliveryNoteScan;
  currentProductionDate: string;
  saving: boolean;
  onChange: (scan: DeliveryNoteScan) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const targetDate = scan.targetProductionDate || currentProductionDate;
  const dateMatches = targetDate === currentProductionDate;
  const updateItem = (
    key: string,
    field: "purchaseUnitQuantityG" | "purchasePriceTaxIncluded",
    value: string,
  ) => {
    onChange({
      ...scan,
      items: scan.items.map((item) =>
        item.key === key
          ? { ...item, [field]: value === "" ? null : Number(value) }
          : item,
      ),
    });
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-5 lg:z-[80]"
      role="dialog"
      aria-modal="true"
      aria-label="納品書の単価と数量を確認"
    >
      <div className="max-h-[100dvh] w-full max-w-4xl overflow-y-auto rounded-t-md bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-md">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div>
            <h3 className="text-base font-bold text-slate-950">
              単価・仕入数量を確認
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {sourceLabel(scan.sourceKind)} / 書類日{" "}
              {formatDate(scan.documentDate || "不明")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-700 sm:h-9 sm:w-9"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-4 sm:p-5">
          <div className="grid gap-3 border-b border-slate-200 pb-5 sm:grid-cols-[220px_1fr] sm:items-end">
            <div>
              <label
                htmlFor="review-production-date"
                className="mb-2 block text-sm font-bold text-slate-800"
              >
                この単価を使用する製造日
              </label>
              <input
                id="review-production-date"
                type="date"
                value={targetDate}
                onChange={(event) =>
                  onChange({
                    ...scan,
                    targetProductionDate: event.target.value,
                  })
                }
                className="h-11 w-full rounded-md border border-slate-300 px-3 text-base font-semibold outline-none focus:border-slate-700"
              />
            </div>
            <div
              className={`px-3 py-2 text-xs font-semibold ${dateMatches ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
            >
              {dateMatches
                ? `入力画面の製造日 ${formatDate(currentProductionDate)} と一致しています`
                : `入力画面の製造日を ${formatDate(targetDate)} に変更して取り込みます`}
            </div>
          </div>

          <div className="space-y-3">
            {scan.items.map((item) => (
              <div
                key={item.key}
                className="grid gap-3 border-b border-slate-100 pb-4 last:border-0 sm:grid-cols-[minmax(160px,1fr)_180px_180px] sm:items-end"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {item.recognized ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    )}
                    <span className="font-bold text-slate-900">
                      {item.name}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-500">
                    {item.sourceItemName || "AIで特定できませんでした"}
                  </div>
                </div>
                <ReviewNumberField
                  label="仕入数量"
                  value={item.purchaseUnitQuantityG}
                  suffix="g"
                  onChange={(value) =>
                    updateItem(item.key, "purchaseUnitQuantityG", value)
                  }
                />
                <ReviewNumberField
                  label="税込価格"
                  value={item.purchasePriceTaxIncluded}
                  suffix="円"
                  onChange={(value) =>
                    updateItem(item.key, "purchasePriceTaxIncluded", value)
                  }
                />
              </div>
            ))}
          </div>

          <div className="bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600">
            ここで確定した「税込価格 ÷
            仕入数量」を原料単価として保存します。製造で実際に使った量は、下の材料使用量へ別に入力してください。
          </div>
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:justify-end sm:px-5 sm:py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-11 rounded-md border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 disabled:opacity-50"
          >
            後で確認
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving || !targetDate}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-slate-950 px-5 text-sm font-bold text-white disabled:opacity-40"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {dateMatches ? "この製造日に取り込む" : "製造日を変更して取り込む"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewNumberField({
  label,
  value,
  suffix,
  onChange,
}: {
  label: string;
  value: number | null;
  suffix: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold text-slate-600">
        {label}
      </span>
      <span className="flex h-11 overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-slate-700">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 px-3 text-right text-base font-semibold text-slate-950 outline-none"
        />
        <span className="flex w-10 items-center justify-center border-l border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
          {suffix}
        </span>
      </span>
    </label>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-800">
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

function NumberInput({
  id,
  value,
  onChange,
  suffix,
  min,
  step,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  suffix: string;
  min: string;
  step: string;
}) {
  return (
    <div className="flex h-11 overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-slate-700">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        min={min}
        step={step}
        className="min-w-0 flex-1 px-3 text-right text-base font-semibold text-slate-950 outline-none"
      />
      <span className="flex min-w-12 items-center justify-center border-l border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-500">
        {suffix}
      </span>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      読み込み中
    </div>
  );
}

function emptyForm(
  materials: MaterialConfig[],
  outputs: OutputConfig[],
): FormState {
  return {
    id: "",
    productionDate: todayInJapan(),
    workerCount: "1",
    workHours: "",
    notes: "",
    materials: Object.fromEntries(
      materials.map((material) => [material.key, ""]),
    ),
    outputs: Object.fromEntries(outputs.map((output) => [output.key, ""])),
    deliveryNoteScanId: "",
  };
}

function numberText(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number !== 0 ? String(number) : "";
}

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits }).format(
    value || 0,
  );
}

function formatDate(value: string) {
  const [year, month, day] = String(value || "").split("-");
  return year && month && day ? `${year}/${month}/${day}` : value;
}

function sourceLabel(value: DeliveryNoteScan["sourceKind"]) {
  if (value === "mobile_qr") return "スマホQR撮影";
  if (value === "doc_scanner") return "DocScanner";
  return "画面アップロード";
}
