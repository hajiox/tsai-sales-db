// /components/websales-charts.tsx ver.2 (色変更対応)
"use client"

import { useEffect, useState } from 'react';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  LineElement,
  PointElement,
  Title, 
  Tooltip, 
  Legend,
  ChartOptions
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

// ChartJSの登録
ChartJS.register(
  CategoryScale, 
  LinearScale, 
  BarElement, 
  LineElement,
  PointElement,
  Title, 
  Tooltip, 
  Legend
);

interface WebSalesChartsProps {
  month: string;
  refreshTrigger?: number;
  periodMonths?: number; // 追加: 表示する月数
}

export default function WebSalesCharts({ 
  month, 
  refreshTrigger = 0,
  periodMonths = 6 // デフォルトは6ヶ月
}: WebSalesChartsProps) {
  const [chartData, setChartData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchChartData = async () => {
      setIsLoading(true);
      try {
        // URLに月数パラメータを追加
        const response = await fetch(`/api/web-sales-chart-data?month=${month}&months=${periodMonths}`);
        const data = await response.json();
        setChartData(data);
      } catch (error) {
        console.error('チャートデータ取得エラー:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchChartData();
  }, [month, refreshTrigger, periodMonths]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-4 border rounded-lg shadow bg-white">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
        <div className="p-4 border rounded-lg shadow bg-white">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  const totalSalesOptions: ChartOptions<'bar'> = {
    responsive: true,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            return `総販売数: ${context.parsed.y.toLocaleString()}個`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
      }
    }
  };

  const totalSalesData = {
    labels: chartData.map(item => item.month),
    datasets: [
      {
        label: '総販売数',
        data: chartData.map(item => item.total),
        backgroundColor: 'rgba(54, 162, 235, 0.8)',
      }
    ]
  };

  const channelSalesOptions: ChartOptions<'line'> = {
    responsive: true,
    plugins: {
      tooltip: {
        callbacks: {
          label: function(context) {
            const label = context.dataset.label || '';
            return `${label}: ${context.parsed.y.toLocaleString()}個`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
      }
    }
  };

  const channelSalesData = {
    labels: chartData.map(item => item.month),
    datasets: [
      {
        label: 'Amazon',
        data: chartData.map(item => item.amazon),
        borderColor: 'rgba(16, 185, 129, 1)', // 緑
        backgroundColor: 'rgba(16, 185, 129, 0.5)',
        tension: 0.3,
      },
      {
        label: '楽天',
        data: chartData.map(item => item.rakuten),
        borderColor: 'rgba(239, 68, 68, 1)', // 赤
        backgroundColor: 'rgba(239, 68, 68, 0.5)',
        tension: 0.3,
      },
      {
        label: 'Yahoo!',
        data: chartData.map(item => item.yahoo),
        borderColor: 'rgba(249, 115, 22, 1)', // オレンジ
        backgroundColor: 'rgba(249, 115, 22, 0.5)',
        tension: 0.3,
      },
      {
        label: 'メルカリ',
        data: chartData.map(item => item.mercari),
        borderColor: 'rgba(234, 179, 8, 1)', // 黄色
        backgroundColor: 'rgba(234, 179, 8, 0.5)',
        tension: 0.3,
      },
      {
        label: 'BASE',
        data: chartData.map(item => item.base),
        borderColor: 'rgba(59, 130, 246, 1)', // 青
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        tension: 0.3,
      },
      {
        label: 'Qoo10',
        data: chartData.map(item => item.qoo10),
        borderColor: 'rgba(236, 72, 153, 1)', // ピンク
        backgroundColor: 'rgba(236, 72, 153, 0.5)',
        tension: 0.3,
      }
    ]
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="p-4 border rounded-lg shadow bg-white">
        <h2 className="text-lg font-semibold mb-4">📊 総売上推移 (過去{periodMonths}ヶ月)</h2>
        <Bar options={totalSalesOptions} data={totalSalesData} />
      </div>
      <div className="p-4 border rounded-lg shadow bg-white">
        <h2 className="text-lg font-semibold mb-4">📈 ECサイト別売上 (過去{periodMonths}ヶ月)</h2>
        <Line options={channelSalesOptions} data={channelSalesData} />
      </div>
    </div>
  );
}
