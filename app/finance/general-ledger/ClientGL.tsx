// /app/finance/general-ledger/ClientGL.tsx ver.2 (2025-08-19 JST) - extracted browser-only GL client

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser"

// ===== shadcn/ui =====
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

// ===== icons =====
import {
  Upload,
  Trash2,
  FileText,
  Calculator,
  Calendar,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  BarChart3,
  FileSpreadsheet,
  DollarSign,
} from "lucide-react";

import { useRouter } from "next/navigation";

// ===== モーダル（default / named どちらでも安全に解決するフォールバック） =====
import * as __GLIM from "@/components/general-ledger/GeneralLedgerImportModal";
import * as __CLIM from "@/components/general-ledger/ClosingImportModal";
const GeneralLedgerImportModal: React.FC<any> =
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (((__GLIM as any).default ?? (__GLIM as any).GeneralLedgerImportModal) as React.FC) ??
  (() => null);
const ClosingImportModal: React.FC<any> =
  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (((__CLIM as any).default ?? (__CLIM as any).ClosingImportModal) as React.FC) ??
  (() => null);

// ===== Import Sanity Check（暫定：原因特定後に削除OK） =====
const __imports = {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Alert,
  AlertDescription,
  Upload,
  Trash2,
  FileText,
  Calculator,
  Calendar,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  BarChart3,
  FileSpreadsheet,
  DollarSign,
  GeneralLedgerImportModal,
  ClosingImportModal,
};

const MissingImportsBanner: React.FC = () => {
  const missing = Object.entries(__imports)
    .filter(([, v]) => v == null)
    .map(([k]) => k);
  if (missing.length === 0) return null;
  return (
    <div
      style={{
        padding: 16,
        background: "#fff4e5",
        color: "#7a3e00",
        border: "1px solid #f0c48a",
        borderRadius: 8,
        margin: 16,
      }}
    >
      <strong>Missing imports:</strong>
      <div style={{ marginTop: 6 }}>{missing.join(", ")}</div>
      <div style={{ marginTop: 8, fontSize: 12 }}>
        いずれかが <code>undefined</code> です。該当コンポーネントの import/export を確認して修正してください。
        （バナーは原因解消後に削除OK）
      </div>
    </div>
  );
};

// ====== 型（最低限） ======
interface MonthlyData {
  yyyymm: string;
  report_month: string; // "YYYY-MM-01"
  total_debit: number;
  total_credit: number;
  record_count: number;
}

interface FiscalYearGroup {
  fiscal_year: number;
  months: {
    yyyymm: string;
    month: number; // 1-12
  }[];
}

interface ClosingSummary {
  fiscal_year: number;
  fiscal_month: number;
  record_count: number;
  total_debit: number;
  total_credit: number;
}

// ====== Utils ======
const jpy = (n: number) => `¥ ${Math.round(n || 0).toLocaleString()}`;
const monthStr = (yyyymm: string) =>
  `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`;

// 会計年度（8月始まり）
const getFiscalYear = (dateStr: string): number => {
  const d = new Date(dateStr);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return m >= 8 ? y : y - 1;
};
const getFiscalMonthOrder = (month: number) => (month >= 8 ? month - 7 : month + 5);
const getFiscalYearLabel = (year: number) => {
  const reiwa = year - 2018;
  const next = year + 1;
  const nextReiwa = next - 2018;
  return `${year}年度（令和${reiwa}年8月～令和${nextReiwa}年7月）`;
};

