"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Database,
  HardDrive,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldCheck,
  Usb,
  XCircle,
} from "lucide-react";

type BackupRun = {
  id: string;
  run_id: string;
  backup_type: "daily_data" | "weekly_system_image" | "manual_test";
  status: "running" | "success" | "warning" | "failed";
  host_name: string | null;
  started_at: string;
  completed_at: string | null;
  bytes_total: number;
  file_count: number;
  nas_path: string | null;
  cloud_path: string | null;
  usb_path: string | null;
  database_checks: Record<string, unknown>;
  details: Record<string, unknown>;
  error_message: string | null;
};

const statusLabels = {
  running: "実行中",
  success: "成功",
  warning: "一部注意",
  failed: "失敗",
} as const;

const typeLabels = {
  daily_data: "日次データ",
  weekly_system_image: "PCイメージ",
  manual_test: "動作試験",
} as const;

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** unit).toFixed(unit > 2 ? 1 : 0)} ${units[unit]}`;
}

function statusClass(status: BackupRun["status"]) {
  if (status === "success") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (status === "warning") return "border-amber-300 bg-amber-50 text-amber-800";
  if (status === "failed") return "border-red-300 bg-red-50 text-red-800";
  return "border-cyan-300 bg-cyan-50 text-cyan-800";
}

export default function BackupManagementPage() {
  const [runs, setRuns] = useState<BackupRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/system/backup/history", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "履歴を取得できません");
      setRuns(json.runs || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "履歴を取得できません");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const latest = runs[0];
  const latestData = useMemo(() => runs.find((run) => run.backup_type === "daily_data" && run.status === "success"), [runs]);
  const latestImage = useMemo(() => runs.find((run) => run.backup_type === "weekly_system_image" && run.status === "success"), [runs]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 text-slate-900 lg:px-8">
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <HardDrive className="h-7 w-7 text-cyan-700" />
            <h1 className="text-2xl font-bold">PCバックアップ管理</h1>
          </div>
          <p className="mt-1 text-sm text-slate-600">事務所PCのバックアップ履歴と、障害時の復旧手順を確認します。</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-10 items-center gap-2 rounded border border-slate-300 bg-white px-4 text-sm font-semibold hover:bg-slate-100"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          更新
        </button>
      </header>

      <div className="mx-auto max-w-7xl">
        {error && <div className="mt-5 border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

        <section className="grid border-b border-slate-200 md:grid-cols-3">
          <SummaryCell icon={latest?.status === "success" ? CheckCircle2 : AlertTriangle} label="直近の実行" value={latest ? statusLabels[latest.status] : "履歴なし"} detail={latest ? formatDate(latest.started_at) : "初回実行待ち"} tone={latest?.status === "success" ? "green" : "amber"} />
          <SummaryCell icon={Database} label="最新の日次データ" value={latestData ? formatDate(latestData.completed_at) : "未完了"} detail={latestData ? formatBytes(latestData.bytes_total) : "SQLite・書類・ソース・Codex"} tone="cyan" />
          <SummaryCell icon={HardDrive} label="最新のPCイメージ" value={latestImage ? formatDate(latestImage.completed_at) : "未完了"} detail="毎週日曜 03:00 / NAS" tone="violet" />
        </section>

        <section className="border-b border-slate-200 py-6">
          <h2 className="text-lg font-bold">自動スケジュール</h2>
          <div className="mt-4 grid gap-px overflow-hidden border border-slate-200 bg-slate-200 md:grid-cols-3">
            <ScheduleRow icon={Database} time="毎日 01:30" title="業務データ" text="SQLite、原本、コード、設定を暗号化してNASとGoogle Driveへ保存" />
            <ScheduleRow icon={HardDrive} time="毎週日曜 03:00" title="PC全体" text="Windows・アプリ・Codex環境を含むシステムイメージをNASへ保存" />
            <ScheduleRow icon={ShieldCheck} time="毎日 06:30" title="監査" text="実行結果・DB整合性・保存先を確認し、TSA履歴へ記録" />
          </div>
        </section>

        <section className="border-b border-slate-200 py-6">
          <h2 className="text-lg font-bold">保存先</h2>
          <div className="mt-4 grid gap-5 md:grid-cols-3">
            <Destination icon={Server} title="社内NAS" text="日次暗号化データと週次PCイメージ。最速の復旧元です。" />
            <Destination icon={Cloud} title="Google Drive" text="NAS障害に備えた日次暗号化コピー。30日分を保持します。" />
            <Destination icon={Usb} title="復旧USB" text="復旧手順、復号鍵、検証スクリプトを保管します。PCイメージ本体はNASです。" />
          </div>
        </section>

        <section className="border-b border-slate-200 py-6">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-cyan-700" />
            <h2 className="text-lg font-bold">PCが起動しない場合</h2>
          </div>
          <ol className="mt-4 grid gap-0 border border-slate-200 bg-white md:grid-cols-2">
            {[
              "復旧USBを正常なPCで開き、『最初にお読みください』を確認する。",
              "交換SSDまたは予備PCを用意し、Windows回復環境からNASの最新PCイメージを戻す。",
              "FAX・メール・スケジュール配信を停止したまま、最新の日次データを復元用フォルダへ展開する。",
              "SQLiteのquick_check、書類件数、FAX履歴、EC速報、TSA・TSGログインを確認する。",
              "PM2とWindowsタスクを1系統だけ起動し、二重起動・二重送信がないことを確認する。",
              "外部送信機能を最後に再開し、復旧日時と使用バックアップをこの履歴へ記録する。",
            ].map((step, index) => (
              <li key={step} className="flex min-h-24 gap-3 border-b border-slate-200 p-4 last:border-b-0 md:border-r md:even:border-r-0">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-900 text-sm font-bold text-white">{index + 1}</span>
                <span className="text-sm leading-6 text-slate-700">{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-3 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            復旧確認が終わるまでFAX・メール・定期配信を有効にしないでください。
          </div>
        </section>

        <section className="py-6">
          <h2 className="text-lg font-bold">バックアップ履歴</h2>
          <div className="mt-4 overflow-x-auto border border-slate-200 bg-white">
            <table className="min-w-[980px] w-full border-collapse text-sm">
              <thead className="bg-slate-100 text-left text-xs text-slate-600">
                <tr>
                  <th className="px-4 py-3">開始日時</th>
                  <th className="px-4 py-3">種別</th>
                  <th className="px-4 py-3">状態</th>
                  <th className="px-4 py-3 text-right">容量</th>
                  <th className="px-4 py-3 text-right">ファイル</th>
                  <th className="px-4 py-3">DB確認</th>
                  <th className="px-4 py-3">詳細</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {runs.map((run) => (
                  <tr key={run.id} className="align-top hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(run.started_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{typeLabels[run.backup_type]}</td>
                    <td className="px-4 py-3"><span className={`inline-flex border px-2 py-1 text-xs font-bold ${statusClass(run.status)}`}>{statusLabels[run.status]}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{formatBytes(run.bytes_total)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{run.file_count.toLocaleString()}件</td>
                    <td className="px-4 py-3 text-xs"><DatabaseCheck checks={run.database_checks} /></td>
                    <td className="max-w-[360px] px-4 py-3 text-xs text-slate-600">
                      {run.error_message ? <span className="text-red-700">{run.error_message}</span> : <span>{String(run.details?.summary || "正常終了")}</span>}
                    </td>
                  </tr>
                ))}
                {!loading && runs.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">バックアップ履歴はまだありません。</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryCell({ icon: Icon, label, value, detail, tone }: { icon: typeof HardDrive; label: string; value: string; detail: string; tone: "green" | "amber" | "cyan" | "violet" }) {
  const colors = { green: "text-emerald-700", amber: "text-amber-700", cyan: "text-cyan-700", violet: "text-violet-700" };
  return <div className="border-slate-200 px-5 py-6 md:border-r md:last:border-r-0"><div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Icon className={`h-4 w-4 ${colors[tone]}`} />{label}</div><div className="mt-2 text-lg font-bold">{value}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>;
}

function ScheduleRow({ icon: Icon, time, title, text }: { icon: typeof HardDrive; time: string; title: string; text: string }) {
  return <div className="bg-white p-4"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-cyan-700" /><span className="font-bold">{time}</span></div><div className="mt-2 text-sm font-semibold">{title}</div><p className="mt-1 text-xs leading-5 text-slate-600">{text}</p></div>;
}

function Destination({ icon: Icon, title, text }: { icon: typeof HardDrive; title: string; text: string }) {
  return <div className="border-l-4 border-cyan-600 pl-4"><div className="flex items-center gap-2 font-bold"><Icon className="h-5 w-5 text-cyan-700" />{title}</div><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></div>;
}

function DatabaseCheck({ checks }: { checks: Record<string, unknown> }) {
  const entries = Object.entries(checks || {});
  if (entries.length === 0) return <span className="text-slate-400">-</span>;
  return (
    <div className="space-y-1">
      {entries.map(([name, value]) => {
        const detail = value && typeof value === "object" && !Array.isArray(value)
          ? value as Record<string, unknown>
          : { status: value };
        const result = String(detail.quickCheck ?? detail.pgDump ?? detail.status ?? "unknown").toLowerCase();
        const ok = result === "ok" || result === "success";
        const label = detail.quickCheck ? `quick_check: ${result}` : detail.pgDump ? `pg_dump: ${result}` : result;
        return (
          <div key={name} className="flex items-center gap-1.5">
            {ok
              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              : <XCircle className="h-3.5 w-3.5 text-red-600" />}
            <span>{name}: {label}</span>
          </div>
        );
      })}
    </div>
  );
}
