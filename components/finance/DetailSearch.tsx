// /components/finance/DetailSearch.tsx ver.1
'use client';

import { useState, useEffect, useMemo } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'; // ver.2 (2025-08-19 JST) - browser singleton client
import { Search } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { TransactionDetail } from '@/types/finance';

interface DetailSearchProps {
  selectedMonth: string;
}

export function DetailSearch({ selectedMonth }: DetailSearchProps) {
  const [transactions, setTransactions] = useState<TransactionDetail[]>([]);
  const [accountMaster, setAccountMaster] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dataLoading, setDataLoading] = useState(false);

    const supabase = useMemo(
      () => (typeof window !== 'undefined' ? getSupabaseBrowserClient() : null),
      []
    );

  const itemsPerPage = 50;

  useEffect(() => {
    loadAccountMaster();
    loadTransactions();
  }, [selectedMonth, selectedAccount, searchTerm, currentPage]);

  const loadAccountMaster = async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from('account_master')
      .select('account_code, account_name')
      .order('account_code');
    
    if (data) {
      setAccountMaster(data);
    }
  };

  const loadTransactions = async () => {
    if (!supabase) return;
    setDataLoading(true);

    let query = supabase
      .from('general_ledger')
      .select(`
        *,
        account_master!inner(account_name)
      `, { count: 'exact' })
      .eq('report_month', `${selectedMonth}-01`)
      .order('transaction_date', { ascending: true })
      .order('id', { ascending: true });

    if (selectedAccount) {
      query = query.eq('account_code', selectedAccount);
    }
    
    if (searchTerm) {
      query = query.or(`description.ilike.%${searchTerm}%,counter_account.ilike.%${searchTerm}%`);
    }

    const from = (currentPage - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;
    query = query.range(from, to);

    const { data, count } = await query;

    if (data) {
      const formattedData = data.map(item => ({
        ...item,
        account_name: item.account_master?.account_name || ''
      }));
      setTransactions(formattedData);
      setTotalPages(Math.ceil((count || 0) / itemsPerPage));
    }
    
    setDataLoading(false);
  };

  return (
    <div className="space-y-4">
      {/* 検索フィルタ */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">勘定科目</label>
            <select
              value={selectedAccount}
              onChange={(e) => {
                setSelectedAccount(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全て</option>
              {accountMaster.map((acc) => (
                <option key={acc.account_code} value={acc.account_code}>
                  {acc.account_code} - {acc.account_name}
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">摘要・相手科目検索</label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="検索キーワード"
                className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            </div>
          </div>
          
          <div className="flex items-end">
            <button
              onClick={() => { 
                setSearchTerm(''); 
                setSelectedAccount('');
                setCurrentPage(1);
              }}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              クリア
            </button>
          </div>
        </div>
      </div>

      {/* 取引明細テーブル */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {dataLoading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-2 text-gray-600">データを読み込んでいます...</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">日付</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">勘定科目</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">相手科目</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">摘要</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">借方</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">貸方</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">残高</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transactions.map((trans) => (
                    <tr key={trans.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">
                        {format(new Date(trans.transaction_date), 'MM/dd', { locale: ja })}
                      </td>
                      <td className="px-4 py-3 text-sm">{trans.account_name}</td>
                      <td className="px-4 py-3 text-sm">{trans.counter_account}</td>
                      <td className="px-4 py-3 text-sm">{trans.description}</td>
                      <td className="px-4 py-3 text-sm text-right">
                        {trans.debit_amount > 0 ? trans.debit_amount.toLocaleString() : ''}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {trans.credit_amount > 0 ? trans.credit_amount.toLocaleString() : ''}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {trans.balance?.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* ページネーション */}
            <div className="px-6 py-4 border-t flex justify-between items-center">
              <div className="text-sm text-gray-600">
                {totalPages > 0 && `${currentPage} / ${totalPages} ページ`}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
                >
                  前へ
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 text-sm bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
                >
                  次へ
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
