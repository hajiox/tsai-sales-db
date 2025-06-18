"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type SummaryRow = {
  id: string;
  product_id: string;
  product_name: string;
  series_name: string | null;
  product_number: number;
  price: number | null;
  amazon_count: number | null;
  rakuten_count: number | null;
  yahoo_count: number | null;
  mercari_count: number | null;
  base_count: number | null;
  qoo10_count: number | null;
};

type SeriesMaster = {
  series_id: number;
  series_name: string;
};

type EditingCell = {
  rowId: string;
  field: string;
} | null;

export default function WebSalesEditableTable({ month }: { month: string }) {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesMaster[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState<string>("");
  
  // シリーズ管理用の状態
  const [showSeriesForm, setShowSeriesForm] = useState(false);
  const [newSeriesName, setNewSeriesName] = useState("");
  const [seriesLoading, setSeriesLoading] = useState(false);

  useEffect(() => {
    loadData();
    loadSeries();
  }, [month]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("web_sales_full_month", {
        target_month: month,
      });

      if (error) throw error;
      setRows((data as SummaryRow[]) ?? []);
    } catch (error) {
      console.error('データ読み込みエラー:', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSeries = async () => {
    try {
      const response = await fetch('/api/series-master');
      const result = await response.json();
      if (response.ok) {
        setSeriesList(result.data || []);
      }
    } catch (error) {
      console.error('シリーズ読み込みエラー:', error);
    }
  };

  // シリーズ追加
  const handleAddSeries = async () => {
    if (!newSeriesName.trim()) return;
    
    setSeriesLoading(true);
    try {
      const response = await fetch('/api/series-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series_name: newSeriesName.trim() })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setNewSeriesName("");
        setShowSeriesForm(false);
        loadSeries(); // リロード
        alert('シリーズが追加されました');
      } else {
        alert('エラー: ' + result.error);
      }
    } catch (error) {
      console.error('シリーズ追加エラー:', error);
      alert('シリーズ追加に失敗しました');
    } finally {
      setSeriesLoading(false);
    }
  };

  // シリーズ削除
  const handleDeleteSeries = async (seriesId: number, seriesName: string) => {
    if (!confirm(`「${seriesName}」を削除しますか？`)) return;
    
    try {
      const response = await fetch('/api/series-master', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series_id: seriesId })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        loadSeries(); // リロード
        alert('シリーズが削除されました');
      } else {
        alert('エラー: ' + result.error);
      }
    } catch (error) {
      console.error('シリーズ削除エラー:', error);
      alert('シリーズ削除に失敗しました');
    }
  };

  // セルをクリックして編集開始
  const handleCellClick = (rowId: string, field: string, currentValue: number | null) => {
    setEditingCell({ rowId, field });
    setEditValue((currentValue || 0).toString());
  };

  // 編集完了・保存
  const handleCellSave = async () => {
    if (!editingCell) return;

    const newValue = parseInt(editValue) || 0;
    
    // UIを先に更新
    setRows(prevRows => 
      prevRows.map(row => 
        row.id === editingCell.rowId
          ? { ...row, [editingCell.field]: newValue }
          : row
      )
    );

    setEditingCell(null);
    setEditValue("");

    // 保存処理（今後実装）
    console.log('保存:', { rowId: editingCell.rowId, field: editingCell.field, value: newValue });
  };

  // 編集キャンセル
  const handleCellCancel = () => {
    setEditingCell(null);
    setEditValue("");
  };

  // キーボードイベント
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCellSave();
    } else if (e.key === 'Escape') {
      handleCellCancel();
    }
  };

  // シリーズ別の背景色を取得
  const getSeriesRowColor = (seriesName: string | null) => {
    if (!seriesName) return 'bg-white';
    const seriesNum = parseInt(seriesName);
    if (isNaN(seriesNum)) return 'bg-white';
    
    // 偶数・奇数で色分け
    return seriesNum % 2 === 0 ? 'bg-gray-50' : 'bg-white';
  };

  // 編集可能セルのレンダリング
  const renderEditableCell = (row: SummaryRow, field: keyof SummaryRow, value: number | null) => {
    const isEditing = editingCell?.rowId === row.id && editingCell?.field === field;
    
    if (isEditing) {
      return (
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleCellSave}
          onKeyDown={handleKeyDown}
          className="w-full px-1 py-0.5 text-xs border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-300 text-center"
          autoFocus
        />
      );
    }

    return (
      <div
        className="w-full px-1 py-0.5 cursor-pointer hover:bg-blue-100 rounded text-xs text-center"
        onClick={() => handleCellClick(row.id, field, value)}
      >
        {value || '-'}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="mt-2 text-gray-600">データを読み込んでいます...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* シリーズ管理セクション */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <div className="flex justify-between items-center mb-3">
          <h4 className="text-base font-semibold">📚 シリーズ管理</h4>
          <button
            onClick={() => setShowSeriesForm(!showSeriesForm)}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            {showSeriesForm ? 'キャンセル' : 'シリーズ追加'}
          </button>
        </div>

        {showSeriesForm && (
          <div className="mb-3 p-3 bg-white rounded border">
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={newSeriesName}
                onChange={(e) => setNewSeriesName(e.target.value)}
                placeholder="新しいシリーズ名を入力"
                className="flex-1 px-2 py-1 border rounded text-sm"
                disabled={seriesLoading}
              />
              <button
                onClick={handleAddSeries}
                disabled={seriesLoading || !newSeriesName.trim()}
                className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:bg-gray-400"
              >
                {seriesLoading ? '追加中...' : '追加'}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-4 gap-2 text-xs">
          {seriesList.map((series) => (
            <div key={series.series_id} className="flex justify-between items-center bg-white p-2 rounded border">
              <span>{series.series_id}: {series.series_name}</span>
              <button
                onClick={() => handleDeleteSeries(series.series_id, series.series_name)}
                className="ml-2 px-1 py-0.5 bg-red-500 text-white rounded text-xs hover:bg-red-600"
              >
                削除
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 編集可能テーブル */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="p-3 border-b bg-gray-50">
          <h3 className="text-lg font-semibold">全商品一覧 ({rows.length}商品)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="px-2 py-1 text-left font-medium text-gray-700 border sticky left-0 bg-gray-100 z-10 min-w-56">商品名</th>
                <th className="px-2 py-1 text-center font-medium text-gray-700 border w-20">シリーズ</th>
                <th className="px-2 py-1 text-center font-medium text-gray-700 border w-20">商品番号</th>
                <th className="px-2 py-1 text-center font-medium text-gray-700 border w-20">単価</th>
                <th className="px-2 py-1 text-center font-medium text-gray-700 border w-20">Amazon</th>
                <th className="px-2 py-1 text-center font-medium text-gray-700 border w-16">楽天</th>
                <th className="px-2 py-1 text-center font-medium text-gray-700 border w-20">Yahoo!</th>
                <th className="px-2 py-1 text-center font-medium text-gray-700 border w-20">メルカリ</th>
                <th className="px-2 py-1 text-center font-medium text-gray-700 border w-16">BASE</th>
                <th className="px-2 py-1 text-center font-medium text-gray-700 border w-18">Qoo10</th>
                <th className="px-2 py-1 text-center font-bold text-gray-700 border w-16">合計</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const totalCount = (row.amazon_count || 0) + (row.rakuten_count || 0) + 
                                 (row.yahoo_count || 0) + (row.mercari_count || 0) + 
                                 (row.base_count || 0) + (row.qoo10_count || 0);
                
                const rowBgColor = getSeriesRowColor(row.series_name);
                
                return (
                  <tr key={row.id} className={`border-b hover:brightness-95 ${rowBgColor}`}>
                    <td className={`px-2 py-1 text-left border sticky left-0 ${rowBgColor} z-10 text-xs`}>{row.product_name}</td>
                    <td className="px-2 py-1 text-center border text-xs">{row.series_name || '-'}</td>
                    <td className="px-2 py-1 text-center border text-xs">{row.product_number}</td>
                    <td className="px-2 py-1 text-right border text-xs">¥{(row.price || 0).toLocaleString()}</td>
                    <td className="px-2 py-1 text-center border">
                      {renderEditableCell(row, 'amazon_count', row.amazon_count)}
                    </td>
                    <td className="px-2 py-1 text-center border">
                      {renderEditableCell(row, 'rakuten_count', row.rakuten_count)}
                    </td>
                    <td className="px-2 py-1 text-center border">
                      {renderEditableCell(row, 'yahoo_count', row.yahoo_count)}
                    </td>
                    <td className="px-2 py-1 text-center border">
                      {renderEditableCell(row, 'mercari_count', row.mercari_count)}
                    </td>
                    <td className="px-2 py-1 text-center border">
                      {renderEditableCell(row, 'base_count', row.base_count)}
                    </td>
                    <td className="px-2 py-1 text-center border">
                      {renderEditableCell(row, 'qoo10_count', row.qoo10_count)}
                    </td>
                    <td className="px-2 py-1 text-center font-bold border bg-blue-50 text-xs">
                      {totalCount.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