// ====== Component ======
export default function ClientGL() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();

  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [yearGroups, setYearGroups] = useState<FiscalYearGroup[]>([]);
  const [closingData, setClosingData] = useState<ClosingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"monthly" | "closing">("monthly");
  const [viewMode, setViewMode] = useState<"year" | "list">("year");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isClosingImportModalOpen, setIsClosingImportModalOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

  // バナー（暫定）
  const __banner = <MissingImportsBanner />;

  useEffect(() => {
    // 簡易認証: sessionStorage のみ（/api 連携は任意）
    const ok = sessionStorage.getItem("financeSystemAuth") === "authenticated";
    setIsAuthenticated(ok);
    if (ok) void fetchMonthlyData();
  }, []);

  const fetchMonthlyData = async () => {
    try {
      setLoading(true);

      // gl_monthly_stats
      const glRes = await supabase
        .from("gl_monthly_stats")
        .select("*")
        .order("report_month", { ascending: false });

      if (glRes.error) throw glRes.error;

      const gl: MonthlyData[] =
        (glRes.data as any[])?.map((r) => ({
          yyyymm: (r.yyyymm as string) ?? "",
          report_month: (r.report_month as string) ?? "",
          total_debit: Number(r.total_debit ?? 0),
          total_credit: Number(r.total_credit ?? 0),
          record_count: Number(r.record_count ?? 0),
        })) ?? [];

      setMonthlyData(gl);

      // 年度グループ
      const grouped = new Map<number, { yyyymm: string; month: number }[]>();
      gl.forEach((row) => {
        const y = getFiscalYear(row.report_month);
        const m = new Date(row.report_month).getMonth() + 1;
        const arr = grouped.get(y) ?? [];
        arr.push({ yyyymm: row.yyyymm, month: m });
        grouped.set(y, arr);
      });

      const ys: FiscalYearGroup[] = Array.from(grouped.entries())
        .map(([fy, months]) => {
          months.sort((a, b) => getFiscalMonthOrder(a.month) - getFiscalMonthOrder(b.month));
          return { fiscal_year: fy, months };
        })
        .sort((a, b) => b.fiscal_year - a.fiscal_year);

      setYearGroups(ys);

      // closing_adjustments → サマリ
      const clRes = await supabase
        .from("closing_adjustments")
        .select("fiscal_year, fiscal_month, debit_amount, credit_amount");

      if (clRes.error) throw clRes.error;

      const map = new Map<string, ClosingSummary>();
      (clRes.data ?? []).forEach((r: any) => {
        const key = `${r.fiscal_year}-${r.fiscal_month}`;
        const cur = map.get(key) ?? {
          fiscal_year: r.fiscal_year,
          fiscal_month: r.fiscal_month,
          record_count: 0,
          total_debit: 0,
          total_credit: 0,
        };
        cur.record_count += 1;
        cur.total_debit += Number(r.debit_amount ?? 0);
        cur.total_credit += Number(r.credit_amount ?? 0);
        map.set(key, cur);
      });

      setClosingData(Array.from(map.values()).sort((a, b) => {
        if (a.fiscal_year !== b.fiscal_year) return b.fiscal_year - a.fiscal_year;
        return b.fiscal_month - a.fiscal_month;
      }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async () => {
    // 任意: /api/finance/auth があるなら使う
    try {
      const res = await fetch("/api/finance/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.success) {
        setIsAuthenticated(true);
        sessionStorage.setItem("financeSystemAuth", "authenticated");
        await fetchMonthlyData();
      } else {
        alert("パスワードが正しくありません");
      }
    } catch {
      // API が無くてもセッションだけで通せる運用にするなら下をアンコメント
      // setIsAuthenticated(true);
      // sessionStorage.setItem("financeSystemAuth", "authenticated");
      // await fetchMonthlyData();
      alert("認証APIに接続できませんでした。");
    }
  };

  const handleDelete = async (yyyymm: string) => {
    if (!confirm(`${yyyymm} のデータを削除します。よろしいですか？`)) return;
    const year = parseInt(yyyymm.slice(0, 4), 10);
    const month = parseInt(yyyymm.slice(4, 6), 10);
    const reportMonth = `${year}-${String(month).padStart(2, "0")}-01`;
    const { error } = await supabase.from("general_ledger").delete().eq("report_month", reportMonth);
    if (!error) await fetchMonthlyData();
  };

  const toggleYear = (year: number) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="p-6 space-y-4">
        {__banner}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              財務分析システム 認証
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Alert>
              <AlertDescription>
                閲覧にはパスワードが必要です。成功するとローカルの <code>sessionStorage</code> に認証状態を保存します。
              </AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <input
                type="password"
                className="border rounded px-3 py-2 w-64"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button onClick={handleAuth}>
                <Calculator className="h-4 w-4 mr-2" />
                認証
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {__banner}

      {/* ヘッダ */}
      <div className="flex items-center gap-3">
        <Button
          variant={activeTab === "monthly" ? "default" : "secondary"}
          onClick={() => setActiveTab("monthly")}
        >
          <BarChart3 className="h-4 w-4 mr-2" />
          月次集計
        </Button>
        <Button
          variant={activeTab === "closing" ? "default" : "secondary"}
          onClick={() => setActiveTab("closing")}
        >
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          決算整理
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={() => setIsImportModalOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            仕訳CSVインポート
          </Button>
          <Button variant="outline" onClick={() => setIsClosingImportModalOpen(true)}>
            <FileText className="h-4 w-4 mr-2" />
            決算仕訳インポート
          </Button>
        </div>
      </div>

      {/* 月次タブ */}
      {activeTab === "monthly" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              月次データ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center gap-3">
              <span className="text-sm text-gray-500">表示モード</span>
              <Select
                value={viewMode}
                onValueChange={(v: "year" | "list") => setViewMode(v)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="year">年度グループ</SelectItem>
                  <SelectItem value="list">最新順リスト</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {loading && <div className="text-gray-500">読み込み中…</div>}

            {!loading && viewMode === "year" && (
              <div className="space-y-4">
                {yearGroups.map((yg) => (
                  <div key={yg.fiscal_year} className="border rounded-lg">
                    <div
                      className="flex items-center justify-between px-4 py-2 cursor-pointer"
                      onClick={() => toggleYear(yg.fiscal_year)}
                    >
                      <div className="font-semibold">{getFiscalYearLabel(yg.fiscal_year)}</div>
                      {expandedYears.has(yg.fiscal_year) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </div>
                    {expandedYears.has(yg.fiscal_year) && (
                      <div className="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {yg.months.map((m) => {
                          const row = monthlyData.find((r) => r.yyyymm === m.yyyymm);
                          if (!row) return null;
                          return (
                            <div key={m.yyyymm} className="p-3 border rounded">
                              <div className="text-sm text-gray-500">{monthStr(m.yyyymm)}</div>
                              <div className="mt-1 text-sm">
                                仕訳件数: {row.record_count.toLocaleString()}
                              </div>
                              <div className="text-sm">
                                借方合計: {jpy(row.total_debit)} / 貸方合計: {jpy(row.total_credit)}
                              </div>
                              <div className="mt-2 flex gap-2">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    router.push(
                                      `/finance/financial-statements?month=${row.report_month.slice(
                                        0,
                                        7
                                      )}&tab=bs`
                                    )
                                  }
                                >
                                  <DollarSign className="h-4 w-4 mr-1" />
                                  財務諸表
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDelete(m.yyyymm)}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  削除
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!loading && viewMode === "list" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {monthlyData.map((row) => (
                  <div key={row.yyyymm} className="p-3 border rounded">
                    <div className="text-sm text-gray-500">{monthStr(row.yyyymm)}</div>
                    <div className="mt-1 text-sm">
                      仕訳件数: {row.record_count.toLocaleString()}
                    </div>
                    <div className="text-sm">
                      借方合計: {jpy(row.total_debit)} / 貸方合計: {jpy(row.total_credit)}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          router.push(
                            `/finance/financial-statements?month=${row.report_month.slice(
                              0,
                              7
                            )}&tab=bs`
                          )
                        }
                      >
                        <DollarSign className="h-4 w-4 mr-1" />
                        財務諸表
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(row.yyyymm)}>
                        <Trash2 className="h-4 w-4 mr-1" />
                        削除
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 決算タブ */}
      {activeTab === "closing" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              決算整理サマリ
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-gray-500">読み込み中…</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {closingData.map((c) => (
                  <div key={`${c.fiscal_year}-${c.fiscal_month}`} className="p-3 border rounded">
                    <div className="text-sm text-gray-500">
                      {c.fiscal_year}年 {c.fiscal_month}月
                    </div>
                    <div className="mt-1 text-sm">件数: {c.record_count.toLocaleString()}</div>
                    <div className="text-sm">
                      借方合計: {jpy(c.total_debit)} / 貸方合計: {jpy(c.total_credit)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* モーダル（安全フォールバック付き） */}
      {isImportModalOpen && (
        <GeneralLedgerImportModal open={isImportModalOpen} onOpenChange={setIsImportModalOpen} />
      )}
      {isClosingImportModalOpen && (
        <ClosingImportModal
          open={isClosingImportModalOpen}
          onOpenChange={setIsClosingImportModalOpen}
        />
      )}
    </div>
  );
}
