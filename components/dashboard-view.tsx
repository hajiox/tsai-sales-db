'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/** ───────────────────────────────────
 *  型定義（必要最低限）
 * ─────────────────────────────────── */
type DailySales = {
  date: string;
  floor_sales: number;
  cash_amount: number;
  register_count: number;
  amazon_amount: number;
  rakuten_amount: number;
  yahoo_amount: number;
  mercari_amount: number;
  base_amount: number;
  qoo10_amount: number;
};

/** ───────────────────────────────────
 *  カード用のヘルパー
 * ─────────────────────────────────── */
const Card = ({
  title,
  value,
  foot,
}: {
  title: string;
  value: number | string;
  foot?: string;
}) => (
  <div className="rounded-2xl border p-4 shadow-sm">
    <p className="text-sm text-muted-foreground">{title}</p>
    <p className="mt-2 text-2xl font-bold tracking-tight">
      {typeof value === 'number' ? `¥${value.toLocaleString()}` : value}
    </p>
    {foot && <p className="mt-1 text-xs text-muted-foreground">{foot}</p>}
  </div>
);

/** ───────────────────────────────────
 *  ダッシュボード本体
 * ─────────────────────────────────── */
export default function DashboardView({
  selectedDate,
}: {
  selectedDate: string;
}) {
  const [sales, setSales] = useState<DailySales | null>(null);
  const [loading, setLoading] = useState(true);

  /* データ取得ロジック —— .maybeSingle() で 406 回避 */
  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from('daily_sales_report')
        .select('*')
        .eq('date', selectedDate)
        .maybeSingle(); // ← ★ここだけ変更

      if (error) {
        console.error(error.message);
      }

      setSales(
        data ?? {
          date: selectedDate,
          floor_sales: 0,
          cash_amount: 0,
          register_count: 0,
          amazon_amount: 0,
          rakuten_amount: 0,
          yahoo_amount: 0,
          mercari_amount: 0,
          base_amount: 0,
          qoo10_amount: 0,
        },
      );
      setLoading(false);
    };

    load();
  }, [selectedDate]);

  if (loading || !sales) return <div className="p-4">読み込み中…</div>;

  return (
    <section className="grid grid-cols-2 gap-4 p-4 md:grid-cols-3 lg:grid-cols-4">
      <Card title="フロア売上" value={sales.floor_sales} foot={sales.date} />
      <Card title="レジ通過人数" value={sales.register_count} foot={sales.date} />
      <Card title="EC売上" value={sales.amazon_amount + sales.rakuten_amount + sales.yahoo_amount + sales.mercari_amount + sales.base_amount + sales.qoo10_amount} foot={sales.date} />
      <Card title="売上日計" value={sales.floor_sales + sales.amazon_amount + sales.rakuten_amount + sales.yahoo_amount + sales.mercari_amount + sales.base_amount + sales.qoo10_amount} foot={sales.date} />
      {/* ほかのカードも同様に追加 */}
    </section>
  );
}
