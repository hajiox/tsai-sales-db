// /app/wholesale/dashboard/page.tsx ver.13 (ハイドレーションエラー対策版)
"use client"

export const dynamic = 'force-dynamic';

import { useState, useEffect, KeyboardEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Users, TrendingUp, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import SummaryCards from '@/components/wholesale/summary-cards';
import RankingCards from '@/components/wholesale/ranking-cards';

interface Product {
  id: string;
  product_name: string;
  price: number;
  [key: string]: any;
}

interface SalesData {
  [productId: string]: {
    [date: string]: number;
  };
}

interface MonthOption {
  value: string;
  label: string;
}

export default function WholesaleDashboard() {
  const router = useRouter();
  // ★修正点：初期値は空にしておき、クライアント側で設定する
  const [selectedMonth, setSelectedMonth] = useState('');
  const [monthOptions, setMonthOptions] = useState<MonthOption[]>([]);

  const [products, setProducts] = useState<Product[]>([]);
  const [salesData, setSalesData] = useState<SalesData>({});
  const [previousMonthData, setPreviousMonthData] = useState<SalesData>({});
  const [loading, setLoading] = useState(true);

  // ★修正点：クライアントサイドでのみ実行されるuseEffectで、日付関連の初期設定をすべて行う
  useEffect(() => {
    const options: MonthOption[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push({
        value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        label: `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月`
      });
    }
    setMonthOptions(options);
    // 初期選択月を当月に設定
    if (options.length > 0) {
      setSelectedMonth(options[0].value);
    }
  }, []); // このEffectはマウント時に一度だけ実行される

  // ★修正点：月の選択が完了してから、データ取得を開始する
  useEffect(() => {
    if (!selectedMonth) return; // selectedMonthが設定されるまで何もしない

    const fetchAllData = async () => {
      setLoading(true);
      // 商品マスタと売上データを並行して取得
      await Promise.all([
        fetchProducts(),
        fetchSalesData(selectedMonth),
        fetchPreviousMonthData(selectedMonth)
      ]);
      setLoading(false);
    };

    fetchAllData();
  }, [selectedMonth]); // selectedMonthが変更されたら実行

  const fetchProducts = async () => {
    // （変更なし）
  };

  const fetchSalesData = async (month: string) => {
    // （変更なし、引数を受け取るように）
  };

  const fetchPreviousMonthData = async (month: string) => {
    // （変更なし、引数を受け取るように）
  };

  const handleQuantityChange = (productId: string, day: number, value: string) => {
    // （変更なし）
  };

  // 以下、他の関数（saveSalesData, calculateTotalsなど）は変更ありません

  const getDaysInMonth = () => {
    if (!selectedMonth) return 31; // 初期値
    const [year, month] = selectedMonth.split('-').map(Number);
    return new Date(year, month, 0).getDate();
  };

  const daysInMonth = getDaysInMonth();
  
  if (loading && !products.length) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div>読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* (中略) JSX部分は変更なし... */}
    </div>
  );
}
