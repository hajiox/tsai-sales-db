// /components/web-sales-editable-table.tsx ver.12 (最終確定版)
"use client";

import { useEffect, useState, useRef } from "react";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const [showSeriesForm, setShowSeriesForm] = useState(false);
  const [newSeriesName, setNewSeriesName] = useState("");
  const [seriesLoading, setSeriesLoading] = useState(false);

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
      setOriginalRows(JSON.parse(JSON.stringify(salesData)));
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

  const handleCsvButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/import/csv', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      if (response.ok) {
        alert(
          `成功: ${result.message}\n\n` +
          `CSVの商品名:「${result.csvProductName}」\n` +
          `  ↓\n` +
          `マッチした商品:「${result.matchedProductName}」`
        );
      } else {
        throw new Error(result.error || '不明なエラーが発生しました');
      }
    } catch (error) {
      console.error('アップロードエラー:', error);
      alert(`エラー: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsUploading(false);
      if(fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const showSaveMessage = (message: string) => {
    setSaveMessage(message);
    setTimeout(() => setSaveMessage(""), 3000);
  };

  const isRowChanged = (rowId: string) => {
    const currentRow = rows.find(r => r.id === rowId);
    const originalRow = originalRows.find(r => r.id === rowId);
    if (!currentRow || !originalRow) return false;

    const salesFields = ['amazon_count', 'rakuten_count', 'yahoo_count', 'mercari_count', 'base_count', 'qoo10_count'];
    return salesFields.some(field => 
      currentRow[field as keyof SummaryRow] !== originalRow[field as keyof SummaryRow]
    );
  };

  const handleEdit = (rowId: string, field: string) => {
    const row = rows.find(r => r.id === rowId);
    if (row) {
      setEditingCell({ rowId, field });
      setEditValue(String(row[field as keyof SummaryRow] || ""));
    }
  };

  const handleSave = () => {
    if (!editingCell) return;

    const newRows = rows.map(row => {
      if (row.id === editingCell.rowId) {
        return {
          ...row,
          [editingCell.field]: editValue === "" ? null : Number(editValue)
        };
      }
      return row;
    });

    setRows(newRows);
    setEditingCell(null);
  };

  const handleCancel = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const saveRow = async (rowId: string) => {
    const row = rows.find(r => r.id === rowId);
    if (!row || !isRowChanged(rowId)) return;

    setSavingRows(prev => new Set(prev).add(rowId));
    try {
      const salesData = {
        product_id: row.product_id,
        month: month,
        amazon_count: row.amazon_count,
        rakuten_count: row.rakuten_count,
        yahoo_count: row.yahoo_count,
        mercari_count: row.mercari_count,
        base_count: row.base_count,
        qoo10_count: row.qoo10_count
      };

      const response = await fetch('/api/sales-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(salesData),
      });

      if (!response.ok) throw new Error('保存に失敗しました');

      const updatedOriginalRows = originalRows.map(origRow => 
        origRow.id === rowId ? { ...row } : origRow
      );
      setOriginalRows(updatedOriginalRows);

      showSaveMessage(`${row.product_name} を保存しました`);
      onDataSaved?.();
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

  const saveAll = async () => {
    const changedRows = rows.filter(row => isRowChanged(row.id));
    if (changedRows.length === 0) {
      showSaveMessage('変更はありません');
      return;
    }

    setSavingAll(true);
    try {
      const promises = changedRows.map(row => saveRow(row.id));
      await Promise.all(promises);
      showSaveMessage(`${changedRows.length}件の変更を保存しました`);
    } catch (error) {
      console.error('一括保存エラー:', error);
      showSaveMessage('一部の保存に失敗しました');
    } finally {
      setSavingAll(false);
    }
  };

  const handleAddSeries = async () => {
    if (!newSeriesName.trim()) return;

    setSeriesLoading(true);
    try {
      const response = await fetch('/api/series-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series_name: newSeriesName.trim() }),
      });

      if (!response.ok) throw new Error('シリーズの追加に失敗しました');

      await loadSeries();
      setNewSeriesName("");
      setShowSeriesForm(false);
      showSaveMessage('シリーズを追加しました');
    } catch (error) {
      console.error('シリーズ追加エラー:', error);
      alert('シリーズの追加に失敗しました');
    } finally {
      setSeriesLoading(false);
    }
  };

  const handleAddProduct = async () => {
    if (!newProduct.product_name || !newProduct.series_id || !newProduct.product_number) {
      alert('必須項目を入力してください');
      return;
    }

    setProductLoading(true);
    try {
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_name: newProduct.product_name.trim(),
          series_id: Number(newProduct.series_id),
          product_number: Number(newProduct.product_number),
          price: newProduct.price ? Number(newProduct.price) : null
        }),
      });

      if (!response.ok) throw new Error('商品の追加に失敗しました');

      await loadData();
      setNewProduct({ product_name: "", series_id: "", product_number: "", price: "" });
      setShowProductForm(false);
      showSaveMessage('商品を追加しました');
    } catch (error) {
      console.error('商品追加エラー:', error);
      alert('商品の追加に失敗しました');
    } finally {
      setProductLoading(false);
    }
  };

  const formatNumber = (num: number | null) => {
    if (num === null || num === 0) return "-";
    return num.toLocaleString();
  };

  const calculateRowTotal = (row: SummaryRow) => {
    return (row.amazon_count || 0) + (row.rakuten_count || 0) + 
           (row.yahoo_count || 0) + (row.mercari_count || 0) + 
           (row.base_count || 0) + (row.qoo10_count || 0);
  };

  const calculateColumnTotal = (field: keyof SummaryRow) => {
    return rows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
  };

  const calculateGrandTotal = () => {
    return rows.reduce((sum, row) => sum + calculateRowTotal(row), 0);
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">読み込み中...</div>;
  }

  return (
    <div className="w-full">
      <div className="mb-4 flex justify-between items-center">
        <div className="flex gap-2">
          <button
            onClick={() => setShowSeriesForm(!showSeriesForm)}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            シリーズ追加
          </button>
          <button
            onClick={() => setShowProductForm(!showProductForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            商品追加
          </button>
          <button
            onClick={handleCsvButtonClick}
            disabled={isUploading}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400"
          >
            {isUploading ? 'アップロード中...' : 'CSV取込'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
        <button
          onClick={saveAll}
          disabled={savingAll || rows.filter(row => isRowChanged(row.id)).length === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {savingAll ? '保存中...' : 'すべて保存'}
        </button>
      </div>

      {showSeriesForm && (
        <div className="mb-4 p-4 border rounded bg-gray-50">
          <h3 className="font-bold mb-2">新しいシリーズを追加</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={newSeriesName}
              onChange={(e) => setNewSeriesName(e.target.value)}
              placeholder="シリーズ名"
              className="flex-1 px-3 py-2 border rounded"
            />
            <button
              onClick={handleAddSeries}
              disabled={seriesLoading}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
            >
              {seriesLoading ? '追加中...' : '追加'}
            </button>
            <button
              onClick={() => {
                setShowSeriesForm(false);
                setNewSeriesName("");
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {showProductForm && (
        <div className="mb-4 p-4 border rounded bg-gray-50">
          <h3 className="font-bold mb-2">新しい商品を追加</h3>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input
              type="text"
              value={newProduct.product_name}
              onChange={(e) => setNewProduct({...newProduct, product_name: e.target.value})}
              placeholder="商品名 *"
              className="px-3 py-2 border rounded"
            />
            <select
              value={newProduct.series_id}
              onChange={(e) => setNewProduct({...newProduct, series_id: e.target.value})}
              className="px-3 py-2 border rounded"
            >
              <option value="">シリーズを選択 *</option>
              {seriesList.map(series => (
                <option key={series.series_id} value={series.series_id}>
                  {series.series_name}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={newProduct.product_number}
              onChange={(e) => setNewProduct({...newProduct, product_number: e.target.value})}
              placeholder="商品番号 *"
              className="px-3 py-2 border rounded"
            />
            <input
              type="number"
              value={newProduct.price}
              onChange={(e) => setNewProduct({...newProduct, price: e.target.value})}
              placeholder="価格"
              className="px-3 py-2 border rounded"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddProduct}
              disabled={productLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              {productLoading ? '追加中...' : '追加'}
            </button>
            <button
              onClick={() => {
                setShowProductForm(false);
                setNewProduct({ product_name: "", series_id: "", product_number: "", price: "" });
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {saveMessage && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 rounded">
          {saveMessage}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-4 py-2 text-left">シリーズ</th>
              <th className="border px-4 py-2 text-left">商品名</th>
              <th className="border px-4 py-2 text-center">番号</th>
              <th className="border px-4 py-2 text-right">価格</th>
              <th className="border px-4 py-2 text-center">Amazon</th>
              <th className="border px-4 py-2 text-center">楽天</th>
              <th className="border px-4 py-2 text-center">Yahoo</th>
              <th className="border px-4 py-2 text-center">メルカリ</th>
              <th className="border px-4 py-2 text-center">BASE</th>
              <th className="border px-4 py-2 text-center">Qoo10</th>
              <th className="border px-4 py-2 text-center">合計</th>
              <th className="border px-4 py-2 text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={isRowChanged(row.id) ? "bg-yellow-50" : ""}>
                <td className="border px-4 py-2">{row.series_name || "-"}</td>
                <td className="border px-4 py-2">{row.product_name}</td>
                <td className="border px-4 py-2 text-center">{row.product_number}</td>
                <td className="border px-4 py-2 text-right">
                  {row.price ? `¥${row.price.toLocaleString()}` : "-"}
                </td>
                {['amazon_count', 'rakuten_count', 'yahoo_count', 'mercari_count', 'base_count', 'qoo10_count'].map(field => (
                  <td key={field} className="border px-4 py-2 text-center">
                    {editingCell?.rowId === row.id && editingCell?.field === field ? (
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={handleSave}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSave();
                          if (e.key === 'Escape') handleCancel();
                        }}
                        className="w-20 px-2 py-1 border rounded text-center"
                        autoFocus
                      />
                    ) : (
                      <span
                        onClick={() => handleEdit(row.id, field)}
                        className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded inline-block min-w-[3rem]"
                      >
                        {formatNumber(row[field as keyof SummaryRow] as number | null)}
                      </span>
                    )}
                  </td>
                ))}
                <td className="border px-4 py-2 text-center font-semibold">
                  {formatNumber(calculateRowTotal(row))}
                </td>
                <td className="border px-4 py-2 text-center">
                  <button
                    onClick={() => saveRow(row.id)}
                    disabled={!isRowChanged(row.id) || savingRows.has(row.id)}
                    className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:bg-gray-400"
                  >
                    {savingRows.has(row.id) ? '保存中...' : '保存'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-200 font-bold">
              <td colSpan={4} className="border px-4 py-2 text-right">合計</td>
              <td className="border px-4 py-2 text-center">
                {formatNumber(calculateColumnTotal('amazon_count'))}
              </td>
              <td className="border px-4 py-2 text-center">
                {formatNumber(calculateColumnTotal('rakuten_count'))}
              </td>
              <td className="border px-4 py-2 text-center">
                {formatNumber(calculateColumnTotal('yahoo_count'))}
              </td>
              <td className="border px-4 py-2 text-center">
                {formatNumber(calculateColumnTotal('mercari_count'))}
              </td>
              <td className="border px-4 py-2 text-center">
                {formatNumber(calculateColumnTotal('base_count'))}
              </td>
              <td className="border px-4 py-2 text-center">
                {formatNumber(calculateColumnTotal('qoo10_count'))}
              </td>
              <td className="border px-4 py-2 text-center">
                {formatNumber(calculateGrandTotal())}
              </td>
              <td className="border px-4 py-2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
