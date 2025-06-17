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

type EditingCell = {
  rowId: string;
  field: string;
} | null;

export default function WebSalesEdit({ month }: { month: string }) {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadData = async (ym: string) => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc("web_sales_full_month", {
          target_month: ym,
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

    loadData(month);
  }, [month]);

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

  // 合計計算
  const totals = rows.reduce((acc, row) => {
    acc.amazon += row.amazon_count || 0;
    acc.rakuten += row.rakuten_count || 0;
    acc.yahoo += row.yahoo_count || 0;
    acc.mercari += row.mercari_count || 0;
    acc.base += row.base_count || 0;
    acc.qoo10 += row.qoo10_count || 0;
    
    const totalCount = (row.amazon_count || 0) + (row.rakuten_count || 0) + 
                      (row.yahoo_count || 0) + (row.mercari_count || 0) + 
                      (row.base_count || 0) + (row.qoo10_count || 0);
    acc.totalCount += totalCount;
    
    return acc;
  }, {
    amazon: 0, rakuten: 0, yahoo: 0, mercari: 0, 
    base: 0, qoo10: 0, totalCount: 0
  });

  // 編集可能セルのレンダリング
  const renderEditableCell = (row: SummaryRow, field: keyof SummaryRow, value: number | null) => {
    const isEditing = editingCell?.rowId === row.id && editingCell?.field === field;
    
    if (isEditing) {
      return (
        <input
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleCellSave}
          onKeyDown={handleKeyDown}
          className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
          autoFocus
        />
      );
    }

    return (
      <div
        className="w-full px-2 py-1 cursor-pointer hover:bg-blue-50 rounded"
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
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="bg-green-50 p-4 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">📝 {month}月 商品別販売実績（編集可能）</h3>
        <p className="text-sm text-gray-600">
          💡 数量セルをクリックして直接編集できます。Enterで保存、Escapeでキャンセルします。
          {saving && <span className="text-blue-600 font-bold ml-2">保存中...</span>}
        </p>
        <div className="grid grid-cols-4 gap-4 text-sm mt-3">
          <div>Amazon: <span className="font-bold">{totals.amazon.toLocaleString()}</span>個</div>
          <div>楽天: <span className="font-bold">{totals.rakuten.toLocaleString()}</span>個</div>
          <div>Yahoo!: <span className="font-bold">{totals.yahoo.toLocaleString()}</span>個</div>
          <div>メルカリ: <span className="font-bold">{totals.mercari.toLocaleString()}</span>個</div>
          <div>BASE: <span className="font-bold">{totals.base.toLocaleString()}</span>個</div>
          <div>Qoo10: <span className="font-bold">{totals.qoo10.toLocaleString()}</span>個</div>
          <div className="font-bold text-lg col-span-2">総販売数: <span className="text-green-600">{totals.totalCount.toLocaleString()}</span>個</div>
        </div>
      </div>

      {/* 編集可能テーブル */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="p-4 border-b bg-gray-50">
          <h3 className="text-xl font-semibold">全商品一覧 ({rows.length}商品)</h3>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-center font-medium text-gray-700 border sticky left-0 bg-gray-100 z-10">No.</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700 border">商品名</th>
                <th className="px-3 py-2 text-center font-medium text-gray-700 border">シリーズ</th>
                <th className="px-3 py-2 text-center font-medium text-gray-700 border">商品番号</th>
                <th className="px-3 py-2 text-center font-medium text-gray-700 border">単価</th>
                <th className="px-3 py-2 text-center font-medium text-gray-700 border">Amazon</th>
                <th className="px-3 py-2 text-center font-medium text-gray-700 border">楽天</th>
                <th className="px-3 py-2 text-center font-medium text-gray-700 border">Yahoo!</th>
                <th className="px-3 py-2 text-center font-medium text-gray-700 border">メルカリ</th>
                <th className="px-3 py-2 text-center font-medium text-gray-700 border">BASE</th>
                <th className="px-3 py-2 text-center font-medium text-gray-700 border">Qoo10</th>
                <th className="px-3 py-2 text-center font-bold text-gray-700 border">合計</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const totalCount = (row.amazon_count || 0) + (row.rakuten_count || 0) + 
                                 (row.yahoo_count || 0) + (row.mercari_count || 0) + 
                                 (row.base_count || 0) + (row.qoo10_count || 0);
                
                return (
                  <tr key={row.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 text-center border sticky left-0 bg-white">{index + 1}</td>
                    <td className="px-3 py-2 text-left border max-w-xs truncate">{row.product_name}</td>
                    <td className="px-3 py-2 text-center border">{row.series_name || '-'}</td>
                    <td className="px-3 py-2 text-center border">{row.product_number}</td>
                    <td className="px-3 py-2 text-right border">¥{(row.price || 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-center border">
                      {renderEditableCell(row, 'amazon_count', row.amazon_count)}
                    </td>
                    <td className="px-3 py-2 text-center border">
                      {renderEditableCell(row, 'rakuten_count', row.rakuten_count)}
                    </td>
                    <td className="px-3 py-2 text-center border">
                      {renderEditableCell(row, 'yahoo_count', row.yahoo_count)}
                    </td>
                    <td className="px-3 py-2 text-center border">
                      {renderEditableCell(row, 'mercari_count', row.mercari_count)}
                    </td>
                    <td className="px-3 py-2 text-center border">
                      {renderEditableCell(row, 'base_count', row.base_count)}
                    </td>
                    <td className="px-3 py-2 text-center border">
                      {renderEditableCell(row, 'qoo10_count', row.qoo10_count)}
                    </td>
                    <td className="px-3 py-2 text-center font-bold border bg-blue-50">
                      {totalCount.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
              
              {/* 合計行 */}
              <tr className="bg-green-100 font-bold border-t-2">
                <td className="px-3 py-3 text-center border sticky left-0 bg-green-100" colSpan={5}>合計</td>
                <td className="px-3 py-3 text-center border">{totals.amazon.toLocaleString()}</td>
                <td className="px-3 py-3 text-center border">{totals.rakuten.toLocaleString()}</td>
                <td className="px-3 py-3 text-center border">{totals.yahoo.toLocaleString()}</td>
                <td className="px-3 py-3 text-center border">{totals.mercari.toLocaleString()}</td>
                <td className="px-3 py-3 text-center border">{totals.base.toLocaleString()}</td>
                <td className="px-3 py-3 text-center border">{totals.qoo10.toLocaleString()}</td>
                <td className="px-3 py-3 text-center border text-green-600">{totals.totalCount.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
