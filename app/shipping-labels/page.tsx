"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  History,
  Link2,
  PackageCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Trash2,
  Truck,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_SENDER_SETTINGS,
  type ConversionTableRow,
  type ConversionResult,
  type DeliveryPattern,
  type MissingMapping,
  type RawRow,
  type SenderSettings,
  type ShippingSource,
  buildMissingMappingCsv,
  buildSagawaCsv,
  buildYamatoCsv,
  convertAmazonOrders,
  convertYahooOrders,
  readSheetFile,
} from "@/lib/shipping-labels";

const patternOptions: DeliveryPattern[] = [
  "通常",
  "冷凍",
  "冷蔵",
  "ネコポス",
  "未設定",
];
type MissingSkuDraft = {
  labelName: string;
  deliveryPattern: DeliveryPattern;
  complementId?: string;
};
type MissingSkuRow = MissingMapping & { count: number };
type ExportCarrier = "yamato" | "sagawa";
type ShippingLabelHistoryExport = {
  id: string;
  carrier: ExportCarrier;
  fileName: string;
  rowCount: number;
  createdAt: string;
  csvContent?: string;
};
type ShippingLabelHistory = {
  id: string;
  source: ShippingSource;
  sourceFileName: string;
  sourceRowCount: number;
  createdAt: string;
  updatedAt: string;
  exports: ShippingLabelHistoryExport[];
};
type ShippingLabelHistoryDetail = ShippingLabelHistory & {
  sourceRows: RawRow[];
  settings: Partial<SenderSettings>;
  conversionSnapshot: Partial<ConversionResult>;
};

