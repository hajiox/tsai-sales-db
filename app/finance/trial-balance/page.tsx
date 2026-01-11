// /app/finance/trial-balance/page.tsx ver.4
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  ChevronRight,
  ChevronDown,
  Upload,
  Trash2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// --- 型定義 ---
interface AccountData {
  code: string;
  name: string;
  category: string;
  openingBalance: number;
  debitTotal: number;
  creditTotal: number;
  closingBalance: number;
  transactionCount: number;
}

interface SummaryData {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalRevenues: number;
  totalExpenses: number;
  netIncome: number;
  bsBalance: number;
}

interface TrialBalanceResponse {
  accounts: AccountData[];
  summary: SummaryData;
  month: string;
}

interface Transaction {
  date: string;
  counterAccount: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  rowNo: number;
}

// --- メインコンポーネント ---
export default function TrialBalancePage() {
  // 状態管理
  const [currentMonth, setCurrentMonth] = useState<string>("");
  const [data, setData] = useState<TrialBalanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  
  // タブは「損益計算書(PL)」と「全科目」のみにする
  const [tab, setTab] = useState<"pl" | "all">("pl");
  
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(
    new Set()
  );
  const [transactions, setTransactions] = useState<Map<string, Transaction[]>>(
    new Map()
  );
  const [loadingTransactions, setLoadingTransactions] = useState<Set<string>>(
    new Set()
  );

  // モーダル状態
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMonth, setImportMonth] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  // 削除モーダル状態
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteMonth, setDeleteMonth] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const { toast } = useToast();

  // 初期化：現在の年月を設定
  useEffect(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    setCurrentMonth(`${yyyy}-${mm}`);
  }, []);

  // データ取得
  useEffect(() => {
    if (!currentMonth) return;
    fetchData(currentMonth);
  }, [currentMonth]);

  const fetchData = async (month: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/trial-balance?month=${month}`);
      if (!res.ok) throw new Error("データの取得に失敗しました");
      const jsonData = await res.json();
      setData(jsonData);
      // 月が変わったら展開状態と取引データをリセット
      setExpandedAccounts(new Set());
      setTransactions(new Map());
    } catch (error) {
      console.error(error);
      toast({
        title: "エラー",
        description: "データの読み込みに失敗しました。",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // 取引明細取得
  const toggleAccountExpand = async (accountCode: string) => {
    const newExpanded = new Set(expandedAccounts);

    if (newExpanded.has(accountCode)) {
      newExpanded.delete(accountCode);
    } else {
      newExpanded.add(accountCode);
      if (!transactions.has(accountCode)) {
        await fetchTransactions(accountCode);
      }
    }
    setExpandedAccounts(newExpanded);
  };

  const fetchTransactions = async (accountCode: string) => {
    setLoadingTransactions((prev) => new Set(prev).add(accountCode));
    try {
      const res = await fetch(
        `/api/finance/transactions?month=${currentMonth}&accountCode=${accountCode}`
      );
      if (!res.ok) throw new Error("取引データの取得に失敗しました");
      const json = await res.json();
      setTransactions((prev) =>
        new Map(prev).set(accountCode, json.transactions)
      );
    } catch (error) {
      console.error(error);
      toast({
        title: "エラー",
        description: "取引明細の取得に失敗しました。",
        variant: "destructive",
      });
    } finally {
      setLoadingTransactions((prev) => {
        const next = new Set(prev);
        next.delete(accountCode);
        return next;
      });
    }
  };

  // インポート処理
  const handleImport = async () => {
    if (!importFile || !importMonth) {
      toast({
        title: "エラー",
        description: "ファイルと対象月を選択してください。",
        variant: "destructive",
      });
      return;
    }

    setIsImporting(true);
    const formData = new FormData();
    formData.append("file", importFile);
    formData.append("reportMonth", importMonth);

    try {
      const res = await fetch("/api/general-ledger/import", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "インポートに失敗しました");
      }

      toast({
        title: "完了",
        description: "インポートが完了しました。",
      });
      setIsImportModalOpen(false);
      setImportFile(null);
      // インポートした月を表示して更新
      setCurrentMonth(importMonth);
      fetchData(importMonth);
    } catch (error: any) {
      console.error(error);
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  // 削除処理
  const handleDelete = async () => {
    if (!deleteMonth) return;

    if (!confirm(`${deleteMonth}のデータを本当に削除しますか？`)) return;

    setIsDeleting(true);
    try {
      const res = await fetch("/api/finance/trial-balance/delete", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ month: deleteMonth }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "削除に失敗しました");
      }

      toast({
        title: "削除完了",
        description: `${deleteMonth}のデータを削除しました。`,
      });
      setIsDeleteModalOpen(false);
      // データを再取得（削除されているのでクリアされるはず）
      if (currentMonth === deleteMonth) {
        fetchData(currentMonth);
      }
    } catch (error: any) {
      console.error(error);
      toast({
        title: "エラー",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // 金額フォーマット
  const fmt = (num: number) => num.toLocaleString();

  // カテゴリごとの背景色
  const getCategoryColor = (category: string) => {
    switch (category) {
      case "資産":
      case "負債":
      case "純資産":
        return "bg-gray-50 hover:bg-gray-100 opacity-60"; // BS項目は目立たなくする
      case "収益":
        return "bg-purple-50 hover:bg-purple-100";
      case "費用":
        return "bg-orange-50 hover:bg-orange-100";
      default:
        return "bg-gray-50 hover:bg-gray-100";
    }
  };

  // 表示データのフィルタリング
  const filteredAccounts =
    data?.accounts.filter((acc) => {
      if (tab === "all") return true;
      // PLタブは収益と費用のみ表示
      if (tab === "pl") return ["収益", "費用"].includes(acc.category);
      return false;
    }) || [];

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* ヘッダーエリア */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">損益分析ビューアー</h1>
          <p className="text-sm text-gray-500">
            当月の収支状況を確認します (貸借対照表は非表示)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={currentMonth}
            onChange={(e) => setCurrentMonth(e.target.value)}
            className="w-40"
          />
          <Button
            variant="outline"
            onClick={() => {
              setImportMonth(currentMonth);
              setIsImportModalOpen(true);
            }}
          >
            <Upload className="w-4 h-4 mr-2" />
            インポート
          </Button>
          <Button
            variant="destructive"
            size="icon"
            onClick={() => {
              setDeleteMonth(currentMonth);
              setIsDeleteModalOpen(true);
            }}
            title="表示中の月のデータを削除"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* タブ切り替え */}
      <div className="flex gap-2 border-b">
        <Button
          variant={tab === "pl" ? "default" : "ghost"}
          onClick={() => setTab("pl")}
          className="rounded-b-none"
        >
          損益計算書 (P/L)
        </Button>
        <Button
          variant={tab === "all" ? "default" : "ghost"}
          onClick={() => setTab("all")}
          className="rounded-b-none"
        >
          全科目リスト
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : !data || !data.summary ? (
        <div className="text-center py-20 text-gray-500">
          データがありません。対象月を選択するかインポートしてください。
        </div>
      ) : (
        <>
          {/* PLタブ選択時のトップサマリー */}
          {tab === "pl" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="border-t-4 border-t-purple-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-purple-500" />
                    収益合計 (売上など)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-700">
                    ¥{fmt(data.summary.totalRevenues)}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-t-4 border-t-orange-500">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-orange-500" />
                    費用合計 (経費など)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-700">
                    ¥{fmt(data.summary.totalExpenses)}
                  </div>
                </CardContent>
              </Card>

              <Card className={`border-t-4 ${data.summary.netIncome >= 0 ? "border-t-green-500" : "border-t-red-500"}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-gray-500" />
                    当期純利益 (収益 - 費用)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${data.summary.netIncome >= 0 ? "text-green-700" : "text-red-600"}`}>
                    ¥{fmt(data.summary.netIncome)}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* 科目一覧テーブル */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>コード</TableHead>
                  <TableHead>科目名</TableHead>
                  <TableHead>分類</TableHead>
                  {/* B/S関連の残高列は全科目タブでのみ重要だが、PLでも期末残高＝当月の動きの蓄積として表示して問題ない */}
                  <TableHead className="text-right">借方合計</TableHead>
                  <TableHead className="text-right">貸方合計</TableHead>
                  <TableHead className="text-right">差引残高</TableHead>
                  <TableHead className="text-right">件数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAccounts.map((acc) => {
                  const isExpanded = expandedAccounts.has(acc.code);
                  const trans = transactions.get(acc.code);
                  const isLoadingTrans = loadingTransactions.has(acc.code);
                  
                  // PL科目において、期末残高は必ずしも重要ではないが、
                  // 収益は貸方、費用は借方に残高が残るのが基本。
                  // ここではシンプルに計算上の期末残高を表示する。

                  return (
                    <>
                      <TableRow
                        key={acc.code}
                        className={`cursor-pointer transition-colors ${getCategoryColor(
                          acc.category
                        )}`}
                        onClick={() => toggleAccountExpand(acc.code)}
                      >
                        <TableCell>
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {acc.code}
                        </TableCell>
                        <TableCell>{acc.name}</TableCell>
                        <TableCell>
                          <span className="px-2 py-1 rounded-full text-xs bg-white border">
                            {acc.category}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(acc.debitTotal)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(acc.creditTotal)}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {fmt(acc.closingBalance)}
                        </TableCell>
                        <TableCell className="text-right">
                          {acc.transactionCount}
                        </TableCell>
                      </TableRow>

                      {/* 展開時の取引明細 */}
                      {isExpanded && (
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                          <TableCell colSpan={8} className="p-4">
                            <div className="pl-4 border-l-4 border-slate-300">
                              <h4 className="mb-2 text-sm font-bold text-slate-700">
                                {acc.name} - 取引明細 ({currentMonth})
                              </h4>
                              {isLoadingTrans ? (
                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  読み込み中...
                                </div>
                              ) : trans && trans.length > 0 ? (
                                <div className="overflow-x-auto">
                                  <Table className="bg-white border text-sm">
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>日付</TableHead>
                                        <TableHead>相手科目</TableHead>
                                        <TableHead>摘要</TableHead>
                                        <TableHead className="text-right">
                                          借方
                                        </TableHead>
                                        <TableHead className="text-right">
                                          貸方
                                        </TableHead>
                                        <TableHead className="text-right">
                                          残高
                                        </TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {trans.map((t, idx) => (
                                        <TableRow key={idx}>
                                          <TableCell className="whitespace-nowrap">
                                            {t.date}
                                          </TableCell>
                                          <TableCell>
                                            {t.counterAccount}
                                          </TableCell>
                                          <TableCell className="max-w-[300px] truncate" title={t.description}>
                                            {t.description}
                                          </TableCell>
                                          <TableCell className="text-right text-blue-600">
                                            {t.debit > 0
                                              ? fmt(t.debit)
                                              : "-"}
                                          </TableCell>
                                          <TableCell className="text-right text-red-600">
                                            {t.credit > 0
                                              ? fmt(t.credit)
                                              : "-"}
                                          </TableCell>
                                          <TableCell className="text-right font-medium">
                                            {fmt(t.balance)}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                  {trans.length >= 100 && (
                                    <p className="text-xs text-gray-500 mt-2 text-right">
                                      ※ 最大100件まで表示しています
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-500">
                                  取引データがありません
                                </p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* インポートモーダル */}
      <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>データのインポート</DialogTitle>
            <DialogDescription>
              総勘定元帳のCSV/TXTファイルを選択してください。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">対象月</label>
              <Input
                type="month"
                value={importMonth}
                onChange={(e) => setImportMonth(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">ファイル選択</label>
              <Input
                type="file"
                accept=".csv,.txt"
                onChange={(e) =>
                  setImportFile(e.target.files ? e.target.files[0] : null)
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsImportModalOpen(false)}
            >
              キャンセル
            </Button>
            <Button onClick={handleImport} disabled={isImporting}>
              {isImporting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              インポート実行
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認モーダル */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              データの削除
            </DialogTitle>
            <DialogDescription>
              以下の月のデータを完全に削除します。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">削除対象月</label>
              <Input
                type="month"
                value={deleteMonth}
                onChange={(e) => setDeleteMonth(e.target.value)}
              />
            </div>
            <div className="p-4 bg-red-50 text-red-700 text-sm rounded-md">
              <p className="font-bold mb-1">⚠️ 警告</p>
              この操作は取り消せません。
              <br />
              対象月のすべての「仕訳データ」と「月次残高データ」が削除されます。
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDeleteModalOpen(false)}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || !deleteMonth}
            >
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              削除を実行
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
