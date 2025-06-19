// /components/web-sales-editable-table.tsx ver.3 (フッターをCSVインポートUIに変更)
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

export default function WebSalesEditableTable({ 
  month, 
  onDataSaved 
}: { 
  month: string;
  onDataSaved?: () => void;
}) {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [originalRows, setOriginalRows] = useState<SummaryRow[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesMaster[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [savingRows, setSavingRows] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState<boolean>(false);
  
  // シリーズ管理用の状態
  const [showSeriesForm, setShowSeriesForm] = useState(false);
  const [newSeriesName, setNewSeriesName] = useState("");
  const [seriesLoading, setSeriesLoading] = useState(false);

  // 商品管理用の状態
  const [showProductForm, setShowProductForm] = useState(false);
  const [newProduct, setNewProduct] = useState({
    product_name: "",
    series_id: "",
    product_number: "",
    price: ""
  });
  const [productLoading, setProductLoading] = useState(false);

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
      const salesData = (data as SummaryRow[]) ?? [];
      setRows(salesData);
      setOriginalRows(JSON.parse(JSON.stringify(salesData))); // ディープコピー
    } catch (error) {
      console.error('データ読み込みエラー:', error);
      setRows([]);
      setOriginalRows([]);
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

  // メッセージ表示
  const showSaveMessage = (message: string) => {
    setSaveMessage(message);
    setTimeout(() => setSaveMessage(""), 3000);
  };

  // 行が変更されているかチェック
  const isRowChanged = (rowId: string) => {
    const currentRow = rows.find(r => r.id === rowId);
    const originalRow = originalRows.find(r => r.id === rowId);
    if (!currentRow || !originalRow) return false;

    const salesFields = ['amazon_count', 'rakuten_count', 'yahoo_count', 'mercari_count', 'base_count', 'qoo10_count'];
    return salesFields.some(field => currentRow[field as keyof SummaryRow] !== originalRow[field as keyof SummaryRow]);
  };

  // 変更された行を取得
  const getChangedRows = () => {
    return rows.filter(row => isRowChanged(row.id));
  };

  // 単一行保存
  const saveRow = async (rowId: string) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;

    setSavingRows(prev => new Set(prev.add(rowId)));

    try {
      const salesFields = ['amazon_count', 'rakuten_count', 'yahoo_count', 'mercari_count', 'base_count', 'qoo10_count'];
      
      for (const field of salesFields) {
        const value = row[field as keyof SummaryRow] || 0;
        
        const response = await fetch('/api/web-sales-data', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id: row.product_id,
            report_month: month,
            field,
            value
          })
        });

        if (!response.ok) {
          throw new Error(`${field}の保存に失敗しました`);
        }
      }

      // 保存成功時に元データを更新
      setOriginalRows(prev => prev.map(r => r.id === rowId ? { ...row } : r));
      showSaveMessage(`「${row.product_name}」の販売数を保存しました`);
      onDataSaved?.(); // 親コンポーネントに通知
      
    } catch (error) {
      console.error('保存エラー:', error);
      showSaveMessage('保存に失敗しました');
    } finally {
      setSavingRows(prev => {
        const newSet = new Set(prev);
        newSet.delete(rowId);
        return newSet;
      });
    }
  };

  // 一括保存
  const saveAllChanges = async () => {
    const changedRows = getChangedRows();
    if (changedRows.length === 0) {
      showSaveMessage('変更がありません');
      return;
    }

    setSavingAll(true);

    try {
      for (const row of changedRows) {
        const salesFields = ['amazon_count', 'rakuten_count', 'yahoo_count', 'mercari_count', 'base_count', 'qoo10_count'];
        
        for (const field of salesFields) {
          const value = row[field as keyof SummaryRow] || 0;
          
          const response = await fetch('/api/web-sales-data', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              product_id: row.product_id,
              report_month: month,
              field,
              value
            })
          });

          if (!response.ok) {
            throw new Error(`${row.product_name}の${field}保存に失敗しました`);
          }
        }
      }

      // 保存成功時に元データを更新
      setOriginalRows(JSON.parse(JSON.stringify(rows)));
      showSaveMessage(`${changedRows.length}商品の販売数を一括保存しました`);
      onDataSaved?.(); // 親コンポーネントに通知
      
    } catch (error) {
      console.error('一括保存エラー:', error);
      showSaveMessage('一括保存に失敗しました');
    } finally {
      setSavingAll(false);
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
        loadSeries();
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

  // 商品追加
  const handleAddProduct = async () => {
    if (!newProduct.product_name.trim() || !newProduct.series_id || !newProduct.product_number || !newProduct.price) {
      alert('全ての項目を入力してください');
      return;
    }
    
    setProductLoading(true);
    try {
      const response = await fetch('/api/products-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: newProduct.product_name.trim(),
          series_id: parseInt(newProduct.series_id),
          product_number: parseInt(newProduct.product_number),
          price: parseInt(newProduct.price)
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setNewProduct({ product_name: "", series_id: "", product_number: "", price: "" });
        setShowProductForm(false);
        loadData();
        alert('商品が追加されました');
      } else {
        alert('エラー: ' + result.error);
      }
    } catch (error) {
      console.error('商品追加エラー:', error);
      alert('商品追加に失敗しました');
    } finally {
      setProductLoading(false);
    }
  };

  // 商品削除
  const handleDeleteProduct = async (productId: string, productName: string) => {
    if (!confirm(`「${productName}」を削除しますか？`)) return;
    
    try {
      const response = await fetch('/api/products-master', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId })
      });
      
      const result = await response.json();
      
      if (response.status === 409 && result.error === 'sales_exist') {
        const confirmForceDelete = confirm(
          `「${productName}」には販売実績（${result.sales_count}件）があります。\n\n販売データと一緒に削除しますか？`
        );
        
        if (confirmForceDelete) {
          const forceResponse = await fetch('/api/products-master', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: productId, force_delete: true })
          });
          
          const forceResult = await forceResponse.json();
          
          if (forceResponse.ok) {
            loadData();
            alert('商品と販売実績を削除しました');
          } else {
            alert('エラー: ' + forceResult.error);
          }
        }
      } else if (response.ok) {
        loadData();
        alert('商品が削除されました');
      } else {
        alert('エラー: ' + result.error);
      }
    } catch (error) {
      console.error('商品削除エラー:', error);
      alert('商品削除に失敗しました');
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
        loadSeries();
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
    
    setRows(prevRows => 
      prevRows.map(row => 
        row.id === editingCell.rowId
          ? { ...row, [editingCell.field]: newValue }
          : row
      )
    );

    setEditingCell(null);
    setEditValue("");
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
    const match = seriesName.match(/^(\d+)/);
    if (!match) return 'bg-white';
    const seriesNum = parseInt(match[1]);

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
          onFocus={(e) => e.target.select()}
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

  const changedRowsCount = getChangedRows().length;

  return (
    <div className="space-y-4">
      {saveMessage && (
        <div className="p-3 bg-green-100 border border-green-400 text-green-700 rounded">
          {saveMessage}
        </div>
      )}

      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">
          変更された商品: {changedRowsCount}件
        </div>
        <button
          onClick={saveAllChanges}
          disabled={savingAll || changedRowsCount === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {savingAll ? '保存中...' : `一括保存 (${changedRowsCount}件)`}
        </button>
      </div>

      <div className="rounded-lg border bg-white shadow-sm">
        <div className="p-3 border-b bg-gray-50 flex justify-between items-center">
          <h3 className="text-lg font-semibold">全商品一覧 ({rows.length}商品)</h3>
          <button
            onClick={() => setShowProductForm(!showProductForm)}
            className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
          >
            {showProductForm ? 'キャンセル' : '商品追加'}
          </button>
        </div>

        {showProductForm && (
          <div className="p-3 bg-yellow-50 border-b">
            {/* 商品追加フォーム */}
          </div>
        )}

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
                <th className="px-2 py-1 text-center font-bold text-gray-700 border w-20">保存</th>
                <th className="px-2 py-1 text-center font-bold text-gray-700 border w-16">削除</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const totalCount = (row.amazon_count || 0) + (row.rakuten_count || 0) + 
                                 (row.yahoo_count || 0) + (row.mercari_count || 0) + 
                                 (row.base_count || 0) + (row.qoo10_count || 0);
                
                const rowBgColor = getSeriesRowColor(row.series_name);
                const isChanged = isRowChanged(row.id);
                const isSaving = savingRows.has(row.id);
                
                return (
                  <tr key={row.id} className={`border-b hover:brightness-95 ${rowBgColor} ${isChanged ? 'bg-yellow-50' : ''}`}>
                    <td className={`px-2 py-1 text-left border sticky left-0 ${isChanged ? 'bg-yellow-50' : rowBgColor} z-10 text-xs`}>{row.product_name}</td>
                    <td className="px-2 py-1 text-center border text-xs">{row.series_name || '-'}</td>
                    <td className="px-2 py-1 text-center border text-xs">{row.product_number}</td>
                    <td className="px-2 py-1 text-right border text-xs">¥{(row.price || 0).toLocaleString()}</td>
                    <td className="px-2 py-1 text-center border">{renderEditableCell(row, 'amazon_count', row.amazon_count)}</td>
                    <td className="px-2 py-1 text-center border">{renderEditableCell(row, 'rakuten_count', row.rakuten_count)}</td>
                    <td className="px-2 py-1 text-center border">{renderEditableCell(row, 'yahoo_count', row.yahoo_count)}</td>
                    <td className="px-2 py-1 text-center border">{renderEditableCell(row, 'mercari_count', row.mercari_count)}</td>
                    <td className="px-2 py-1 text-center border">{renderEditableCell(row, 'base_count', row.base_count)}</td>
                    <td className="px-2 py-1 text-center border">{renderEditableCell(row, 'qoo10_count', row.qoo10_count)}</td>
                    <td className="px-2 py-1 text-center font-bold border bg-blue-50 text-xs">{totalCount.toLocaleString()}</td>
                    <td className="px-2 py-1 text-center border">
                      <button onClick={() => saveRow(row.id)} disabled={isSaving || !isChanged} className="px-2 py-0.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
                        {isSaving ? '保存中' : '保存'}
                      </button>
                    </td>
                    <td className="px-2 py-1 text-center border">
                      <button onClick={() => handleDeleteProduct(row.id, row.product_name)} className="px-1 py-0.5 bg-red-500 text-white rounded text-xs hover:bg-red-600" title="商品を削除">
                        削除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2">
              <tr>
                <td colSpan={13} className="p-3">
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-sm font-semibold text-gray-600">データ取り込み:</span>
                    <button className="px-3 py-1 text-xs font-semibold text-white bg-gray-700 rounded hover:bg-gray-800" disabled>CSV</button>
                    <button className="px-3 py-1 text-xs font-semibold text-white bg-orange-500 rounded hover:bg-orange-600" disabled>Amazon</button>
                    <button className="px-3 py-1 text-xs font-semibold text-white bg-red-600 rounded hover:bg-red-700" disabled>楽天</button>
                    <button className="px-3 py-1 text-xs font-semibold text-white bg-blue-500 rounded hover:bg-blue-600" disabled>Yahoo</button>
                    <button className="px-3 py-1 text-xs font-semibold text-white bg-sky-500 rounded hover:bg-sky-600" disabled>メルカリ</button>
                    <button className="px-3 py-1 text-xs font-semibold text-white bg-pink-500 rounded hover:bg-pink-600" disabled>Qoo10</button>
                    <button className="px-3 py-1 text-xs font-semibold text-white bg-green-600 rounded hover:bg-green-700" disabled>BASE</button>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={saveAllChanges}
          disabled={savingAll || changedRowsCount === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {savingAll ? '保存中...' : `一括保存 (${changedRowsCount}件)`}
        </button>
      </div>

      <div className="bg-blue-50 p-4 rounded-lg">
        {/* シリーズ管理セクション */}
      </div>
    </div>
  );
}
