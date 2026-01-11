'use client';

import { useState, useCallback, useEffect, Fragment } from 'react';

interface Transaction {
  date: string;
  counterAccount: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface Account {
  code: string;
  name: string;
  category: string;
  openingBalance: number;
  debitTotal: number;
  creditTotal: number;
  closingBalance: number;
  transactionCount: number;
}

interface Summary {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalRevenues: number;
  totalExpenses: number;
  netIncome: number;
  bsBalance: number;
}

const formatAmount = (amount: number): string => {
  if (amount === 0) return '-';
  return amount.toLocaleString('ja-JP');
};

const categoryColors: Record<string, string> = {
  資産: 'bg-blue-50 hover:bg-blue-100',
  負債: 'bg-red-50 hover:bg-red-100',
  純資産: 'bg-green-50 hover:bg-green-100',
  収益: 'bg-purple-50 hover:bg-purple-100',
  費用: 'bg-orange-50 hover:bg-orange-100',
  その他: 'bg-gray-50 hover:bg-gray-100',
};

export default function TrialBalancePage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTx, setLoadingTx] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'bs' | 'pl' | 'all'>('summary');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchAvailableMonths = useCallback(async () => {
    try {
      const res = await fetch('/api/finance/trial-balance', { method: 'OPTIONS' });
      const data = await res.json();
      if (data.months?.length > 0) {
        setAvailableMonths(data.months);
        if (!selectedMonth) setSelectedMonth(data.months[0]);
      }
    } catch (error) {
      console.error('Failed to fetch months:', error);
    }
  }, [selectedMonth]);

  const fetchTrialBalance = useCallback(async (month: string) => {
    if (!month) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/finance/trial-balance?month=${month}`);
      const data = await res.json();
      if (data.accounts) {
        setAccounts(data.accounts);
        setSummary(data.summary);
      }
    } catch (error) {
      console.error('Failed to fetch trial balance:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTransactions = useCallback(async (accountCode: string) => {
    if (!selectedMonth) return;
    setLoadingTx(true);
    try {
      const res = await fetch(
        `/api/finance/transactions?month=${selectedMonth}&accountCode=${accountCode}`
      );
      const data = await res.json();
      if (data.transactions) setTransactions(data.transactions);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setLoadingTx(false);
    }
  }, [selectedMonth]);

  const handleAccountClick = async (code: string) => {
    if (expandedAccount === code) {
      setExpandedAccount(null);
      setTransactions([]);
    } else {
      setExpandedAccount(code);
      await fetchTransactions(code);
    }
  };

  // ファイルアップロード処理
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 月を入力させる
    const month = prompt('対象月を入力してください（例: 2025-08）', selectedMonth || '2025-08');
    if (!month) return;

    // フォーマット確認
    if (!/^\d{4}-\d{2}$/.test(month)) {
      setMessage({ type: 'error', text: '月の形式が正しくありません（例: 2025-08）' });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('reportMonth', month);

      const res = await fetch('/api/general-ledger/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ 
          type: 'success', 
          text: `インポート完了: ${data.accountCount || '?'}科目、${data.transactionCount || '?'}件の取引` 
        });
        // 月リストを更新して、インポートした月を選択
        await fetchAvailableMonths();
        setSelectedMonth(month);
        await fetchTrialBalance(month);
      } else {
        setMessage({ type: 'error', text: data.error || 'インポートに失敗しました' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'アップロード中にエラーが発生しました' });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  useEffect(() => {
    fetchAvailableMonths();
  }, [fetchAvailableMonths]);

  useEffect(() => {
    if (selectedMonth) {
      fetchTrialBalance(selectedMonth);
      setExpandedAccount(null);
      setTransactions([]);
    }
  }, [selectedMonth, fetchTrialBalance]);

  const AccountTable = ({ title, categories }: { title: string; categories: string[] }) => {
    const filtered = accounts.filter((a) => categories.includes(a.category));
    if (filtered.length === 0) return null;

    const totals = filtered.reduce(
      (acc, a) => ({
        opening: acc.opening + a.openingBalance,
        debit: acc.debit + a.debitTotal,
        credit: acc.credit + a.creditTotal,
        closing: acc.closing + a.closingBalance,
      }),
      { opening: 0, debit: 0, credit: 0, closing: 0 }
    );

    return (
      <div className="mb-6">
        <h3 className="text-lg font-bold mb-2 px-3 py-2 bg-gray-700 text-white rounded">{title}</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border text-sm">
            <thead>
              <tr className="bg-gray-200">
                <th className="px-2 py-2 border w-8"></th>
                <th className="px-2 py-2 border w-20 text-left">コード</th>
                <th className="px-2 py-2 border text-left">勘定科目名</th>
                <th className="px-2 py-2 border w-16 text-center">分類</th>
                <th className="px-2 py-2 border w-28 text-right">前月残高</th>
                <th className="px-2 py-2 border w-28 text-right">借方発生</th>
                <th className="px-2 py-2 border w-28 text-right">貸方発生</th>
                <th className="px-2 py-2 border w-28 text-right">当月残高</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((account) => {
                const isExpanded = expandedAccount === account.code;
                const bgColor = categoryColors[account.category] || categoryColors['その他'];

                return (
                  <Fragment key={account.code}>
                    <tr
                      className={`${bgColor} cursor-pointer transition-colors`}
                      onClick={() => handleAccountClick(account.code)}
                    >
                      <td className="px-2 py-2 border text-center text-xs">
                        {account.transactionCount > 0 ? (isExpanded ? '▼' : '▶') : ''}
                      </td>
                      <td className="px-2 py-2 border font-mono text-xs">{account.code}</td>
                      <td className="px-2 py-2 border text-sm">{account.name}</td>
                      <td className="px-2 py-2 border text-center text-xs">{account.category}</td>
                      <td className="px-2 py-2 border text-right font-mono text-sm">
                        {formatAmount(account.openingBalance)}
                      </td>
                      <td className="px-2 py-2 border text-right font-mono text-sm">
                        {formatAmount(account.debitTotal)}
                      </td>
                      <td className="px-2 py-2 border text-right font-mono text-sm">
                        {formatAmount(account.creditTotal)}
                      </td>
                      <td className="px-2 py-2 border text-right font-mono text-sm font-semibold">
                        {formatAmount(account.closingBalance)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} className="p-0">
                          <div className="bg-gray-100 p-3">
                            {loadingTx ? (
                              <p className="text-gray-500 text-sm">読み込み中...</p>
                            ) : transactions.length === 0 ? (
                              <p className="text-gray-500 text-sm">取引明細なし</p>
                            ) : (
                              <table className="w-full text-sm bg-white border">
                                <thead>
                                  <tr className="bg-gray-200">
                                    <th className="px-2 py-1 border text-left w-24">日付</th>
                                    <th className="px-2 py-1 border text-left w-32">相手科目</th>
                                    <th className="px-2 py-1 border text-left">摘要</th>
                                    <th className="px-2 py-1 border text-right w-24">借方</th>
                                    <th className="px-2 py-1 border text-right w-24">貸方</th>
                                    <th className="px-2 py-1 border text-right w-28">残高</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {transactions.slice(0, 100).map((tx, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                      <td className="px-2 py-1 border font-mono text-xs">{tx.date}</td>
                                      <td className="px-2 py-1 border text-xs">{tx.counterAccount}</td>
                                      <td className="px-2 py-1 border text-xs truncate max-w-xs">
                                        {tx.description}
                                      </td>
                                      <td className="px-2 py-1 border text-right font-mono text-xs">
                                        {tx.debit ? formatAmount(tx.debit) : ''}
                                      </td>
                                      <td className="px-2 py-1 border text-right font-mono text-xs">
                                        {tx.credit ? formatAmount(tx.credit) : ''}
                                      </td>
                                      <td className="px-2 py-1 border text-right font-mono text-xs">
                                        {formatAmount(tx.balance)}
                                      </td>
                                    </tr>
                                  ))}
                                  {transactions.length > 100 && (
                                    <tr>
                                      <td colSpan={6} className="px-2 py-1 text-center text-gray-500 text-xs">
                                        ... 他 {transactions.length - 100} 件
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              <tr className="bg-gray-300 font-bold">
                <td className="px-2 py-2 border"></td>
                <td className="px-2 py-2 border"></td>
                <td className="px-2 py-2 border">合計</td>
                <td className="px-2 py-2 border"></td>
                <td className="px-2 py-2 border text-right font-mono">{formatAmount(totals.opening)}</td>
                <td className="px-2 py-2 border text-right font-mono">{formatAmount(totals.debit)}</td>
                <td className="px-2 py-2 border text-right font-mono">{formatAmount(totals.credit)}</td>
                <td className="px-2 py-2 border text-right font-mono">{formatAmount(totals.closing)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-gray-800 text-white py-4 px-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">試算表ビューアー</h1>
            <p className="text-gray-300 text-sm">科目クリックで取引明細を展開</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 rounded text-gray-800"
            >
              {availableMonths.length === 0 && <option value="">データなし</option>}
              {availableMonths.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <label className="px-4 py-2 bg-green-600 rounded cursor-pointer hover:bg-green-700 text-sm">
              {uploading ? 'アップロード中...' : '📁 インポート'}
              <input
                type="file"
                accept=".txt,.csv"
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 px-4">
        {/* メッセージ表示 */}
        {message && (
          <div
            className={`mb-4 p-3 rounded ${
              message.type === 'success'
                ? 'bg-green-100 text-green-800 border border-green-300'
                : 'bg-red-100 text-red-800 border border-red-300'
            }`}
          >
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-500">読み込み中...</div>
        ) : accounts.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            <p className="text-lg mb-2">データがありません</p>
            <p className="text-sm mb-4">総勘定元帳ファイル（.txt または .csv）をインポートしてください</p>
            <label className="inline-block px-6 py-3 bg-green-600 text-white rounded cursor-pointer hover:bg-green-700">
              {uploading ? 'アップロード中...' : '📁 ファイルを選択してインポート'}
              <input
                type="file"
                accept=".txt,.csv"
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow mb-6">
              <div className="flex border-b overflow-x-auto">
                {[
                  { id: 'summary', label: 'サマリー' },
                  { id: 'bs', label: '貸借対照表' },
                  { id: 'pl', label: '損益計算書' },
                  { id: 'all', label: '全科目' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as 'summary' | 'bs' | 'pl' | 'all')}
                    className={`px-6 py-3 font-semibold whitespace-nowrap transition-colors ${
                      activeTab === tab.id
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="p-6">
                {activeTab === 'summary' && summary && (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="p-4 rounded-lg border-2 border-blue-300 bg-blue-50">
                      <h3 className="font-bold text-lg mb-3">貸借対照表</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between py-1 border-b">
                          <span>資産合計</span>
                          <span className="font-mono font-semibold">¥{formatAmount(summary.totalAssets)}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b">
                          <span>負債合計</span>
                          <span className="font-mono font-semibold">¥{formatAmount(summary.totalLiabilities)}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b">
                          <span>純資産合計</span>
                          <span className="font-mono font-semibold">¥{formatAmount(summary.totalEquity)}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>差額（A-L-E）</span>
                          <span className={`font-mono font-semibold ${summary.bsBalance !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                            ¥{formatAmount(summary.bsBalance)}{summary.bsBalance === 0 && ' ✓'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 rounded-lg border-2 border-green-300 bg-green-50">
                      <h3 className="font-bold text-lg mb-3">損益計算書</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between py-1 border-b">
                          <span>収益合計</span>
                          <span className="font-mono font-semibold">¥{formatAmount(summary.totalRevenues)}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b">
                          <span>費用合計</span>
                          <span className="font-mono font-semibold">¥{formatAmount(summary.totalExpenses)}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span>当期純利益</span>
                          <span className={`font-mono font-semibold ${summary.netIncome < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            ¥{formatAmount(summary.netIncome)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'bs' && (
                  <>
                    <AccountTable title="資産" categories={['資産']} />
                    <AccountTable title="負債" categories={['負債']} />
                    <AccountTable title="純資産" categories={['純資産']} />
                  </>
                )}

                {activeTab === 'pl' && (
                  <>
                    <AccountTable title="収益" categories={['収益']} />
                    <AccountTable title="費用" categories={['費用']} />
                  </>
                )}

                {activeTab === 'all' && (
                  <AccountTable
                    title="全勘定科目"
                    categories={['資産', '負債', '純資産', '収益', '費用', 'その他']}
                  />
                )}
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm">
              <p className="font-semibold text-yellow-800">💡 使い方</p>
              <p className="text-yellow-700 mt-1">
                各勘定科目の行をクリックすると、その科目の取引明細が展開されます。
                新しいデータをインポートするには右上の「インポート」ボタンから総勘定元帳ファイルを選択してください。
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