export default function ShippingLabelsPage() {
  const [source, setSource] = useState<ShippingSource>("amazon");
  const [amazonRows, setAmazonRows] = useState<RawRow[]>([]);
  const [yahooRows, setYahooRows] = useState<RawRow[]>([]);
  const [conversionRows, setConversionRows] = useState<ConversionTableRow[]>(
    [],
  );
  const [amazonFileName, setAmazonFileName] = useState("");
  const [yahooFileName, setYahooFileName] = useState("");
  const [settings, setSettings] = useState<SenderSettings>(
    DEFAULT_SENDER_SETTINGS,
  );
  const [search, setSearch] = useState("");
  const [patternFilter, setPatternFilter] = useState<DeliveryPattern | "全て">(
    "全て",
  );
  const [fileLoading, setFileLoading] = useState(false);
  const [mappingsLoading, setMappingsLoading] = useState(true);
  const [savingMappingId, setSavingMappingId] = useState<string | null>(null);
  const [missingDrafts, setMissingDrafts] = useState<
    Record<string, MissingSkuDraft>
  >({});
  const [histories, setHistories] = useState<ShippingLabelHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyActionId, setHistoryActionId] = useState<string | null>(null);
  const [activeHistoryIds, setActiveHistoryIds] = useState<
    Partial<Record<ShippingSource, string>>
  >({});

  useEffect(() => {
    loadMappings();
    loadHistories();
  }, []);

  const activeRows = source === "amazon" ? amazonRows : yahooRows;
  const activeFileName = source === "amazon" ? amazonFileName : yahooFileName;
  const sourceLabel = source === "amazon" ? "Amazon" : "Yahoo";
  const result = useMemo(() => {
    return source === "amazon"
      ? convertAmazonOrders(amazonRows, conversionRows, settings)
      : convertYahooOrders(yahooRows, conversionRows, settings);
  }, [source, amazonRows, yahooRows, conversionRows, settings]);

  const conversionSummary = useMemo(() => {
    const counts: Record<DeliveryPattern, number> = {
      通常: 0,
      冷凍: 0,
      冷蔵: 0,
      ネコポス: 0,
      未設定: 0,
    };
    for (const row of conversionRows) counts[row.deliveryPattern] += 1;
    return counts;
  }, [conversionRows]);

  const filteredConversionRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return conversionRows.filter((row) => {
      const matchesPattern =
        patternFilter === "全て" || row.deliveryPattern === patternFilter;
      const matchesKeyword =
        !keyword ||
        row.sku.toLowerCase().includes(keyword) ||
        row.yahooItemId.toLowerCase().includes(keyword) ||
        row.labelName.toLowerCase().includes(keyword) ||
        row.amazonName.toLowerCase().includes(keyword) ||
        row.yahooName.toLowerCase().includes(keyword);
      return matchesPattern && matchesKeyword;
    });
  }, [conversionRows, patternFilter, search]);

  const missingSkuRows = useMemo(() => {
    const map = new Map<string, MissingSkuRow>();
    for (const row of result.missingMappings) {
      const key = row.sku || row.productName || row.orderId;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { ...row, count: 1 });
      }
    }
    return Array.from(map.values());
  }, [result.missingMappings]);

  useEffect(() => {
    setMissingDrafts((prev) => {
      const next = { ...prev };
      for (const row of missingSkuRows) {
        const key = missingDraftKey(row.source, row.sku);
        const complement = findComplementMapping(
          row.productName,
          row.source,
          conversionRows,
        );
        if (
          !next[key] ||
          (next[key].deliveryPattern === "未設定" && complement)
        ) {
          next[key] = {
            labelName: complement?.labelName || row.productName,
            deliveryPattern: complement?.deliveryPattern || "未設定",
            complementId: complement?.id,
          };
        }
      }
      return next;
    });
  }, [missingSkuRows, conversionRows]);

  const loadMappings = async () => {
    setMappingsLoading(true);
    try {
      const res = await fetch("/api/shipping-labels/mappings", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "変換表の取得に失敗しました");
      setConversionRows(data.mappings || []);
    } catch (error: any) {
      toast.error(error.message || "変換表の取得に失敗しました");
    } finally {
      setMappingsLoading(false);
    }
  };

  const loadHistories = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/shipping-labels/history", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "履歴の取得に失敗しました");
      setHistories(data.histories || []);
    } catch (error: any) {
      toast.error(error.message || "履歴の取得に失敗しました");
    } finally {
      setHistoryLoading(false);
    }
  };

  const persistImportHistory = async (
    importedSource: ShippingSource,
    fileName: string,
    rows: RawRow[],
    conversionSnapshot: ConversionResult,
  ) => {
    const res = await fetch("/api/shipping-labels/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: importedSource,
        sourceFileName: fileName,
        sourceRows: rows,
        settings,
        conversionSnapshot,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success)
      throw new Error(data.error || "取込履歴の保存に失敗しました");
    const historyId = String(data.history.id);
    setActiveHistoryIds((prev) => ({ ...prev, [importedSource]: historyId }));
    await loadHistories();
    return historyId;
  };

  const handleOrderFile = async (file?: File | null) => {
    if (!file) return;
    const importedSource = source;
    setFileLoading(true);
    try {
      const rows = await readSheetFile(file);
      const conversionSnapshot =
        importedSource === "amazon"
          ? convertAmazonOrders(rows, conversionRows, settings)
          : convertYahooOrders(rows, conversionRows, settings);
      if (importedSource === "amazon") {
        setAmazonRows(rows);
        setAmazonFileName(file.name);
      } else {
        setYahooRows(rows);
        setYahooFileName(file.name);
      }
      try {
        await persistImportHistory(
          importedSource,
          file.name,
          rows,
          conversionSnapshot,
        );
        toast.success(
          `${importedSource === "amazon" ? "Amazon" : "Yahoo"}注文 ${rows.length.toLocaleString()}行を読み込み、履歴へ保存しました`,
        );
      } catch (historyError: any) {
        toast.error(
          historyError.message ||
            "注文は読み込みましたが、履歴保存に失敗しました",
        );
      }
    } catch (error: any) {
      toast.error(
        error.message ||
          `${importedSource === "amazon" ? "Amazon" : "Yahoo"}注文データの読み込みに失敗しました`,
      );
    } finally {
      setFileLoading(false);
    }
  };

  const clearOrderFile = () => {
    if (source === "amazon") {
      setAmazonRows([]);
      setAmazonFileName("");
    } else {
      setYahooRows([]);
      setYahooFileName("");
    }
    setActiveHistoryIds((prev) => ({ ...prev, [source]: undefined }));
    setMissingDrafts({});
    toast.info("読み込みデータをクリアしました");
  };

  const updateConversionRow = (
    index: number,
    updates: Partial<ConversionTableRow>,
  ) => {
    setConversionRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...updates } : row)),
    );
  };

  const addBlankMapping = () => {
    setPatternFilter("全て");
    setConversionRows((prev) => [
      {
        amazonName: "",
        sku: "",
        yahooName: "",
        yahooItemId: "",
        labelName: "",
        amazonPattern: "",
        deliveryPattern: "未設定",
        sortOrder: 0,
      },
      ...prev,
    ]);
  };

  const saveMapping = async (row: ConversionTableRow) => {
    if (!row.sku.trim() && !row.yahooItemId.trim()) {
      toast.error("Amazon SKUまたはYahoo商品コードを入力してください");
      return;
    }
    setSavingMappingId(row.id || row.sku || row.yahooItemId || "new");
    try {
      const res = await fetch("/api/shipping-labels/mappings", {
        method: row.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "保存に失敗しました");
      await loadMappings();
      toast.success("変換表を保存しました");
    } catch (error: any) {
      toast.error(error.message || "保存に失敗しました");
    } finally {
      setSavingMappingId(null);
    }
  };

  const deleteMapping = async (row: ConversionTableRow) => {
    if (!row.id) {
      setConversionRows((prev) => prev.filter((item) => item !== row));
      return;
    }
    if (!confirm(`${row.sku || row.yahooItemId} を変換表から削除しますか？`))
      return;
    setSavingMappingId(row.id);
    try {
      const res = await fetch("/api/shipping-labels/mappings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "削除に失敗しました");
      setConversionRows((prev) => prev.filter((item) => item.id !== row.id));
      toast.success("変換表から削除しました");
    } catch (error: any) {
      toast.error(error.message || "削除に失敗しました");
    } finally {
      setSavingMappingId(null);
    }
  };

  const addMissingRowsToConversionTable = async () => {
    const additions = missingSkuRows.map((row) => buildMappingFromMissing(row));
    if (!additions.length) {
      toast.info("追加できる未登録商品はありません");
      return;
    }
    try {
      const res = await fetch("/api/shipping-labels/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: additions }),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "未登録商品の追加に失敗しました");
      await loadMappings();
      setPatternFilter("未設定");
      toast.success(
        `${additions.length.toLocaleString()}件を変換表へ追加しました`,
      );
    } catch (error: any) {
      toast.error(error.message || "未登録商品の追加に失敗しました");
    }
  };

  const updateMissingDraft = (
    row: MissingSkuRow,
    updates: Partial<MissingSkuDraft>,
  ) => {
    const key = missingDraftKey(row.source, row.sku);
    setMissingDrafts((prev) => ({
      ...prev,
      [key]: {
        labelName: prev[key]?.labelName ?? "",
        deliveryPattern: prev[key]?.deliveryPattern ?? "未設定",
        complementId: prev[key]?.complementId,
        ...updates,
      },
    }));
  };

  const buildMappingFromMissing = (row: MissingSkuRow): ConversionTableRow => {
    const key = missingDraftKey(row.source, row.sku);
    const draft = missingDrafts[key] ?? {
      labelName: row.productName,
      deliveryPattern: "未設定" as DeliveryPattern,
    };
    const complement = draft.complementId
      ? conversionRows.find((mapping) => mapping.id === draft.complementId)
      : undefined;
    return {
      id: complement?.id,
      sku: row.source === "amazon" ? row.sku : complement?.sku || "",
      amazonName:
        row.source === "amazon"
          ? row.productName
          : complement?.amazonName || "",
      yahooItemId:
        row.source === "yahoo" ? row.sku : complement?.yahooItemId || "",
      yahooName:
        row.source === "yahoo" ? row.productName : complement?.yahooName || "",
      labelName:
        draft.labelName.trim() || complement?.labelName || row.productName,
      amazonPattern:
        row.source === "amazon"
          ? row.shipServiceLevel
          : complement?.amazonPattern || "",
      deliveryPattern: draft.deliveryPattern,
      sortOrder: complement?.sortOrder || conversionRows.length + 1,
    };
  };

  const saveMissingMapping = async (row: MissingSkuRow) => {
    const draft = missingDrafts[missingDraftKey(row.source, row.sku)] ?? {
      labelName: row.productName,
      deliveryPattern: "未設定",
    };
    const sku = row.sku.trim();
    if (!sku) {
      toast.error("商品コードが空の行は登録できません");
      return;
    }
    if (draft.deliveryPattern === "未設定") {
      toast.error("配送区分を選んでください");
      return;
    }
    setSavingMappingId(`missing-${sku}`);
    try {
      const mapping = buildMappingFromMissing(row);
      const res = await fetch("/api/shipping-labels/mappings", {
        method: mapping.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mapping),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "未登録商品の追加に失敗しました");
      await loadMappings();
      setSearch(sku);
      setPatternFilter(draft.deliveryPattern);
      toast.success(`${sku} を変換表へ追加しました`);
    } catch (error: any) {
      toast.error(error.message || "未登録商品の追加に失敗しました");
    } finally {
      setSavingMappingId(null);
    }
  };

  const downloadFile = (filename: string, csv: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const ensureActiveHistory = async () => {
    const existingId = activeHistoryIds[source];
    if (existingId) return existingId;
    if (!activeRows.length || !activeFileName)
      throw new Error("先に注文データを読み込んでください");
    return persistImportHistory(source, activeFileName, activeRows, result);
  };

  const exportCarrierCsv = async (carrier: ExportCarrier) => {
    const rows = carrier === "yamato" ? result.yamatoRows : result.sagawaRows;
    if (!rows.length) return;
    const fileName =
      carrier === "yamato"
        ? `ヤマトB2_${sourceLabel}_${todayForName}.csv`
        : `佐川スマートクラブ_${sourceLabel}_${todayForName}.csv`;
    const csvContent =
      carrier === "yamato" ? buildYamatoCsv(rows) : buildSagawaCsv(rows);
    setHistoryActionId(`export-${carrier}`);
    try {
      const historyId = await ensureActiveHistory();
      const res = await fetch(
        `/api/shipping-labels/history/${historyId}/exports`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            carrier,
            fileName,
            rowCount: rows.length,
            csvContent,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "出力履歴の保存に失敗しました");
      downloadFile(fileName, csvContent);
      await loadHistories();
      toast.success(
        `${carrier === "yamato" ? "ヤマト" : "佐川"}CSVを履歴へ保存して出力しました`,
      );
    } catch (error: any) {
      toast.error(error.message || "出力履歴の保存に失敗しました");
    } finally {
      setHistoryActionId(null);
    }
  };

  const fetchHistoryDetail = async (
    historyId: string,
  ): Promise<ShippingLabelHistoryDetail> => {
    const res = await fetch(`/api/shipping-labels/history/${historyId}`, {
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok || !data.success)
      throw new Error(data.error || "履歴詳細の取得に失敗しました");
    return data.history;
  };

  const restoreHistory = async (history: ShippingLabelHistory) => {
    setHistoryActionId(`restore-${history.id}`);
    try {
      const detail = await fetchHistoryDetail(history.id);
      setSource(detail.source);
      if (detail.source === "amazon") {
        setAmazonRows(detail.sourceRows);
        setAmazonFileName(detail.sourceFileName);
      } else {
        setYahooRows(detail.sourceRows);
        setYahooFileName(detail.sourceFileName);
      }
      setSettings({ ...DEFAULT_SENDER_SETTINGS, ...detail.settings });
      setActiveHistoryIds((prev) => ({ ...prev, [detail.source]: detail.id }));
      setMissingDrafts({});
      toast.success("取込履歴を画面へ戻しました");
    } catch (error: any) {
      toast.error(error.message || "履歴の再表示に失敗しました");
    } finally {
      setHistoryActionId(null);
    }
  };

  const redownloadHistoryExport = async (
    history: ShippingLabelHistory,
    exportRow: ShippingLabelHistoryExport,
  ) => {
    setHistoryActionId(`download-${exportRow.id}`);
    try {
      const detail = await fetchHistoryDetail(history.id);
      const storedExport = detail.exports.find(
        (row) => row.id === exportRow.id,
      );
      if (!storedExport?.csvContent)
        throw new Error("保存済みCSVが見つかりません");
      downloadFile(storedExport.fileName, storedExport.csvContent);
      toast.success("保存時と同じCSVを再ダウンロードしました");
    } catch (error: any) {
      toast.error(error.message || "CSVの再ダウンロードに失敗しました");
    } finally {
      setHistoryActionId(null);
    }
  };

  const deleteHistory = async (history: ShippingLabelHistory) => {
    if (!confirm(`${history.sourceFileName} の取込・出力履歴を削除しますか？`))
      return;
    setHistoryActionId(`delete-${history.id}`);
    try {
      const res = await fetch(`/api/shipping-labels/history/${history.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || "履歴の削除に失敗しました");
      setActiveHistoryIds((prev) =>
        prev[history.source] === history.id
          ? { ...prev, [history.source]: undefined }
          : prev,
      );
      await loadHistories();
      toast.success("取込・出力履歴を削除しました");
    } catch (error: any) {
      toast.error(error.message || "履歴の削除に失敗しました");
    } finally {
      setHistoryActionId(null);
    }
  };

  const todayForName = settings.shipDate.replaceAll("/", "-");
  const hasOrderRows = activeRows.length > 0;

  return (
    <div className="mx-auto max-w-[1500px] text-slate-900">
      <div className="space-y-5 pb-6 lg:hidden">
        <header className="border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-900 text-white">
              <Truck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold">伝票発行</h1>
              <p className="truncate text-xs text-slate-500">
                Amazon・Yahoo注文を配送会社別に変換
              </p>
            </div>
          </div>
        </header>

        <nav
          className="grid grid-cols-5 overflow-hidden rounded-lg border border-slate-200 bg-white"
          aria-label="作業手順"
        >
          {[
            ["mobile-import", "1", "取込"],
            ["mobile-validation", "2", "確認"],
            ["mobile-yamato", "3", "ヤマト"],
            ["mobile-sagawa", "4", "佐川"],
            ["mobile-export", "5", "出力"],
          ].map(([id, number, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className="flex min-h-12 flex-col items-center justify-center border-r border-slate-100 px-1 text-[11px] font-semibold text-slate-600 last:border-r-0"
            >
              <span className="text-[10px] text-slate-400">{number}</span>
              {label}
            </a>
          ))}
        </nav>

        <section id="mobile-import" className="scroll-mt-24 space-y-3">
          <MobileStepTitle
            number="1"
            title="注文データを取り込む"
            icon={<Upload className="h-4 w-4" />}
          />

          <div
            className="grid h-14 grid-cols-2 rounded-lg border border-slate-200 bg-slate-100 p-1"
            role="tablist"
            aria-label="注文元"
          >
            {(["amazon", "yahoo"] as ShippingSource[]).map((tab) => {
              const active = source === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`rounded-md px-2 text-sm font-semibold ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                  onClick={() => setSource(tab)}
                >
                  {tab === "amazon" ? "Amazon" : "Yahoo!"}
                </button>
              );
            })}
          </div>

          <MobileOrderPicker
            source={source}
            fileName={activeFileName}
            rowCount={activeRows.length}
            busy={fileLoading}
            onFile={handleOrderFile}
            onClear={clearOrderFile}
          />

          <details className="group rounded-lg border border-slate-200 bg-white">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold">
              <span className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-slate-500" />
                出荷設定
              </span>
              <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
            </summary>
            <div className="grid gap-3 border-t border-slate-100 p-4 [&_input]:h-11 [&_select]:h-11">
              <SettingInput
                label="出荷日"
                value={settings.shipDate}
                onChange={(shipDate) => setSettings({ ...settings, shipDate })}
              />
              <SettingInput
                label="荷送人TEL"
                value={settings.phone}
                onChange={(phone) => setSettings({ ...settings, phone })}
              />
              <SettingInput
                label="請求先コード"
                value={settings.customerCode}
                onChange={(customerCode) =>
                  setSettings({ ...settings, customerCode })
                }
              />
              <SettingSelect
                label="佐川元着区分"
                value={settings.sagawaPaymentType}
                options={[
                  { value: "1", label: "1: 元払" },
                  { value: "2", label: "2: 着払" },
                ]}
                onChange={(sagawaPaymentType) =>
                  setSettings({ ...settings, sagawaPaymentType })
                }
              />
            </div>
          </details>

          <div className="grid grid-cols-2 gap-2">
            <MobileMetric
              label="注文読込"
              value={activeRows.length}
              tone="blue"
            />
            <MobileMetric
              label="未登録商品"
              value={result.missingMappings.length}
              tone={result.missingMappings.length ? "red" : "slate"}
            />
            <MobileMetric
              label="ヤマト"
              value={result.yamatoRows.length}
              tone="cyan"
            />
            <MobileMetric
              label="佐川"
              value={result.sagawaRows.length}
              tone="green"
            />
          </div>
        </section>

        <section id="mobile-validation" className="scroll-mt-24 space-y-3">
          <MobileStepTitle
            number="2"
            title="変換内容を確認する"
            icon={<PackageCheck className="h-4 w-4" />}
          />

          {!hasOrderRows ? (
            <MobileEmptyState text="注文データを取り込むと確認結果が表示されます" />
          ) : result.missingMappings.length === 0 ? (
            <div className="flex min-h-14 items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              未登録商品はありません
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <div className="font-bold">
                      未登録商品{" "}
                      {result.missingMappings.length.toLocaleString()}件
                    </div>
                    <div className="mt-1 text-xs">
                      登録するまで伝票CSVには含まれません。
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="min-h-10 gap-1 border-red-300 bg-white px-2 text-red-700"
                    onClick={() =>
                      downloadFile(
                        `${sourceLabel}_未登録商品_${todayForName}.csv`,
                        buildMissingMappingCsv(result.missingMappings),
                      )
                    }
                  >
                    <Download className="h-4 w-4" />
                    一覧CSV
                  </Button>
                  <Button
                    className="min-h-10 gap-1 bg-red-600 px-2 hover:bg-red-700"
                    onClick={addMissingRowsToConversionTable}
                  >
                    <Plus className="h-4 w-4" />
                    一括仮追加
                  </Button>
                </div>
              </div>
              <MobileMissingSkuEditor
                rows={missingSkuRows}
                drafts={missingDrafts}
                savingMappingId={savingMappingId}
                onDraftChange={updateMissingDraft}
                onSave={saveMissingMapping}
              />
            </>
          )}

          <details className="group rounded-lg border border-slate-200 bg-white">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold">
              <span className="flex items-center gap-2">
                <Boxes className="h-4 w-4 text-slate-500" />
                変換表を検索・編集
              </span>
              <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
            </summary>
            <div className="space-y-3 border-t border-slate-100 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-11 pl-9"
                  placeholder="SKU・商品コード・商品名"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 [&_button]:min-h-10">
                <FilterChip
                  active={patternFilter === "全て"}
                  label="全て"
                  count={conversionRows.length}
                  onClick={() => setPatternFilter("全て")}
                />
                {patternOptions.map((pattern) => (
                  <FilterChip
                    key={pattern}
                    active={patternFilter === pattern}
                    label={pattern}
                    count={conversionSummary[pattern]}
                    onClick={() => setPatternFilter(pattern)}
                  />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="min-h-10 gap-1"
                  onClick={loadMappings}
                  disabled={mappingsLoading}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${mappingsLoading ? "animate-spin" : ""}`}
                  />
                  再読込
                </Button>
                <Button
                  className="min-h-10 gap-1 bg-slate-900 hover:bg-slate-800"
                  onClick={addBlankMapping}
                >
                  <Plus className="h-4 w-4" />
                  新規追加
                </Button>
              </div>
              <MobileMappingEditor
                rows={filteredConversionRows}
                allRows={conversionRows}
                savingMappingId={savingMappingId}
                onUpdate={updateConversionRow}
                onSave={saveMapping}
                onDelete={deleteMapping}
              />
            </div>
          </details>
        </section>

        <section id="mobile-yamato" className="scroll-mt-24 space-y-3">
          <MobileStepTitle
            number="3"
            title="ヤマト伝票を確認する"
            icon={<Truck className="h-4 w-4" />}
            count={result.yamatoRows.length}
          />
          <p className="text-xs text-slate-500">
            冷凍・冷蔵・ネコポス・同梱通常
          </p>
          <MobileResultCards
            rows={result.yamatoOrders}
            sourceLabel={sourceLabel}
          />
        </section>

        <section id="mobile-sagawa" className="scroll-mt-24 space-y-3">
          <MobileStepTitle
            number="4"
            title="佐川伝票を確認する"
            icon={<Truck className="h-4 w-4" />}
            count={result.sagawaRows.length}
          />
          <p className="text-xs text-slate-500">通常発送</p>
          <MobileResultCards
            rows={result.sagawaOrders}
            sourceLabel={sourceLabel}
          />
        </section>

        <section id="mobile-export" className="scroll-mt-24 space-y-3">
          <MobileStepTitle
            number="5"
            title="CSV出力・履歴"
            icon={<Download className="h-4 w-4" />}
          />
          <div className="grid gap-2">
            <Button
              className="min-h-12 justify-between bg-blue-600 px-4 hover:bg-blue-700"
              disabled={
                !result.yamatoRows.length || historyActionId === "export-yamato"
              }
              onClick={() => exportCarrierCsv("yamato")}
            >
              <span className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                ヤマトB2 CSV
              </span>
              <span>{result.yamatoRows.length.toLocaleString()}件</span>
            </Button>
            <Button
              className="min-h-12 justify-between bg-emerald-600 px-4 hover:bg-emerald-700"
              disabled={
                !result.sagawaRows.length || historyActionId === "export-sagawa"
              }
              onClick={() => exportCarrierCsv("sagawa")}
            >
              <span className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                佐川通常 CSV
              </span>
              <span>{result.sagawaRows.length.toLocaleString()}件</span>
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2 text-sm font-bold">
              <History className="h-4 w-4" />
              取込・出力履歴
              <Badge variant="outline" className="rounded-md">
                {historyLoading ? "読込中" : `${histories.length}件`}
              </Badge>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10"
              onClick={loadHistories}
              disabled={historyLoading}
              title="履歴を再読込"
            >
              <RefreshCw
                className={`h-4 w-4 ${historyLoading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>

          <MobileHistoryList
            histories={histories}
            historyLoading={historyLoading}
            historyActionId={historyActionId}
            activeHistoryIds={activeHistoryIds}
            onRestore={restoreHistory}
            onDownload={redownloadHistoryExport}
            onDelete={deleteHistory}
          />
        </section>
      </div>

      <div className="hidden space-y-5 lg:block">
        <header className="flex flex-col gap-3 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-slate-900 text-white">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-normal">
                伝票発行システム
              </h1>
              <p className="text-sm text-slate-500">
                EC注文データをヤマトB2・佐川スマートクラブへ変換
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className="gap-2 bg-blue-600 hover:bg-blue-700"
              disabled={
                !result.yamatoRows.length || historyActionId === "export-yamato"
              }
              onClick={() => exportCarrierCsv("yamato")}
            >
              <Download className="h-4 w-4" />
              ヤマトB2出力
            </Button>
            <Button
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              disabled={
                !result.sagawaRows.length || historyActionId === "export-sagawa"
              }
              onClick={() => exportCarrierCsv("sagawa")}
            >
              <Download className="h-4 w-4" />
              佐川通常出力
            </Button>
          </div>
        </header>

        <div
          className="inline-flex h-11 rounded-lg border border-slate-200 bg-slate-100 p-1"
          role="tablist"
          aria-label="注文元"
        >
          {(["amazon", "yahoo"] as ShippingSource[]).map((tab) => {
            const active = source === tab;
            const label = tab === "amazon" ? "Amazon" : "Yahoo!ショッピング";
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={active}
                className={`min-w-[170px] rounded-md px-4 text-sm font-semibold transition ${
                  active
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                onClick={() => setSource(tab)}
              >
                {label}
              </button>
            );
          })}
        </div>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(380px,0.8fr)]">
          <OrderDropzone
            source={source}
            fileName={activeFileName}
            rowCount={activeRows.length}
            busy={fileLoading}
            onFile={handleOrderFile}
            onClear={clearOrderFile}
          />

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold">出荷設定</h2>
                <p className="text-xs text-slate-500">
                  必要な時だけ変更してください
                </p>
              </div>
              <Badge variant="outline" className="rounded-md">
                変換表{" "}
                {mappingsLoading
                  ? "読込中"
                  : `${conversionRows.length.toLocaleString()}件`}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SettingInput
                label="出荷日"
                value={settings.shipDate}
                onChange={(shipDate) => setSettings({ ...settings, shipDate })}
              />
              <SettingInput
                label="荷送人TEL"
                value={settings.phone}
                onChange={(phone) => setSettings({ ...settings, phone })}
              />
              <SettingInput
                label="請求先コード"
                value={settings.customerCode}
                onChange={(customerCode) =>
                  setSettings({ ...settings, customerCode })
                }
              />
              <SettingSelect
                label="佐川元着区分"
                value={settings.sagawaPaymentType}
                options={[
                  { value: "1", label: "1: 元払" },
                  { value: "2", label: "2: 着払" },
                ]}
                onChange={(sagawaPaymentType) =>
                  setSettings({ ...settings, sagawaPaymentType })
                }
              />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <MetricCard
            label="注文読込"
            value={activeRows.length}
            tone={hasOrderRows ? "blue" : "slate"}
          />
          <MetricCard
            label="ヤマト出力"
            value={result.yamatoRows.length}
            tone="cyan"
          />
          <MetricCard
            label="佐川通常"
            value={result.sagawaRows.length}
            tone="green"
          />
          <MetricCard
            label="未登録商品"
            value={result.missingMappings.length}
            tone={result.missingMappings.length ? "red" : "slate"}
          />
          <MetricCard
            label="変換表"
            value={conversionRows.length}
            tone="amber"
          />
        </section>

        {result.missingMappings.length > 0 && (
          <section className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3 text-red-800">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <div>
                  <div className="font-bold">未登録商品があります</div>
                  <div className="text-sm">
                    {result.missingMappings.length.toLocaleString()}
                    件は商品コードが未登録のため出力から除外されています。他タブに同じ商品があれば設定を補完します。
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="gap-2 border-red-300 text-red-700 hover:bg-red-100"
                  onClick={() =>
                    downloadFile(
                      `${sourceLabel}_未登録商品_${todayForName}.csv`,
                      buildMissingMappingCsv(result.missingMappings),
                    )
                  }
                >
                  <Download className="h-4 w-4" />
                  未登録CSV
                </Button>
                <Button
                  className="gap-2 bg-red-600 hover:bg-red-700"
                  onClick={addMissingRowsToConversionTable}
                >
                  <Plus className="h-4 w-4" />
                  変換表へ仮追加
                </Button>
              </div>
            </div>
            <MissingSkuEditor
              rows={missingSkuRows}
              drafts={missingDrafts}
              savingMappingId={savingMappingId}
              onDraftChange={updateMissingDraft}
              onSave={saveMissingMapping}
            />
          </section>
        )}

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <PanelHeader
            icon={<PackageCheck className="h-4 w-4" />}
            title="変換結果"
          />
          <div className="divide-y divide-slate-100">
            <ResultBlock
              title="ヤマトB2"
              description="冷凍・冷蔵・ネコポス・同梱通常"
              badge={`${result.yamatoRows.length}件`}
              rows={result.yamatoOrders}
              sourceLabel={sourceLabel}
            />
            <ResultBlock
              title="佐川スマートクラブ"
              description="通常発送"
              badge={`${result.sagawaRows.length}件`}
              rows={result.sagawaOrders}
              sourceLabel={sourceLabel}
            />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 font-bold">
              <History className="h-4 w-4" />
              取込・出力履歴
              <Badge variant="outline" className="rounded-md">
                {historyLoading
                  ? "読込中"
                  : `${histories.length.toLocaleString()}件`}
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={loadHistories}
              disabled={historyLoading}
            >
              <RefreshCw
                className={`h-4 w-4 ${historyLoading ? "animate-spin" : ""}`}
              />
              再読込
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="w-[180px] px-4 py-3 text-left font-semibold">
                    取込日時
                  </th>
                  <th className="w-[110px] px-4 py-3 text-left font-semibold">
                    注文元
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">
                    元ファイル
                  </th>
                  <th className="w-[110px] px-4 py-3 text-right font-semibold">
                    取込行
                  </th>
                  <th className="w-[250px] px-4 py-3 text-left font-semibold">
                    保存済み出力
                  </th>
                  <th className="w-[300px] px-4 py-3 text-left font-semibold">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {histories.map((history) => {
                  const latestYamato = history.exports.find(
                    (row) => row.carrier === "yamato",
                  );
                  const latestSagawa = history.exports.find(
                    (row) => row.carrier === "sagawa",
                  );
                  const isActive =
                    activeHistoryIds[history.source] === history.id;
                  return (
                    <tr
                      key={history.id}
                      className={
                        isActive ? "bg-blue-50/60" : "hover:bg-slate-50"
                      }
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="font-medium">
                          {formatHistoryDate(history.createdAt)}
                        </div>
                        {isActive && (
                          <div className="mt-0.5 text-[11px] font-semibold text-blue-700">
                            現在表示中
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className="rounded-md bg-white"
                        >
                          {history.source === "amazon" ? "Amazon" : "Yahoo"}
                        </Badge>
                      </td>
                      <td
                        className="max-w-[360px] px-4 py-3"
                        title={history.sourceFileName}
                      >
                        <div className="truncate font-medium">
                          {history.sourceFileName}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-xs">
                        {history.sourceRowCount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2 text-xs">
                          <HistoryExportBadge
                            label="ヤマト"
                            exportRow={latestYamato}
                          />
                          <HistoryExportBadge
                            label="佐川"
                            exportRow={latestSagawa}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 px-2.5"
                            disabled={
                              historyActionId === `restore-${history.id}`
                            }
                            onClick={() => restoreHistory(history)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            再表示
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 border-blue-200 px-2.5 text-blue-700"
                            disabled={
                              !latestYamato ||
                              historyActionId === `download-${latestYamato?.id}`
                            }
                            onClick={() =>
                              latestYamato &&
                              redownloadHistoryExport(history, latestYamato)
                            }
                          >
                            <Download className="h-3.5 w-3.5" />
                            ヤマト
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 border-emerald-200 px-2.5 text-emerald-700"
                            disabled={
                              !latestSagawa ||
                              historyActionId === `download-${latestSagawa?.id}`
                            }
                            onClick={() =>
                              latestSagawa &&
                              redownloadHistoryExport(history, latestSagawa)
                            }
                          >
                            <Download className="h-3.5 w-3.5" />
                            佐川
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 border-red-200 text-red-600 hover:bg-red-50"
                            title="取込・出力履歴を削除"
                            disabled={
                              historyActionId === `delete-${history.id}`
                            }
                            onClick={() => deleteHistory(history)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!historyLoading && !histories.length && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-slate-400"
                    >
                      これから読み込む注文データと出力CSVがここに保存されます
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            最新50件を表示。再ダウンロードは、当時出力したCSVを変更せずに取得します。
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <PanelHeader icon={<Boxes className="h-4 w-4" />} title="変換表" />
          <div className="border-b border-slate-100 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <FilterChip
                    active={patternFilter === "全て"}
                    label="全て"
                    count={conversionRows.length}
                    onClick={() => setPatternFilter("全て")}
                  />
                  {patternOptions.map((pattern) => (
                    <FilterChip
                      key={pattern}
                      active={patternFilter === pattern}
                      label={pattern}
                      count={conversionSummary[pattern]}
                      onClick={() => setPatternFilter(pattern)}
                    />
                  ))}
                </div>
                <div className="text-xs text-slate-500">
                  {mappingsLoading
                    ? "DBから読み込み中..."
                    : `${filteredConversionRows.length.toLocaleString()}件を表示中`}
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative min-w-[260px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                    placeholder="Amazon SKU / Yahooコード / 商品名"
                  />
                </div>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={loadMappings}
                  disabled={mappingsLoading}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${mappingsLoading ? "animate-spin" : ""}`}
                  />
                  再読込
                </Button>
                <Button
                  className="gap-2 bg-slate-900 hover:bg-slate-800"
                  onClick={addBlankMapping}
                >
                  <Plus className="h-4 w-4" />
                  新規追加
                </Button>
              </div>
            </div>
          </div>
          <div className="max-h-[680px] overflow-auto">
            <table className="w-full min-w-[1320px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
                <tr>
                  <th className="w-[140px] px-4 py-3 text-left font-semibold">
                    配送
                  </th>
                  <th className="w-[260px] px-4 py-3 text-left font-semibold">
                    伝票記載名
                  </th>
                  <th className="px-4 py-3 text-left font-semibold">Amazon</th>
                  <th className="px-4 py-3 text-left font-semibold">
                    Yahoo!ショッピング
                  </th>
                  <th className="w-[160px] px-4 py-3 text-left font-semibold">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredConversionRows.slice(0, 300).map((row) => {
                  const index = conversionRows.indexOf(row);
                  const rowKey =
                    row.id || `${row.sku}-${row.yahooItemId}-${index}`;
                  const busy =
                    savingMappingId === (row.id || row.sku || row.yahooItemId);
                  return (
                    <tr key={rowKey} className="hover:bg-slate-50">
                      <td className="px-4 py-3 align-top">
                        <select
                          value={row.deliveryPattern}
                          onChange={(e) =>
                            updateConversionRow(index, {
                              deliveryPattern: e.target
                                .value as DeliveryPattern,
                            })
                          }
                          className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
                        >
                          {patternOptions.map((pattern) => (
                            <option key={pattern} value={pattern}>
                              {pattern}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Input
                          value={row.labelName}
                          onChange={(e) =>
                            updateConversionRow(index, {
                              labelName: e.target.value,
                            })
                          }
                          className="h-9"
                        />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="grid grid-cols-[150px_minmax(220px,1fr)] gap-2">
                          <Input
                            value={row.sku}
                            onChange={(e) =>
                              updateConversionRow(index, {
                                sku: e.target.value,
                              })
                            }
                            className="h-9 font-mono text-xs"
                            placeholder="Amazon SKU"
                          />
                          <Input
                            value={row.amazonName}
                            onChange={(e) =>
                              updateConversionRow(index, {
                                amazonName: e.target.value,
                              })
                            }
                            className="h-9"
                            placeholder="Amazon商品名"
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="grid grid-cols-[150px_minmax(220px,1fr)] gap-2">
                          <Input
                            value={row.yahooItemId}
                            onChange={(e) =>
                              updateConversionRow(index, {
                                yahooItemId: e.target.value,
                              })
                            }
                            className="h-9 font-mono text-xs"
                            placeholder="Yahoo商品コード"
                          />
                          <Input
                            value={row.yahooName}
                            onChange={(e) =>
                              updateConversionRow(index, {
                                yahooName: e.target.value,
                              })
                            }
                            className="h-9"
                            placeholder="Yahoo商品名"
                          />
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 align-top">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 gap-1 px-2"
                            disabled={busy}
                            onClick={() => saveMapping(row)}
                          >
                            <Save className="h-3.5 w-3.5" />
                            保存
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 gap-1 border-red-200 px-2 text-red-600 hover:bg-red-50"
                            disabled={busy}
                            onClick={() => deleteMapping(row)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            削除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!filteredConversionRows.length && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-slate-400"
                    >
                      表示できる変換表がありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function MobileStepTitle({
  number,
  title,
  icon,
  count,
}: {
  number: string;
  title: string;
  icon: ReactNode;
  count?: number;
}) {
  return (
    <div className="flex min-h-10 items-center gap-2">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-900 text-xs font-bold text-white">
        {number}
      </span>
      <span className="text-sm font-bold">{title}</span>
      <span className="text-slate-400">{icon}</span>
      {typeof count === "number" && (
        <Badge variant="outline" className="ml-auto rounded-md bg-white">
          {count.toLocaleString()}件
        </Badge>
      )}
    </div>
  );
}

function MobileOrderPicker({
  source,
  fileName,
  rowCount,
  busy,
  onFile,
  onClear,
}: {
  source: ShippingSource;
  fileName: string;
  rowCount: number;
  busy: boolean;
  onFile: (file?: File | null) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-blue-600 text-white">
          <FileSpreadsheet className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">
            {source === "amazon" ? "Amazon" : "Yahoo!"}注文ファイル
          </div>
          <div className="mt-1 break-all text-xs text-slate-500">
            {fileName || "未選択"}
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-700">
            {rowCount.toLocaleString()}行
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <Button
          type="button"
          className="min-h-11 gap-2 bg-blue-600 hover:bg-blue-700"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <Upload className="h-4 w-4" />
          {busy ? "読込中..." : "ファイルを選択"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 border-red-200 text-red-600"
          title="読み込んだデータをクリア"
          aria-label="読み込んだデータをクリア"
          onClick={() => {
            if (inputRef.current) inputRef.current.value = "";
            onClear();
          }}
          disabled={busy || (!fileName && rowCount === 0)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept=".xlsx,.xls,.csv,.txt,.tsv"
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}

function MobileMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "cyan" | "green" | "red" | "slate";
}) {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    red: "border-red-200 bg-red-50 text-red-800",
    slate: "border-slate-200 bg-white text-slate-700",
  };
  return (
    <div className={`min-h-16 rounded-lg border px-3 py-2 ${tones[tone]}`}>
      <div className="text-[11px] font-semibold">{label}</div>
      <div className="mt-1 text-lg font-bold leading-none">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function MobileEmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-20 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-4 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function MobileMissingSkuEditor({
  rows,
  drafts,
  savingMappingId,
  onDraftChange,
  onSave,
}: {
  rows: MissingSkuRow[];
  drafts: Record<string, MissingSkuDraft>;
  savingMappingId: string | null;
  onDraftChange: (
    row: MissingSkuRow,
    updates: Partial<MissingSkuDraft>,
  ) => void;
  onSave: (row: MissingSkuRow) => void;
}) {
  return (
    <div className="space-y-2">
      {rows.slice(0, 50).map((row, index) => {
        const draft = drafts[missingDraftKey(row.source, row.sku)] ?? {
          labelName: row.productName,
          deliveryPattern: "未設定" as DeliveryPattern,
        };
        const busy = savingMappingId === `missing-${row.sku}`;
        return (
          <article
            key={`${row.source}-${row.sku}-${index}`}
            className="rounded-lg border border-red-200 bg-white p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="break-all font-mono text-xs font-semibold text-slate-700">
                  {row.sku || "商品コードなし"}
                </div>
                <div className="mt-1 break-words text-sm font-bold">
                  {row.productName || "商品名なし"}
                </div>
              </div>
              <Badge
                variant="outline"
                className="shrink-0 rounded-md bg-red-50 text-red-700"
              >
                {row.count.toLocaleString()}件
              </Badge>
            </div>
            {draft.complementId && (
              <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <Link2 className="h-3.5 w-3.5" />
                {row.source === "amazon" ? "Yahoo" : "Amazon"}の商品設定から補完
              </div>
            )}
            <div className="mt-3 grid gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">
                  配送区分
                </span>
                <select
                  value={draft.deliveryPattern}
                  onChange={(event) =>
                    onDraftChange(row, {
                      deliveryPattern: event.target.value as DeliveryPattern,
                    })
                  }
                  className="h-11 w-full rounded-md border border-red-200 bg-white px-3 text-sm"
                >
                  {patternOptions.map((pattern) => (
                    <option key={pattern} value={pattern}>
                      {pattern}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">
                  伝票記載名
                </span>
                <Input
                  value={draft.labelName}
                  onChange={(event) =>
                    onDraftChange(row, { labelName: event.target.value })
                  }
                  className="h-11"
                />
              </label>
              <Button
                className="min-h-11 bg-red-600 hover:bg-red-700"
                disabled={
                  busy || !row.sku || draft.deliveryPattern === "未設定"
                }
                onClick={() => onSave(row)}
              >
                <Save className="mr-2 h-4 w-4" />
                登録して変換へ反映
              </Button>
            </div>
          </article>
        );
      })}
      {rows.length > 50 && (
        <div className="py-2 text-center text-xs text-slate-500">
          先頭50件を表示中です
        </div>
      )}
    </div>
  );
}

function MobileMappingEditor({
  rows,
  allRows,
  savingMappingId,
  onUpdate,
  onSave,
  onDelete,
}: {
  rows: ConversionTableRow[];
  allRows: ConversionTableRow[];
  savingMappingId: string | null;
  onUpdate: (index: number, updates: Partial<ConversionTableRow>) => void;
  onSave: (row: ConversionTableRow) => void;
  onDelete: (row: ConversionTableRow) => void;
}) {
  if (!rows.length)
    return <MobileEmptyState text="表示できる変換表がありません" />;

  return (
    <div className="divide-y divide-slate-100 border-t border-slate-100">
      {rows.slice(0, 30).map((row) => {
        const index = allRows.indexOf(row);
        const rowKey = row.id || `${row.sku}-${row.yahooItemId}-${index}`;
        const busy = savingMappingId === (row.id || row.sku || row.yahooItemId);
        return (
          <div key={rowKey} className="space-y-3 py-4">
            <div className="grid grid-cols-[120px_1fr] gap-2">
              <select
                value={row.deliveryPattern}
                onChange={(event) =>
                  onUpdate(index, {
                    deliveryPattern: event.target.value as DeliveryPattern,
                  })
                }
                className="h-11 rounded-md border border-slate-200 bg-white px-2 text-sm"
              >
                {patternOptions.map((pattern) => (
                  <option key={pattern} value={pattern}>
                    {pattern}
                  </option>
                ))}
              </select>
              <Input
                value={row.labelName}
                onChange={(event) =>
                  onUpdate(index, { labelName: event.target.value })
                }
                className="h-11"
                placeholder="伝票記載名"
              />
            </div>
            <div className="grid gap-2">
              <Input
                value={row.sku}
                onChange={(event) =>
                  onUpdate(index, { sku: event.target.value })
                }
                className="h-11 font-mono text-xs"
                placeholder="Amazon SKU"
              />
              <Input
                value={row.amazonName}
                onChange={(event) =>
                  onUpdate(index, { amazonName: event.target.value })
                }
                className="h-11"
                placeholder="Amazon商品名"
              />
              <Input
                value={row.yahooItemId}
                onChange={(event) =>
                  onUpdate(index, { yahooItemId: event.target.value })
                }
                className="h-11 font-mono text-xs"
                placeholder="Yahoo商品コード"
              />
              <Input
                value={row.yahooName}
                onChange={(event) =>
                  onUpdate(index, { yahooName: event.target.value })
                }
                className="h-11"
                placeholder="Yahoo商品名"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="min-h-10 gap-2"
                disabled={busy}
                onClick={() => onSave(row)}
              >
                <Save className="h-4 w-4" />
                保存
              </Button>
              <Button
                variant="outline"
                className="min-h-10 gap-2 border-red-200 text-red-600"
                disabled={busy}
                onClick={() => onDelete(row)}
              >
                <Trash2 className="h-4 w-4" />
                削除
              </Button>
            </div>
          </div>
        );
      })}
      {rows.length > 30 && (
        <div className="py-3 text-center text-xs text-slate-500">
          絞り込むと編集しやすくなります
        </div>
      )}
    </div>
  );
}

type MobileResultRow = {
  orderId: string;
  sku: string;
  labelName: string;
  deliveryPattern: string;
  recipientName: string;
  giftNote: string;
};

function MobileResultCards({
  rows,
  sourceLabel,
}: {
  rows: MobileResultRow[];
  sourceLabel: string;
}) {
  if (!rows.length)
    return (
      <MobileEmptyState
        text={`${sourceLabel}注文データを読み込むと表示されます`}
      />
    );

  return (
    <div className="space-y-2">
      {rows.slice(0, 120).map((row, index) => (
        <article
          key={`${row.orderId}-${row.sku}-${index}`}
          className="rounded-lg border border-slate-200 bg-white p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 break-all font-mono text-[11px] font-semibold text-slate-500">
              {row.orderId}
            </div>
            <Badge
              variant="outline"
              className="shrink-0 rounded-md bg-slate-50"
            >
              {row.deliveryPattern}
            </Badge>
          </div>
          <div className="mt-2 break-words text-sm font-bold">
            {row.labelName || "品名なし"}
          </div>
          <div className="mt-2 grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 text-xs">
            <span className="text-slate-400">宛名</span>
            <span className="break-words font-medium">
              {row.recipientName || "-"}
            </span>
            <span className="text-slate-400">商品コード</span>
            <span className="break-all font-mono">{row.sku || "-"}</span>
            {row.giftNote && (
              <>
                <span className="text-slate-400">贈答注記</span>
                <span className="break-words font-semibold text-amber-700">
                  {row.giftNote}
                </span>
              </>
            )}
          </div>
        </article>
      ))}
      {rows.length > 120 && (
        <div className="py-2 text-center text-xs text-slate-500">
          先頭120件を表示中。CSVには全件出力されます。
        </div>
      )}
    </div>
  );
}

function MobileHistoryList({
  histories,
  historyLoading,
  historyActionId,
  activeHistoryIds,
  onRestore,
  onDownload,
  onDelete,
}: {
  histories: ShippingLabelHistory[];
  historyLoading: boolean;
  historyActionId: string | null;
  activeHistoryIds: Partial<Record<ShippingSource, string>>;
  onRestore: (history: ShippingLabelHistory) => void;
  onDownload: (
    history: ShippingLabelHistory,
    exportRow: ShippingLabelHistoryExport,
  ) => void;
  onDelete: (history: ShippingLabelHistory) => void;
}) {
  if (!historyLoading && !histories.length)
    return <MobileEmptyState text="取込・出力履歴はまだありません" />;

  return (
    <div className="space-y-2">
      {histories.map((history) => {
        const latestYamato = history.exports.find(
          (row) => row.carrier === "yamato",
        );
        const latestSagawa = history.exports.find(
          (row) => row.carrier === "sagawa",
        );
        const isActive = activeHistoryIds[history.source] === history.id;
        return (
          <article
            key={history.id}
            className={`rounded-lg border p-3 ${isActive ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-slate-500">
                  {formatHistoryDate(history.createdAt)}
                </div>
                <div className="mt-1 break-all text-sm font-bold">
                  {history.sourceFileName}
                </div>
              </div>
              <Badge variant="outline" className="shrink-0 rounded-md bg-white">
                {history.source === "amazon" ? "Amazon" : "Yahoo"}
              </Badge>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <span>{history.sourceRowCount.toLocaleString()}行</span>
              {isActive && (
                <span className="font-semibold text-blue-700">現在表示中</span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="min-h-10 gap-1 px-2"
                disabled={historyActionId === `restore-${history.id}`}
                onClick={() => onRestore(history)}
              >
                <RotateCcw className="h-4 w-4" />
                再表示
              </Button>
              <Button
                variant="outline"
                className="min-h-10 gap-1 border-blue-200 px-2 text-blue-700"
                disabled={
                  !latestYamato ||
                  historyActionId === `download-${latestYamato?.id}`
                }
                onClick={() =>
                  latestYamato && onDownload(history, latestYamato)
                }
              >
                <Download className="h-4 w-4" />
                ヤマト
              </Button>
              <Button
                variant="outline"
                className="min-h-10 gap-1 border-emerald-200 px-2 text-emerald-700"
                disabled={
                  !latestSagawa ||
                  historyActionId === `download-${latestSagawa?.id}`
                }
                onClick={() =>
                  latestSagawa && onDownload(history, latestSagawa)
                }
              >
                <Download className="h-4 w-4" />
                佐川
              </Button>
              <Button
                variant="outline"
                className="min-h-10 gap-1 border-red-200 px-2 text-red-600"
                disabled={historyActionId === `delete-${history.id}`}
                onClick={() => onDelete(history)}
              >
                <Trash2 className="h-4 w-4" />
                履歴削除
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function missingDraftKey(source: ShippingSource, code: string) {
  return `${source}:${code}`;
}

function findComplementMapping(
  productName: string,
  source: ShippingSource,
  mappings: ConversionTableRow[],
): ConversionTableRow | undefined {
  const normalizedProduct = normalizeProductName(productName);
  if (!normalizedProduct) return undefined;

  const candidates = mappings
    .map((mapping) => {
      const otherName = normalizeProductName(
        source === "amazon" ? mapping.yahooName : mapping.amazonName,
      );
      const labelName = normalizeProductName(mapping.labelName);
      let score = 0;
      if (otherName && otherName === normalizedProduct) score = 100;
      else if (labelName && labelName === normalizedProduct) score = 90;
      else if (
        otherName &&
        Math.min(otherName.length, normalizedProduct.length) >= 20 &&
        (otherName.includes(normalizedProduct) ||
          normalizedProduct.includes(otherName))
      )
        score = 80;
      else if (
        labelName &&
        Math.min(labelName.length, normalizedProduct.length) >= 12 &&
        normalizedProduct.includes(labelName)
      )
        score = 60;
      return { mapping, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  if (
    !candidates.length ||
    (candidates[1] && candidates[1].score === candidates[0].score)
  )
    return undefined;
  return candidates[0].mapping;
}

function normalizeProductName(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP")
    .replace(
      /yahoo|amazon|ショッピング|限定商品|激安|送料無料|会津ブランド館/g,
      "",
    )
    .replace(/[\s\u3000【】\[\]()（）・、,._\-ー～~!！?？「」『』×]/g, "");
}

function MissingSkuEditor({
  rows,
  drafts,
  savingMappingId,
  onDraftChange,
  onSave,
}: {
  rows: MissingSkuRow[];
  drafts: Record<string, MissingSkuDraft>;
  savingMappingId: string | null;
  onDraftChange: (
    row: MissingSkuRow,
    updates: Partial<MissingSkuDraft>,
  ) => void;
  onSave: (row: MissingSkuRow) => void;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-red-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-red-100 px-3 py-2">
        <div className="text-sm font-bold text-red-800">未登録商品を追加</div>
        <div className="text-xs text-slate-500">
          他タブに同じ商品がある場合は、配送区分と伝票名を自動補完します
        </div>
      </div>
      <div className="max-h-[300px] overflow-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="sticky top-0 bg-red-50 text-xs text-red-700">
            <tr>
              <th className="w-[160px] px-3 py-2 text-left font-semibold">
                商品コード
              </th>
              <th className="px-3 py-2 text-left font-semibold">商品名</th>
              <th className="w-[130px] px-3 py-2 text-left font-semibold">
                件数
              </th>
              <th className="w-[150px] px-3 py-2 text-left font-semibold">
                配送区分
              </th>
              <th className="px-3 py-2 text-left font-semibold">伝票記載名</th>
              <th className="w-[110px] px-3 py-2 text-left font-semibold">
                追加
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-red-100">
            {rows.slice(0, 50).map((row) => {
              const draft = drafts[missingDraftKey(row.source, row.sku)] ?? {
                labelName: row.productName,
                deliveryPattern: "未設定" as DeliveryPattern,
              };
              const busy = savingMappingId === `missing-${row.sku}`;
              return (
                <tr
                  key={`${row.sku}-${row.orderId}`}
                  className="hover:bg-red-50/40"
                >
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                    {row.sku || "-"}
                  </td>
                  <td
                    className="max-w-[340px] px-3 py-2"
                    title={row.productName}
                  >
                    <div className="truncate">{row.productName || "-"}</div>
                    {draft.complementId && (
                      <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        <Link2 className="h-3 w-3" />
                        {row.source === "amazon" ? "Yahoo" : "Amazon"}
                        の商品設定から補完
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-xs text-slate-500">
                      {row.count.toLocaleString()}件
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {row.shipServiceLevel || "-"}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={draft.deliveryPattern}
                      onChange={(event) =>
                        onDraftChange(row, {
                          deliveryPattern: event.target
                            .value as DeliveryPattern,
                        })
                      }
                      className="h-9 w-full rounded-md border border-red-200 bg-white px-2 text-sm"
                    >
                      {patternOptions.map((pattern) => (
                        <option key={pattern} value={pattern}>
                          {pattern}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={draft.labelName}
                      onChange={(event) =>
                        onDraftChange(row, { labelName: event.target.value })
                      }
                      className="h-9"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      size="sm"
                      className="h-9 w-full bg-red-600 hover:bg-red-700"
                      disabled={
                        busy || !row.sku || draft.deliveryPattern === "未設定"
                      }
                      onClick={() => onSave(row)}
                    >
                      追加
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 50 && (
        <div className="border-t border-red-100 px-3 py-2 text-xs text-slate-500">
          先頭50件を表示中です。
        </div>
      )}
    </div>
  );
}

function OrderDropzone({
  source,
  fileName,
  rowCount,
  busy,
  onFile,
  onClear,
}: {
  source: ShippingSource;
  fileName: string;
  rowCount: number;
  busy: boolean;
  onFile: (file?: File | null) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    onFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div
      className={`flex min-h-[190px] flex-col justify-between rounded-lg border-2 border-dashed bg-white p-5 shadow-sm transition ${
        dragging
          ? "border-blue-500 bg-blue-50"
          : "border-slate-300 hover:border-blue-400"
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div className="flex items-start gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-blue-600 text-white shadow-sm">
          <Upload className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-bold">
            {source === "amazon" ? "Amazon" : "Yahoo!ショッピング"}注文データ
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {source === "amazon" ? "Excel・CSV・テキスト" : "Yahoo注文CSV"}
            をここにドラッグ、またはクリックして選択
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className="rounded-md bg-white">
              {busy ? "読み込み中..." : fileName || "未選択"}
            </Badge>
            <Badge variant="outline" className="rounded-md bg-white">
              {rowCount.toLocaleString()}行
            </Badge>
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          変換表はDB登録済みの内容を自動使用します。
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => {
              if (inputRef.current) inputRef.current.value = "";
              onClear();
            }}
            disabled={busy || (!fileName && rowCount === 0)}
          >
            <Trash2 className="h-4 w-4" />
            クリア
          </Button>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            <Upload className="h-4 w-4" />
            ファイル選択
          </Button>
        </div>
      </div>
      <input
        ref={inputRef}
        className="hidden"
        type="file"
        accept=".xlsx,.xls,.csv,.txt,.tsv"
        onChange={(event) => {
          onFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}

function SettingInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-500">
        {label}
      </span>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9"
      />
    </label>
  );
}

function SettingSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "cyan" | "green" | "red" | "amber" | "slate";
}) {
  const colors = {
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    red: "border-red-200 bg-red-50 text-red-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    slate: "border-slate-200 bg-white text-slate-800",
  };
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${colors[tone]}`}>
      <div className="text-xs font-semibold">{label}</div>
      <div className="mt-1 text-2xl font-bold leading-none">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rounded-md border px-3 py-2 text-left text-sm transition ${
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
      onClick={onClick}
    >
      <span className="font-bold">{label}</span>
      <span className="ml-2 text-xs opacity-75">{count.toLocaleString()}</span>
    </button>
  );
}

function PanelHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 font-bold">
      {icon}
      {title}
    </div>
  );
}

function HistoryExportBadge({
  label,
  exportRow,
}: {
  label: string;
  exportRow?: ShippingLabelHistoryExport;
}) {
  if (!exportRow) {
    return (
      <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-400">
        {label} 未出力
      </span>
    );
  }
  return (
    <span
      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700"
      title={formatHistoryDate(exportRow.createdAt)}
    >
      {label} {exportRow.rowCount.toLocaleString()}件
    </span>
  );
}

function formatHistoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function ResultBlock({
  title,
  description,
  badge,
  rows,
  sourceLabel,
}: {
  title: string;
  description: string;
  badge: string;
  sourceLabel: string;
  rows: Array<{
    orderId: string;
    sku: string;
    labelName: string;
    deliveryPattern: string;
    recipientName: string;
    giftNote: string;
  }>;
}) {
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-slate-500">{description}</div>
        </div>
        <Badge variant="outline" className="rounded-md">
          {badge}
        </Badge>
      </div>
      <div className="max-h-[320px] overflow-auto rounded-md border border-slate-100">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">注文番号</th>
              <th className="px-3 py-2 text-left">商品コード</th>
              <th className="px-3 py-2 text-left">配送</th>
              <th className="px-3 py-2 text-left">品名</th>
              <th className="px-3 py-2 text-left">宛名</th>
              <th className="px-3 py-2 text-left">贈答注記</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length ? (
              rows.slice(0, 120).map((row) => (
                <tr key={`${row.orderId}-${row.sku}`}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                    {row.orderId}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                    {row.sku}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {row.deliveryPattern}
                  </td>
                  <td
                    className="max-w-[280px] truncate px-3 py-2"
                    title={row.labelName}
                  >
                    {row.labelName}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {row.recipientName}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs font-medium text-amber-700">
                    {row.giftNote || (
                      <span className="font-normal text-slate-300">-</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-10 text-center text-slate-400"
                >
                  {sourceLabel}注文データを読み込むとここに表示されます
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > 120 && (
        <div className="mt-2 text-xs text-slate-500">
          画面表示は先頭120件です。CSV出力には全件入ります。
        </div>
      )}
    </div>
  );
}
