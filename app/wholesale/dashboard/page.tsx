// /app/wholesale/dashboard/page.tsx ver.22 (CSVインポート機能追加版)
"use client"

export const dynamic = 'force-dynamic';

import { useState, useEffect, KeyboardEvent, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, Users, TrendingUp, FileText, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse'; // ★追加：CSVパーサーをインポート
import SummaryCards from '@/components/wholesale/summary-cards';
import RankingCards from '@/components/wholesale/ranking-cards';

// Interfaces (変更なし)
interface Product { id: string; product_name: string; price: number; [key: string]: any; }
interface SalesData { [productId: string]: { [date: string]: number | undefined; }; }
interface MonthOption { value: string; label: string; }

export default function WholesaleDashboard() {
  const router = useRouter();
  const [selectedMonth, setSelectedMonth] = useState('');
  const [monthOptions, setMonthOptions] = useState<MonthOption[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [salesData, setSalesData] = useState<SalesData>({});
  const [previousMonthData, setPreviousMonthData] = useState<SalesData>({});
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null); // ★追加：ファイル入力への参照

  // これまでの関数は変更なし
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (!mounted) return; /* ... 月オプション設定 ... */ }, [mounted]);
  useEffect(() => { if (!selectedMonth || !mounted) return; /* ... データ取得 ... */ }, [selectedMonth, mounted]);
  const fetchProducts = async () => { /* ... */ };
  const fetchSalesData = async (month: string) => { /* ... */ };
  const fetchPreviousMonthData = async (month: string) => { /* ... */ };
  const handleQuantityChange = (productId: string, day: number, value: string) => { /* ... */ };
  const saveSalesData = async (productId: string, day: number) => { /* ... */ };
  const handleInputKeyDown = async (e: KeyboardEvent<HTMLInputElement>, productId: string, day: number) => { /* ... */ };
  const getDaysInMonth = () => { /* ... */ };
  const calculateTotals = (productId: string) => { /* ... */ };
  const grandTotal = products.reduce((sum, product) => { /* ... */ }, 0);
  
  // ★追加：CSVファイル処理ロジック
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const csvData = results.data as { [key: string]: string }[];
        
        // 商品名をキーにした商品IDのマップを作成
        const productNameToIdMap = new Map(products.map(p => [p.product_name, p.id]));
        
        const newSalesData: SalesData = JSON.parse(JSON.stringify(salesData));

        csvData.forEach(row => {
          const productName = row['商品名'];
          const productId = productNameToIdMap.get(productName);

          if (productId) {
            if (!newSalesData[productId]) {
              newSalesData[productId] = {};
            }
            // 1日から31日までチェック
            for (let day = 1; day <= 31; day++) {
              const dayKey = `${day}日`;
              const quantityStr = row[dayKey];
              if (quantityStr) {
                const quantity = parseInt(quantityStr, 10);
                if (!isNaN(quantity)) {
                  newSalesData[productId][day] = quantity;
                }
              }
            }
          }
        });
        setSalesData(newSalesData);
        alert('CSVファイルの読み込みが完了しました。');
      },
      error: (error) => {
        console.error('CSVの解析エラー:', error);
        alert('CSVファイルの解析中にエラーが発生しました。');
      }
    });
    // 同じファイルを再度選択できるように値をリセット
    event.target.value = '';
  };

  if (!mounted) {
    return <div className="flex items-center justify-center h-screen"><p>読み込み中...</p></div>;
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="flex-shrink-0 bg-white shadow-sm border-b z-30">
        { /* ヘッダー部分は変更なし */ }
      </header>

      <main className="flex-1 flex flex-col overflow-hidden p-4 space-y-4">
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><p>データを読み込んでいます...</p></div>
        ) : (
          <>
            {/* 上段・中段は変更なし */}
            <div className="flex-shrink-0 space-y-4">
              <SummaryCards products={products} grandTotal={grandTotal} />
              <RankingCards products={products} salesData={salesData} previousMonthData={previousMonthData} />
            </div>

            {/* 下段：日別実績テーブル */}
            <Card className="flex-1 flex flex-col overflow-hidden">
              { /* CardHeaderとCardContentのテーブル部分は変更なし */ }
            </Card>

            {/* ★追加：操作ボタンにCSVインポート機能を追加 */}
            <div className="flex gap-3 justify-center pt-4 pb-2">
              <Button size="sm" onClick={() => router.push('/wholesale/products')}>
                <Package className="w-3 h-3 mr-1" />
                商品マスタ管理
              </Button>
              <Button size="sm" variant="outline">
                <Users className="w-3 h-3 mr-1" />
                取引先管理
              </Button>
               <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".csv"
                />
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-3 h-3 mr-1" />
                CSVインポート
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
