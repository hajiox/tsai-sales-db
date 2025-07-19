// /components/wholesale/product-statistics.tsx ver.5 セクションヘッダー版
"use client"

import { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

interface ProductStatistics {
  product_id: string;
  product_code: string;
  product_name: string;
  price: number;
  profit_rate: number;
  months_3_quantity: number;
  months_3_amount: number;
  months_6_quantity: number;
  months_6_amount: number;
  months_12_quantity: number;
  months_12_amount: number;
  last_year_same_month_quantity: number;
  last_year_same_month_amount: number;
  current_month_quantity: number;
  current_month_amount: number;
}

interface ProductStatisticsProps {
  selectedYear: string;
  selectedMonth: string;
}

export default function ProductStatistics({ selectedYear, selectedMonth }: ProductStatisticsProps) {
  const [statistics, setStatistics] = useState<ProductStatistics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedYear || !selectedMonth) return;
    fetchStatistics();
  }, [selectedYear, selectedMonth]);

  const fetchStatistics = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/wholesale/products/statistics?year=${selectedYear}&month=${selectedMonth}`
      );
      const data = await response.json();
      
      if (data.success) {
        // 当月売上高でソート（降順）
        const sortedStats = data.statistics.sort((a: ProductStatistics, b: ProductStatistics) => {
          return b.current_month_amount - a.current_month_amount;
        });
        setStatistics(sortedStats);
      }
    } catch (error) {
      console.error('統計データ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `¥${amount.toLocaleString()}`;
  };

  const calculateProfit = (amount: number, profitRate: number) => {
    return Math.floor(amount * (profitRate / 100));
  };

  const getComparisonIcon = (current: number, previous: number) => {
    if (current > previous) return <ArrowUp className="w-3 h-3 text-green-600" />;
    if (current < previous) return <ArrowDown className="w-3 h-3 text-red-600" />;
    return <Minus className="w-3 h-3 text-gray-400" />;
  };

  const getChangePercentage = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? '+100%' : '0%';
    const change = ((current - previous) / previous) * 100;
    return `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
  };

  const renderTableHeader = () => (
    <tr className="border-b bg-gray-50">
      <th className="text-center p-3 text-sm font-medium text-gray-700 w-16">順位</th>
      <th className="text-left p-3 text-sm font-medium text-gray-700">商品名</th>
      <th className="text-center p-3 text-sm font-medium text-gray-700 whitespace-nowrap">卸価格</th>
      <th className="text-center p-3 text-sm font-medium text-gray-700 whitespace-nowrap">利益率</th>
      <th className="text-center p-3 text-sm font-medium text-gray-700">
        <div>当月</div>
        <div className="text-xs font-normal">数量 / 売上</div>
      </th>
      <th className="text-center p-3 text-sm font-medium text-gray-700">
        <div>過去3ヶ月</div>
        <div className="text-xs font-normal">数量 / 売上</div>
      </th>
      <th className="text-center p-3 text-sm font-medium text-gray-700">
        <div>過去6ヶ月</div>
        <div className="text-xs font-normal">数量 / 売上</div>
      </th>
      <th className="text-center p-3 text-sm font-medium text-gray-700">
        <div>過去12ヶ月</div>
        <div className="text-xs font-normal">数量 / 売上</div>
      </th>
      <th className="text-center p-3 text-sm font-medium text-gray-700">
        <div>前年同月比</div>
        <div className="text-xs font-normal">数量 / 売上</div>
      </th>
      <th className="text-center p-3 text-sm font-medium text-gray-700">推定利益</th>
    </tr>
  );

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="border-b p-4">
        <h3 className="text-lg font-semibold">商品販売統計（売上ランキング）</h3>
        <p className="text-sm text-gray-600 mt-1">
          {selectedYear}年{selectedMonth}月の販売実績と過去データの比較
        </p>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            {renderTableHeader()}
          </thead>
          <tbody>
            {statistics.map((stat, index) => {
              const currentProfit = calculateProfit(stat.current_month_amount, stat.profit_rate);
              const yearProfit = calculateProfit(stat.months_12_amount, stat.profit_rate);
              
              return (
                <>
                  {/* 10商品ごとにヘッダーを再表示 */}
                  {index > 0 && index % 10 === 0 && (
                    <>
                      <tr key={`spacer-${index}`}>
                        <td colSpan={10} className="p-2 bg-gray-100"></td>
                      </tr>
                      {renderTableHeader()}
                    </>
                  )}
                  
                  <tr key={stat.product_id} className="border-b hover:bg-gray-50">
                    <td className="text-center p-3">
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                        index < 3 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {index + 1}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="font-medium text-sm">{stat.product_name}</div>
                      <div className="text-xs text-gray-500">{stat.product_code}</div>
                    </td>
                    <td className="text-center p-3 text-sm">{formatCurrency(stat.price)}</td>
                    <td className="text-center p-3 text-sm">{stat.profit_rate}%</td>
                    
                    {/* 当月 */}
                    <td className="text-center p-3">
                      <div className="text-sm font-medium">{stat.current_month_quantity}</div>
                      <div className="text-xs text-gray-600">{formatCurrency(stat.current_month_amount)}</div>
                    </td>
                    
                    {/* 過去3ヶ月 */}
                    <td className="text-center p-3">
                      <div className="text-sm">{stat.months_3_quantity}</div>
                      <div className="text-xs text-gray-600">{formatCurrency(stat.months_3_amount)}</div>
                    </td>
                    
                    {/* 過去6ヶ月 */}
                    <td className="text-center p-3">
                      <div className="text-sm">{stat.months_6_quantity}</div>
                      <div className="text-xs text-gray-600">{formatCurrency(stat.months_6_amount)}</div>
                    </td>
                    
                    {/* 過去12ヶ月 */}
                    <td className="text-center p-3">
                      <div className="text-sm">{stat.months_12_quantity}</div>
                      <div className="text-xs text-gray-600">{formatCurrency(stat.months_12_amount)}</div>
                    </td>
                    
                    {/* 前年同月比 */}
                    <td className="text-center p-3">
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-sm">{stat.last_year_same_month_quantity}</span>
                        {getComparisonIcon(stat.current_month_quantity, stat.last_year_same_month_quantity)}
                      </div>
                      <div className="text-xs text-gray-600 flex items-center justify-center gap-1">
                        {formatCurrency(stat.last_year_same_month_amount)}
                        <span className={`text-xs ${
                          stat.current_month_amount > stat.last_year_same_month_amount 
                            ? 'text-green-600' 
                            : stat.current_month_amount < stat.last_year_same_month_amount 
                            ? 'text-red-600' 
                            : 'text-gray-400'
                        }`}>
                          {getChangePercentage(stat.current_month_amount, stat.last_year_same_month_amount)}
                        </span>
                      </div>
                    </td>
                    
                    {/* 推定利益 */}
                    <td className="text-center p-3">
                      <div className="text-sm font-medium text-green-600">
                        {formatCurrency(currentProfit)}
                      </div>
                      <div className="text-xs text-gray-500">
                        年間: {formatCurrency(yearProfit)}
                      </div>
                    </td>
                  </tr>
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
