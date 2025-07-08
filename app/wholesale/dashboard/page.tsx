// /app/wholesale/dashboard/page.tsx ver.15 (エラー修正版)
"use client"

export const dynamic = 'force-dynamic';

import { useState, useEffect, KeyboardEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Users, TrendingUp, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import SummaryCards from '@/components/wholesale/summary-cards';
import RankingCards from '@/components/wholesale/ranking-cards';

// (interface定義は変更なし)
interface Product {
  id: string;
  product_name: string;
  price: number;
  [key: string]: any;
}
interface SalesData {
  [productId: string]: { [date: string]: number; };
}
interface MonthOption {
  value: string;
  label: string;
}


export default function WholesaleDashboard() {
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState('');
  const [monthOptions, setMonthOptions] = useState<MonthOption[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [salesData, setSalesData] = useState<SalesData>({});
  const [previousMonthData, setPreviousMonthData] = useState<SalesData>({});
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // マウント確認用Effect
  useEffect(() => {
    setMounted(true);
  }, []);

  // 月オプション設定Effect
  useEffect(() => {
    if (!mounted) return;
    
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
    
    if (options.length > 0) {
      setSelectedMonth(options[0].value);
    }
  }, [mounted]);

  // データ取得Effect
  useEffect(() => {
    if (!selectedMonth || !mounted) return;

    const fetchAllData = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchProducts(),
          fetchSalesData(selectedMonth),
          fetchPreviousMonthData(selectedMonth)
        ]);
      } catch (error) {
        console.error('データ取得エラー:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [selectedMonth, mounted]);

  // ★修正点：setProductsにオブジェクト(data)ではなく、その中の配列(data.products)を渡す
  const fetchProducts = async () => {
    try {
      const response = await fetch('/api/wholesale/products');
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.products)) {
          setProducts(data.products);
        }
      }
    } catch (error) {
      console.error('商品データ取得エラー:', error);
    }
  };

  // ★修正の可能性：fetchSalesDataとfetchPreviousMonthDataも、APIの応答形式によっては
  // data.salesのように修正が必要になる可能性があります。
  const fetchSalesData = async (month: string) => {
    try {
      const response = await fetch(`/api/wholesale/sales?month=${month}`);
      if (response.ok) {
        const data = await response.json();
        // 仮に data.sales を期待する形に修正。APIの応答形式に合わせてください。
        if (data.success) {
            setSalesData(data.sales);
        }
      }
    } catch (error) {
      console.error('売上データ取得エラー:', error);
    }
  };

  const fetchPreviousMonthData = async (month: string) => {
    try {
      const [year, monthNum] = month.split('-').map(Number);
      const prevDate = new Date(year, monthNum - 2, 1);
      const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      
      const response = await fetch(`/api/wholesale/sales?month=${prevMonth}`);
      if (response.ok) {
        const data = await response.json();
        // 仮に data.sales を期待する形に修正。APIの応答形式に合わせてください。
        if (data.success) {
            setPreviousMonthData(data.sales);
        }
      }
    } catch (error) {
      console.error('前月データ取得エラー:', error);
    }
  };

  const handleQuantityChange = (productId: string, day: number, value: string) => {
    // (変更なし)
  };

  const saveSalesData = async () => {
    // (変更なし)
  };

  const getDaysInMonth = () => {
    // (変更なし)
  };

  // マウント前は何も表示しない
  if (!mounted) {
    return null;
  }
  
  // (JSX部分は変更なし)
  return (
    // ...
  );
}
