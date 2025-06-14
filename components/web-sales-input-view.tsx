'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Row = {
  id: string | null;
  product_id: string;
  product_name: string;
  series_name: string;
  price: number;
  amazon_count: number;
  rakuten_count: number;
  yahoo_count: number;
  mercari_count: number;
  base_count: number;
  qoo10_count: number;
};

const WebSalesInputView = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [ym, setYm] = useState('2025-04');
  const [error, setError] = useState<string | null>(null);

  const formatMonth = (ym: string) => (ym.length === 7 ? `${ym}-01` : ym);

  const load = async (ym: string) => {
    setLoading(true);
    setError(null);

    try {
      // まず日付型として呼び出し（YYYY-MM-01 形式に変換）
      let { data, error } = await supabase.rpc('web_sales_full_month', {
        target_month: formatMonth(ym),
      });

      // 日付型でエラーが出た場合は文字列型でも試行
      if (error || !data) {
        console.warn('Date format failed, trying string format:', error);
        const result = await supabase.rpc('web_sales_full_month', {
          target_month: ym,
        });
        data = result.data;
        error = result.error;
      }

      if (error) {
        throw new Error(`Supabase RPC Error: ${error.message}`);
      }

      if (!data) {
        setRows([]);
        return;
      }

      // データのマッピングと型安全性の向上
      const mapped: Row[] = (Array.isArray(data) ? data : []).map((r: any) => ({
        id: r.id ?? null,
        product_id: String(r.product_id ?? ''),
        product_name: String(r.product_name ?? ''),
        series_name: String(r.series_name ?? ''),
        price: Number(r.price) || 0,
        amazon_count: Number(r.amazon_count) || 0,
        rakuten_count: Number(r.rakuten_count) || 0,
        yahoo_count: Number(r.yahoo_count) || 0,
        mercari_count: Number(r.mercari_count) || 0,
        base_count: Number(r.base_count) || 0,
        qoo10_count: Number(r.qoo10_count) || 0,
      }));

      setRows(mapped);
    } catch (e: any) {
      const errorMessage = e.message || 'データの読み込みに失敗しました';
      setError(errorMessage);
      console.error('Load error:', e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(ym);
  }, [ym]);

  // 合計値を計算
  const grandTotal = rows.reduce((sum, row) => {
    const totalCount = row.amazon_count + row.rakuten_count + row.yahoo_count + 
                      row.mercari_count + row.base_count + row.qoo10_count;
    return sum + (totalCount * row.price);
  }, 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <input
          type="month"
          value={ym}
          onChange={(e) => setYm(e.target.value)}
          className="border rounded px-2 py-1"
          disabled={loading}
        />
        <button
          onClick={() => load(ym)}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded"
        >
          {loading ? '読み込み中...' : '再読み込み'}
        </button>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* ローディング表示 */}
      {loading && (
        <div className="text-center py-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">データを読み込んでいます...</p>
        </div>
      )}

      {/* テーブル */}
      {!loading && (
        <>
          <table className="w-full border-collapse border text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-2 py-1 text-left">商品名</th>
                <th className="border px-2 py-1 text-center">シリーズ名</th>
                <th className="border px-2 py-1 text-right">単価</th>
                <th className="border px-2 py-1 text-right">Amazon</th>
                <th className="border px-2 py-1 text-right">楽天</th>
                <th className="border px-2 py-1 text-right">Yahoo!</th>
                <th className="border px-2 py-1 text-right">メルカリ</th>
                <th className="border px-2 py-1 text-right">BASE</th>
                <th className="border px-2 py-1 text-right">Qoo10</th>
                <th className="border px-2 py-1 text-right">合計件数</th>
                <th className="border px-2 py-1 text-right">合計売上</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="border px-2 py-4 text-center text-gray-500">
                    データがありません
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const total_count =
                    r.amazon_count +
                    r.rakuten_count +
                    r.yahoo_count +
                    r.mercari_count +
                    r.base_count +
                    r.qoo10_count;
                  const total_price = total_count * r.price;

                  return (
                    <tr key={r.id || i} className="hover:bg-gray-50">
                      <td className="border px-2 py-1">{r.product_name}</td>
                      <td className="border px-2 py-1 text-center">{r.series_name}</td>
                      <td className="border px-2 py-1 text-right">¥{r.price.toLocaleString()}</td>
                      <td className="border px-2 py-1 text-right">{r.amazon_count}</td>
                      <td className="border px-2 py-1 text-right">{r.rakuten_count}</td>
                      <td className="border px-2 py-1 text-right">{r.yahoo_count}</td>
                      <td className="border px-2 py-1 text-right">{r.mercari_count}</td>
                      <td className="border px-2 py-1 text-right">{r.base_count}</td>
                      <td className="border px-2 py-1 text-right">{r.qoo10_count}</td>
                      <td className="border px-2 py-1 text-right font-semibold">{total_count}</td>
                      <td className="border px-2 py-1 text-right font-semibold">¥{total_price.toLocaleString()}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-gray-100 font-bold">
                  <td colSpan={10} className="border px-2 py-1 text-right">総合計:</td>
                  <td className="border px-2 py-1 text-right">¥{grandTotal.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </>
      )}
    </div>
  );
};

export default WebSalesInputView;
