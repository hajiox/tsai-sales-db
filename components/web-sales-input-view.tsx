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

  const load = async (ym: string) => {
    setLoading(true);
    try {
      const target_month = `${ym}-01`;
      const { data, error } = await supabase.rpc('web_sales_full_month', {
        target_month,
      });
      if (error) throw error;

      const mapped: Row[] = (data as any[] | null | undefined)?.map((r) => ({
        id: r.id ?? null,
        product_id: r.product_id,
        product_name: r.product_name,
        series_name: r.series_name,
        price: r.price ?? 0,
        amazon_count: Number(r.amazon_count) || 0,
        rakuten_count: Number(r.rakuten_count) || 0,
        yahoo_count: Number(r.yahoo_count) || 0,
        mercari_count: Number(r.mercari_count) || 0,
        base_count: Number(r.base_count) || 0,
        qoo10_count: Number(r.qoo10_count) || 0,
      })) ?? [];
      setRows(mapped);
    } catch (e: any) {
      alert(e.message ?? e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(ym);
  }, [ym]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <input
          type="month"
          value={ym}
          onChange={(e) => setYm(e.target.value)}
          className="border rounded px-2 py-1"
        />
        <button
          onClick={() => load(ym)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          保存
        </button>
      </div>
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
          {rows.map((r, i) => {
            const total_count =
              r.amazon_count +
              r.rakuten_count +
              r.yahoo_count +
              r.mercari_count +
              r.base_count +
              r.qoo10_count;
            const total_price = total_count * r.price;

            return (
              <tr key={i}>
                <td className="border px-2 py-1">{r.product_name}</td>
                <td className="border px-2 py-1 text-center">{r.series_name}</td>
                <td className="border px-2 py-1 text-right">{r.price}</td>
                <td className="border px-2 py-1 text-right">{r.amazon_count}</td>
                <td className="border px-2 py-1 text-right">{r.rakuten_count}</td>
                <td className="border px-2 py-1 text-right">{r.yahoo_count}</td>
                <td className="border px-2 py-1 text-right">{r.mercari_count}</td>
                <td className="border px-2 py-1 text-right">{r.base_count}</td>
                <td className="border px-2 py-1 text-right">{r.qoo10_count}</td>
                <td className="border px-2 py-1 text-right">{total_count}</td>
                <td className="border px-2 py-1 text-right">¥{total_price.toLocaleString()}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default WebSalesInputView;
