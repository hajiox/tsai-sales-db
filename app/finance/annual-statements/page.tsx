'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Database,
  FileText,
  History,
  Landmark,
  Loader2,
  PackageOpen,
  RefreshCw,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';

type StatementType = 'bs' | 'pl' | 'sga' | 'equity' | 'notes';
type QueueStatus = 'ready' | 'uploading' | 'done' | 'error';

type StatementMetric = {
  metricKey: string;
  label: string;
  category: string;
  amount: number;
};

type StatementPeriod = {
  id: string;
  companyName: string;
  periodNumber: number | null;
  fiscalYear: number;
  periodStart: string;
  periodEnd: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  createdAt: string;
  warnings: string[];
  validation: Record<string, unknown>;
  metrics: Record<string, StatementMetric>;
};

type StatementAccount = {
  id: string;
  statementType: StatementType;
  section: string | null;
  accountName: string;
  amount: number | null;
  rowNo: number;
  metadata: Record<string, unknown>;
};

type ApiResponse = {
  periods: StatementPeriod[];
  selected: StatementPeriod | null;
  accounts: StatementAccount[];
};

type QueueItem = {
  id: string;
  file: File;
  status: QueueStatus;
  message: string;
};

const statementTabs: Array<{ key: StatementType; label: string }> = [
  { key: 'bs', label: '貸借対照表' },
  { key: 'pl', label: '損益計算書' },
  { key: 'sga', label: '販管費内訳' },
  { key: 'equity', label: '株主資本等変動' },
  { key: 'notes', label: '注記' },
];

const comparisonMetrics = [
  ['net_sales', '売上高'],
  ['gross_profit', '売上総利益'],
  ['operating_income', '営業利益'],
  ['net_income', '当期純利益'],
  ['cash_and_deposits', '現金・預金'],
  ['inventory', '棚卸資産（BS）'],
  ['beginning_inventory', '期首棚卸高'],
  ['ending_inventory', '期末棚卸高'],
  ['long_term_borrowings', '長期借入金'],
  ['lease_obligations', 'リース債務'],
  ['total_assets', '総資産'],
  ['net_assets', '純資産'],
] as const;

function yen(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '-';
  const rounded = Math.round(value);
  return `${rounded < 0 ? '△' : ''}¥${Math.abs(rounded).toLocaleString('ja-JP')}`;
}

function signedYen(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '-';
  if (value === 0) return '¥0';
  return `${value > 0 ? '+' : '△'}¥${Math.abs(Math.round(value)).toLocaleString('ja-JP')}`;
}

function percent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return `${year}年${month}月${day}日`;
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function metric(period: StatementPeriod | null | undefined, key: string) {
  return period?.metrics?.[key]?.amount ?? null;
}

function delta(current: StatementPeriod | null, previous: StatementPeriod | null, key: string) {
  const currentValue = metric(current, key);
  const previousValue = metric(previous, key);
  if (currentValue == null || previousValue == null) return null;
  return currentValue - previousValue;
}

function queueId(file: File, index: number) {
  return `${file.name}:${file.size}:${file.lastModified}:${index}:${Date.now()}`;
}

