// components/web-sales-input-view.tsx
// WEB販売管理システム：件数入力画面（既存件数を初期表示）

"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/lib/supabase";

type Row = {
  id: string;
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

export default function WebSalesInputView() {
  const [month, setMonth] = useState<string>(format(new Date(), "yyyy-MM"));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // データ取得
  const load = async (ym: string) => {
    setLoading(true);
    const firstDay = `${ym}-01`;
    const { data, error } = await supabase
      .from("web_sales_summary")
      .select(
        `id, product_name, series_name, price,
         amazon_count, rakuten_count, yahoo_count,
         mercari_count, base_count, qoo10_count`
      )
      .eq("report_month", firstDay)
      .order("series_name", { ascending: true })
      .order("product_name", { ascending: true });
    if (error) throw error;
    setRows(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load(month).catch(console.error);
  }, [month]);

  // 値更新ローカル保持
  const update = (
    id: string,
    field:
      | "amazon_count"
      | "rakuten_count"
      | "yahoo_count"
      | "mercari_count"
      | "base_count"
      | "qoo10_count",
    val: number
  ) => {
    setRows((r) =>
      r.map((row) => (row.id === id ? { ...row, [field]: val } : row))
    );
  };

  // 保存
  const save = async () => {
    setLoading(true);
    const updates = rows.map((r) => ({
      id: r.id,
      amazon_count: r.amazon_count,
      rakuten_count: r.rakuten_count,
      yahoo_count: r.yahoo_count,
      mercari_count: r.mercari_count,
      base_count: r.base_count,
      qoo10_count: r.qoo10_count,
    }));
    const { error } = await supabase.from("web_sales_summary").upsert(updates);
    if (error) alert(error.message);
    setLoading(false);
  };

  return (
    <div className="p-6 space-y-4">
      {/* 月選択 */}
      <div className="flex items-center gap-2">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="border rounded px-2 py-1"
        />
        <button
          onClick={save}
          disabled={loading}
          className="bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50"
        >
          保存
        </button>
      </div>

      {/* テーブル */}
      {loading ? (
        <p>loading…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left">商品名</th>
              <th className="text-left">シリーズ名</th>
              <th>単価</th>
              <th>Amazon</th>
              <th>楽天</th>
              <th>Yahoo!</th>
              <th>メルカリ</th>
              <th>BASE</th>
              <th>Qoo10</th>
              <th>合計件数</th>
              <th>合計売上</th>
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
              const totalSales = (r.price ?? 0) * total;

              return (
                <tr key={r.id} className="border-t">
                  <td>{r.product_name}</td>
                  <td>{r.series_name ?? "-"}</td>
                  <td className="text-right">{r.price ?? 0}</td>

                  {/* 全 input：既存件数を defaultValue に設定 */}
                  <td>
                    <input
                      type="number"
                      defaultValue={r.amazon_count ?? 0}
                      onChange={(e) =>
                        update(r.id, "amazon_count", +e.target.value || 0)
                      }
                      className="w-14 text-right"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      defaultValue={r.rakuten_count ?? 0}
                      onChange={(e) =>
                        update(r.id, "rakuten_count", +e.target.value || 0)
                      }
                      className="w-14 text-right"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      defaultValue={r.yahoo_count ?? 0}
                      onChange={(e) =>
                        update(r.id, "yahoo_count", +e.target.value || 0)
                      }
                      className="w-14 text-right"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      defaultValue={r.mercari_count ?? 0}
                      onChange={(e) =>
                        update(r.id, "mercari_count", +e.target.value || 0)
                      }
                      className="w-14 text-right"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      defaultValue={r.base_count ?? 0}
                      onChange={(e) =>
                        update(r.id, "base_count", +e.target.value || 0)
                      }
                      className="w-14 text-right"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      defaultValue={r.qoo10_count ?? 0}
                      onChange={(e) =>
                        update(r.id, "qoo10_count", +e.target.value || 0)
                      }
                      className="w-14 text-right"
                    />
                  </td>

                  <td className="text-right font-bold">{total}</td>
                  <td className="text-right font-bold">
                    ¥{totalSales.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
