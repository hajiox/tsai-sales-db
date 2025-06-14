// components/web-sales-dashboard.tsx  ※input 画面でも同じ loadData を使っている場合はそちらも同様
"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";

type SummaryRow = {
  id: string;
  product_id: string;
  product_name: string;
  series_name: string | null;
  price: number | null;
  amazon_count: number | null;
  rakuten_count: number | null;
  yahoo_count: number | null;
  mercari_count: number | null;
  base_count: number | null;
  qoo10_count: number | null;
};

export default function WebSalesDashboard() {
  /** UI は “YYYY-MM” だけ持つ */
  const [selectedMonth, setSelectedMonth] = useState<string>(
    format(new Date(), "yyyy-MM")
  );
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  /** 月初 “YYYY-MM-01” でピタッと照合する */
  const loadData = async (ym: string) => {
    setLoading(true);
    const firstDay = `${ym}-01`;
    const { data, error } = await supabase.rpc("web_sales_full_month", {
      target_month: firstDay,
    });

    if (error) throw error;
    setRows((data as SummaryRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadData(selectedMonth).catch(console.error);
  }, [selectedMonth]);

  return (
    <div className="p-6 space-y-4">
      {/* 月選択ドロップダウン（例） */}
      <input
        type="month"
        value={selectedMonth}
        onChange={(e) => setSelectedMonth(e.target.value)}
        className="border rounded px-2 py-1"
      />

      {loading ? (
        <p>loading…</p>
      ) : rows.length === 0 ? (
        <p>データなし</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">商品</th>
              <th>Amazon</th>
              <th>楽天</th>
              <th>Yahoo!</th>
              <th>メルカリ</th>
              <th>BASE</th>
              <th>Qoo10</th>
              <th>合計</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total =
                (r.amazon_count ?? 0) +
                (r.rakuten_count ?? 0) +
                (r.yahoo_count ?? 0) +
                (r.mercari_count ?? 0) +
                (r.base_count ?? 0) +
                (r.qoo10_count ?? 0);
              return (
                <tr key={r.id} className="border-t">
                  <td>{r.product_name}</td>
                  <td className="text-right">{r.amazon_count ?? 0}</td>
                  <td className="text-right">{r.rakuten_count ?? 0}</td>
                  <td className="text-right">{r.yahoo_count ?? 0}</td>
                  <td className="text-right">{r.mercari_count ?? 0}</td>
                  <td className="text-right">{r.base_count ?? 0}</td>
                  <td className="text-right">{r.qoo10_count ?? 0}</td>
                  <td className="text-right font-bold">{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