export default function AnnualStatementsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<ApiResponse>({ periods: [], selected: null, accounts: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<StatementType>('bs');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (id?: string | null) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/finance/annual-statements${id ? `?id=${encodeURIComponent(id)}` : ''}`, {
        cache: 'no-store',
      });
      if (response.status === 401) {
        router.push('/finance/general-ledger');
        return;
      }
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || '決算書データを取得できませんでした');
      setData(json);
      setSelectedId(json.selected?.id || null);
    } catch (caught: any) {
      setError(caught?.message || '決算書データを取得できませんでした');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  function addFiles(files: File[]) {
    setError('');
    const existing = new Set(queue.map(item => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
    const next: QueueItem[] = [];
    files.forEach((file, index) => {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (existing.has(key)) return;
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        next.push({ id: queueId(file, index), file, status: 'error', message: 'PDF形式ではありません' });
      } else if (file.size > 20 * 1024 * 1024) {
        next.push({ id: queueId(file, index), file, status: 'error', message: '20MB以下のPDFを選択してください' });
      } else {
        next.push({ id: queueId(file, index), file, status: 'ready', message: '取込準備完了' });
      }
      existing.add(key);
    });
    setQueue(current => [...current, ...next]);
  }

  function updateQueue(id: string, patch: Partial<QueueItem>) {
    setQueue(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  async function uploadAll() {
    const pending = queue.filter(item => item.status === 'ready' || item.status === 'error' && item.message !== 'PDF形式ではありません' && item.file.size <= 20 * 1024 * 1024);
    if (pending.length === 0) {
      setError('取込可能なPDFを選択してください');
      return;
    }

    setUploading(true);
    setError('');
    let latestId: string | null = null;

    for (const item of pending) {
      updateQueue(item.id, { status: 'uploading', message: 'PDFを解析中…' });
      try {
        const form = new FormData();
        form.append('file', item.file);
        const response = await fetch('/api/finance/annual-statements', { method: 'POST', body: form });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json?.error || '取込に失敗しました');
        latestId = json.statement?.id || latestId;
        updateQueue(item.id, {
          status: 'done',
          message: `${json.stats?.accounts ?? 0}項目・${json.stats?.metrics ?? 0}指標を取り込みました`,
        });
      } catch (caught: any) {
        updateQueue(item.id, { status: 'error', message: caught?.message || '取込に失敗しました' });
      }
    }

    setUploading(false);
    await load(latestId);
  }

  const selected = data.selected;
  const selectedIndex = data.periods.findIndex(period => period.id === selected?.id);
  const previous = selectedIndex >= 0
    ? data.periods.slice(selectedIndex + 1).find(period => period.companyName === selected?.companyName) || null
    : null;
  const visibleAccounts = data.accounts.filter(account => account.statementType === activeTab);
  const borrowingDelta = delta(selected, previous, 'long_term_borrowings');
  const inventoryDelta = delta(selected, previous, 'inventory');
  const netSales = metric(selected, 'net_sales');
  const grossProfit = metric(selected, 'gross_profit');
  const grossMargin = netSales && grossProfit != null ? grossProfit / netSales : null;
  const cogs = metric(selected, 'cogs');
  const beginningInventory = metric(selected, 'beginning_inventory');
  const endingInventory = metric(selected, 'ending_inventory');
  const averageInventory = beginningInventory != null && endingInventory != null
    ? (beginningInventory + endingInventory) / 2
    : null;
  const inventoryTurnover = cogs != null && averageInventory && averageInventory !== 0 ? cogs / averageInventory : null;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button
            type="button"
            onClick={() => router.push('/finance/dashboard')}
            className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            財務分析ダッシュボードへ
          </button>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-slate-900">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-sm">
              <FileText className="h-5 w-5" />
            </span>
            決算書PDF取込・年次比較
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            決算書PDFをアップロードまたはドロップすると、貸借対照表・損益計算書・販管費内訳・株主資本・注記をデータ化します。借入金と棚卸資産は決算期ごとの差額を自動表示します。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(selectedId)}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          再読込
        </button>
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-indigo-600" />
            <h2 className="font-bold text-slate-900">決算書PDFを追加</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">PDFのみ・1ファイル20MBまで。複数年分をまとめて選択できます。</p>
        </div>

        <div className="grid gap-0 lg:grid-cols-[minmax(360px,0.8fr)_1.2fr]">
          <div className="p-5">
            <div
              onDragOver={event => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={event => {
                event.preventDefault();
                setDragOver(false);
                addFiles(Array.from(event.dataTransfer.files || []));
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
                dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-50/60 hover:border-indigo-300 hover:bg-indigo-50/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={event => {
                  addFiles(Array.from(event.target.files || []));
                  event.target.value = '';
                }}
              />
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                <Upload className="h-6 w-6" />
              </div>
              <div className="mt-4 font-bold text-slate-800">PDFをここへドロップ</div>
              <div className="mt-1 text-sm text-slate-500">またはクリックしてファイルを選択</div>
            </div>
          </div>

          <div className="border-t border-slate-100 p-5 lg:border-l lg:border-t-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-bold text-slate-800">取込キュー</div>
              {queue.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQueue([])}
                  disabled={uploading}
                  className="text-xs font-semibold text-slate-400 hover:text-slate-700 disabled:opacity-50"
                >
                  クリア
                </button>
              )}
            </div>
            <div className="min-h-32 space-y-2">
              {queue.length === 0 ? (
                <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">
                  選択したPDFがここに表示されます
                </div>
              ) : queue.map(item => (
                <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3">
                  <QueueIcon status={item.status} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-800" title={item.file.name}>{item.file.name}</div>
                    <div className={`mt-0.5 text-xs ${item.status === 'error' ? 'text-rose-600' : 'text-slate-500'}`}>
                      {formatBytes(item.file.size)} / {item.message}
                    </div>
                  </div>
                  {item.status !== 'uploading' && (
                    <button
                      type="button"
                      onClick={() => setQueue(current => current.filter(row => row.id !== item.id))}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={`${item.file.name}を外す`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void uploadAll()}
              disabled={uploading || !queue.some(item => item.status === 'ready')}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              {uploading ? '解析・データ化しています…' : '選択した決算書を取り込む'}
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {loading && !selected ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
          決算書データを読み込み中
        </div>
      ) : !selected ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <PackageOpen className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-4 font-bold text-slate-800">取り込まれた決算書はまだありません</h2>
          <p className="mt-2 text-sm text-slate-500">上のエリアへ前期の決算書PDFをドロップしてください。</p>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700">
                    {selected.periodNumber ? `第${selected.periodNumber}期` : `${selected.fiscalYear}年決算`}
                  </span>
                  <span className="text-xs text-slate-500">{selected.companyName}</span>
                </div>
                <h2 className="mt-2 text-xl font-bold text-slate-900">
                  {formatDate(selected.periodStart)} 〜 {formatDate(selected.periodEnd)}
                </h2>
                <div className="mt-1 text-xs text-slate-500">
                  {selected.fileName} / {selected.pageCount}ページ / {formatBytes(selected.fileSize)}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.periods.map(period => (
                  <button
                    key={period.id}
                    type="button"
                    onClick={() => void load(period.id)}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                      period.id === selected.id
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700'
                    }`}
                  >
                    {period.periodNumber ? `第${period.periodNumber}期` : period.fiscalYear}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              icon={<Landmark className="h-4 w-4" />}
              label="長期借入金"
              value={yen(metric(selected, 'long_term_borrowings'))}
              sub={previous ? `前期差 ${signedYen(borrowingDelta)}` : '比較する前期データなし'}
              tone={borrowingDelta != null && borrowingDelta > 0 ? 'amber' : 'blue'}
            />
            <MetricCard
              icon={<PackageOpen className="h-4 w-4" />}
              label="期首棚卸高"
              value={yen(beginningInventory)}
              sub="売上原価計算の出発点"
              tone="slate"
            />
            <MetricCard
              icon={<PackageOpen className="h-4 w-4" />}
              label="期末棚卸高"
              value={yen(endingInventory)}
              sub={previous ? `BS前期差 ${signedYen(inventoryDelta)}` : '次期の期首在庫になります'}
              tone={inventoryDelta != null && inventoryDelta > 0 ? 'amber' : 'blue'}
            />
            <MetricCard
              icon={<ArrowRight className="h-4 w-4" />}
              label="在庫回転率"
              value={inventoryTurnover == null ? '-' : `${inventoryTurnover.toFixed(2)}回`}
              sub="売上原価 ÷ 平均棚卸高"
              tone="emerald"
            />
            <MetricCard
              icon={<ShieldCheck className="h-4 w-4" />}
              label="粗利率"
              value={percent(grossMargin)}
              sub={`粗利 ${yen(grossProfit)}`}
              tone={grossMargin != null && grossMargin < 0.45 ? 'amber' : 'emerald'}
            />
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-indigo-600" />
                  <h2 className="font-bold text-slate-900">前期比較</h2>
                </div>
                <p className="mt-1 text-xs text-slate-500">同じ会社の直前決算が取り込まれると差額と増減率を表示します。</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">指標</th>
                      <th className="px-4 py-3 text-right">当期</th>
                      <th className="px-4 py-3 text-right">前期</th>
                      <th className="px-4 py-3 text-right">増減額</th>
                      <th className="px-4 py-3 text-right">増減率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {comparisonMetrics.map(([key, label]) => {
                      const currentValue = metric(selected, key);
                      const previousValue = metric(previous, key);
                      const difference = currentValue != null && previousValue != null ? currentValue - previousValue : null;
                      const rate = difference != null && previousValue ? difference / Math.abs(previousValue) : null;
                      return (
                        <tr key={key} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3 font-semibold text-slate-700">{label}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">{yen(currentValue)}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-500">{yen(previousValue)}</td>
                          <td className={`px-4 py-3 text-right font-mono font-semibold ${difference != null && difference > 0 ? 'text-amber-700' : difference != null && difference < 0 ? 'text-blue-700' : 'text-slate-400'}`}>
                            {signedYen(difference)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-slate-500">{rate == null ? '-' : `${rate > 0 ? '+' : ''}${(rate * 100).toFixed(1)}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-5">
              <ValidationPanel validation={selected.validation} warnings={selected.warnings} />
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="font-bold text-slate-900">借入金を見るポイント</h2>
                <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
                  <p>長期借入金は {yen(metric(selected, 'long_term_borrowings'))} です。</p>
                  {previous ? (
                    <p className="flex items-start gap-2">
                      {borrowingDelta != null && borrowingDelta > 0
                        ? <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-amber-600" />
                        : <ArrowDownRight className="mt-1 h-4 w-4 shrink-0 text-blue-600" />}
                      <span>前期から {signedYen(borrowingDelta)}。借入増減と現預金・在庫増減を並べて、運転資金か設備資金かを確認します。</span>
                    </p>
                  ) : (
                    <p className="text-slate-500">今後、別の決算期を取り込むと借入金の増減を自動比較します。</p>
                  )}
                </div>
              </section>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 pt-4">
              <h2 className="font-bold text-slate-900">取込明細</h2>
              <div className="mt-3 flex gap-1 overflow-x-auto">
                {statementTabs.map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition ${
                      activeTab === tab.key
                        ? 'border-indigo-600 text-indigo-700'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="w-16 px-4 py-3 text-left">No.</th>
                    <th className="px-4 py-3 text-left">区分</th>
                    <th className="px-4 py-3 text-left">科目・内容</th>
                    <th className="px-4 py-3 text-right">金額</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-slate-400">この区分で抽出された明細はありません。</td>
                    </tr>
                  ) : visibleAccounts.map(row => (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{row.rowNo}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-500">{row.section || '-'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{row.accountName}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">{yen(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function QueueIcon({ status }: { status: QueueStatus }) {
  if (status === 'uploading') return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-indigo-600" />;
  if (status === 'done') return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />;
  if (status === 'error') return <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600" />;
  return <FileText className="h-5 w-5 shrink-0 text-slate-400" />;
}

type Tone = 'blue' | 'emerald' | 'amber' | 'slate';

const toneClasses: Record<Tone, string> = {
  blue: 'border-blue-200 bg-blue-50/70 text-blue-800',
  emerald: 'border-emerald-200 bg-emerald-50/70 text-emerald-800',
  amber: 'border-amber-200 bg-amber-50/70 text-amber-800',
  slate: 'border-slate-200 bg-white text-slate-800',
};

function MetricCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: Tone;
}) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClasses[tone]}`}>
      <div className="flex items-center gap-2 text-xs font-bold opacity-75">{icon}{label}</div>
      <div className="mt-3 text-xl font-bold tabular-nums [overflow-wrap:anywhere]">{value}</div>
      <div className="mt-1 text-xs leading-5 opacity-70">{sub}</div>
    </div>
  );
}

function ValidationPanel({
  validation,
  warnings,
}: {
  validation: Record<string, unknown>;
  warnings: string[];
}) {
  const bsBalanced = validation.balanceSheetBalanced === true;
  const plBalanced = validation.profitLossCalculated === true || validation.profitLossConsistent === true;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        <h2 className="font-bold text-slate-900">データ品質チェック</h2>
      </div>
      <div className="mt-3 space-y-2">
        <ValidationRow ok={bsBalanced} label="貸借対照表の左右一致" />
        <ValidationRow ok={plBalanced} label="損益計算の整合" />
      </div>
      {warnings.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-bold text-amber-800">確認事項</div>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-800">
            {warnings.map((warning, index) => <li key={`${warning}-${index}`}>・{warning}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

function ValidationRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 text-sm">
      <span className="font-semibold text-slate-700">{label}</span>
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
        {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
        {ok ? '一致' : '要確認'}
      </span>
    </div>
  );
}
