// /app/wholesale/dashboard/page.tsx ver.12 (ビルドエラー対策版)
"use client"

// ★修正点：このページを動的にレンダリングするようNext.jsに指示
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

export default function WholesaleDashboard() {
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [salesData, setSalesData] = useState<SalesData>({});
  const [previousMonthData, setPreviousMonthData] = useState<SalesData>({});
  const [loading, setLoading] = useState(true);

  // データ取得
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await fetchProducts();
      setLoading(false);
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (products.length > 0) {
        fetchSalesData();
        fetchPreviousMonthData();
    }
  }, [selectedMonth, products]);

  const fetchProducts = async () => {
    try {
      const response = await fetch('/api/wholesale/products');
      const data = await response.json();
      if (data.success) {
        setProducts(data.products);
      } else {
        console.error('商品取得APIエラー:', data.error);
        setProducts([]);
      }
    } catch (error) {
      console.error('商品取得Fetchエラー:', error);
      setProducts([]);
    }
  };

  const fetchSalesData = async () => {
    try {
      const response = await fetch(`/api/wholesale/sales?month=${selectedMonth}`);
      const data = await response.json();
      if (data.success) {
        const formatted: SalesData = {};
        data.sales.forEach((sale: any) => {
          if (!formatted[sale.product_id]) {
            formatted[sale.product_id] = {};
          }
          const day = new Date(sale.sale_date).getUTCDate();
          formatted[sale.product_id][day] = sale.quantity;
        });
        setSalesData(formatted);
      }
    } catch (error) {
      console.error('売上データ取得エラー:', error);
    }
  };

  const fetchPreviousMonthData = async () => {
    try {
      const [year, month] = selectedMonth.split('-').map(Number);
      const prevDate = new Date(year, month - 2);
      const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      
      const response = await fetch(`/api/wholesale/sales?month=${prevMonth}`);
      const data = await response.json();
      if (data.success) {
        const formatted: SalesData = {};
        data.sales.forEach((sale: any) => {
          if (!formatted[sale.product_id]) {
            formatted[sale.product_id] = {};
          }
          const day = new Date(sale.sale_date).getUTCDate();
          formatted[sale.product_id][day] = sale.quantity;
        });
        setPreviousMonthData(formatted);
      }
    } catch (error) {
      console.error('前月データ取得エラー:', error);
    }
  };

  const handleQuantityChange = (productId: string, day: number, value: string) => {
    const quantity = parseInt(value, 10);
    setSalesData(prev => {
      const newProdSales = { ...(prev[productId] || {}) };
      if (!isNaN(quantity) && quantity > 0) {
        newProdSales[day] = quantity;
      } else {
        delete newProdSales[day];
      }
      return {
        ...prev,
        [productId]: newProdSales,
      };
    });
  };

  const handleInputBlur = async (productId: string, day: number) => {
    await saveSalesData(productId, day);
  };

  const handleInputKeyDown = async (e: KeyboardEvent<HTMLInputElement>, productId: string, day: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await saveSalesData(productId, day);
      (e.target as HTMLInputElement).blur();
    }
  };
  
  const saveSalesData = async (productId: string, day: number) => {
    const quantity = salesData[productId]?.[day] || 0;
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const saleDate = `${selectedMonth}-${String(day).padStart(2, '0')}`;
    
    try {
      await fetch('/api/wholesale/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          saleDate,
          quantity,
          unitPrice: product.price
        })
      });
    } catch (error) {
      console.error('保存エラー:', error);
    }
  };

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    return {
      value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, '0')}月`
    };
  });

  const getDaysInMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    return new Date(year, month, 0).getDate();
  };

  const daysInMonth = getDaysInMonth();

  const calculateTotals = (productId: string) => {
    const sales = salesData[productId] || {};
    const totalQuantity = Object.values(sales).reduce((sum: number, qty: any) => sum + (qty || 0), 0);
    const product = products.find(p => p.id === productId);
    const totalAmount = totalQuantity * (product?.price || 0);
    return { totalQuantity, totalAmount };
  };

  const grandTotal = products.reduce((sum, product) => {
    const { totalAmount } = calculateTotals(product.id);
    return sum + totalAmount;
  }, 0);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* (中略) JSX部分は変更なし... */}
    </div>
  );
}
