// /components/web-sales-editable-table.tsx ver.16
"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import SeriesManager from './SeriesManager';
import ProductAddForm from './ProductAddForm';
import SalesDataTable from './SalesDataTable'; // [ADD] SalesDataTableをインポート

// --- 型定義 ---
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

type NewProductState = {
  product_name: string;
  series_id: string;
  product_number: string;
  price: string;
};

type EditingCell = {
  rowId: string;
  field: string;
} | null;
// --- 型定義ここまで ---

export default function WebSalesEditableTable({ 
  month, 
  onDataSaved 
}: { 
  month: string;
  onDataSaved?: () => void;
}) {
  // --- State Hooks ---
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
  const [newProduct, setNewProduct] = useState<NewProductState>({
    product_name: "",
    series_id: "",
    product_number: "",
    price: ""
  });
  const [productLoading, setProductLoading] = useState(false);

  // --- Data Loading ---
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

  // --- CSV Import ---
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

  // --- Save Logic ---
  const showSaveMessage = (message: string) => {
    setSaveMessage(message);
    setTimeout(() => setSaveMessage(""), 3000);
  };

  const isRowChanged = (rowId: string) => {
    const currentRow = rows.find(r => r.id === rowId);
    const originalRow = originalRows.find(r => r.id === rowId);
    if (!currentRow || !originalRow) return false;

    const salesFields = ['amazon_count', 'rakuten_count', 'yahoo_count', 'mercari_count', 'base_count', 'qoo10_count'];
    return salesFields.some(field => currentRow[field as keyof SummaryRow] !== originalRow[field as keyof SummaryRow]);
  };

  const getChangedRows = () => {
    return rows.filter(row => isRowChanged(row.id));
  };

  const saveRow = async (rowId: string) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return;

    setSavingRows(prev => new Set(prev.add(rowId)));
    try {
      const salesFields = ['amazon_count', 'rakuten_count', 'yahoo_count', 'mercari_count', 'base_count', 'qoo10_count'];
      for (const field of salesFields) {
        const value = row[field as keyof SummaryRow] || 0;
        await fetch('/api/web-sales-data', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: row.product_id, report_month: month, field, value })
        });
      }
      setOriginalRows(prev => prev.map(r => r.id === rowId ? { ...row } : r));
      showSaveMessage(`「${row.product_name}」の販売数を保存しました`);
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

  const saveAllChanges = async () => {
    const changedRows = getChangedRows();
    if (changedRows.length === 0) {
      showSaveMessage('変更がありません');
      return;
    }
    setSavingAll(true);
    try {
      for (const row of changedRows) {
        await saveRow(row.id);
      }
      setOriginalRows(JSON.parse(JSON.stringify(rows)));
      showSaveMessage(`${changedRows.length}商品の販売数を一括保存しました`);
      onDataSaved?.();
    } catch (error) {
      console.error('一括保存エラー:', error);
      showSaveMessage('一括保存に失敗しました');
    } finally {
      setSavingAll(false);
    }
  };

  // --- Master Data Handlers (Products & Series) ---
  const handleAddSeries = async () => {
    if (!newSeriesName.trim()) return;
    setSeriesLoading(true);
    try {
      const response = await fetch('/api/series-master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series_name: newSeriesName.trim() })
      });
      if (response.ok) {
        setNewSeriesName("");
        setShowSeriesForm(false);
        loadSeries();
        alert('シリーズが追加されました');
      } else {
        const result = await response.json();
        alert('エラー: ' + result.error);
      }
    } catch (error) {
      console.error('シリーズ追加エラー:', error);
    } finally {
      setSeriesLoading(false);
    }
  };

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
      if (response.ok) {
        setNewProduct({ product_name: "", series_id: "", product_number: "", price: "" });
        setShowProductForm(false);
        loadData();
        alert('商品が追加されました');
      } else {
        const result = await response.json();
        alert('エラー: ' + result.error);
      }
    } catch (error) {
      console.error('商品追加エラー:', error);
    } finally {
      setProductLoading(false);
    }
  };

  const handleDeleteProduct = async (productId: string, productName: string) => {
    if (!confirm(`「${productName}」を削除しますか？`)) return;
    try {
      const response = await fetch('/api/products-master', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId })
      });
      if (response.ok) {
        loadData();
        alert('商品が削除されました');
      } else if (response.status === 409) {
        // Handle force delete if needed
      } else {
        const result = await response.json();
        alert('エラー: ' + result.error);
      }
    } catch (error) {
      console.error('商品削除エラー:', error);
    }
  };

  const handleDeleteSeries = async (seriesId: number, seriesName: string) => {
    if (!confirm(`「${seriesName}」を削除しますか？`)) return;
    try {
      const response = await fetch('/api/series-master', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series_id: seriesId })
      });
      if (response.ok) {
        loadSeries();
        loadData();
        alert('シリーズが削除されました');
      } else {
        const result = await response.json();
        alert('エラー: ' + result.error);
      }
    } catch (error) {
      console.error('シリーズ削除エラー:', error);
    }
  };

  // --- Inline Cell Editing Handlers ---
  const handleCellClick = (rowId: string, field: string, currentValue: number | null) => {
    setEditingCell({ rowId, field });
    setEditValue((currentValue || 0).toString());
  };

  const handleCellSave = () => {
    if (!editingCell) return;
    const newValue = parseInt(editValue) || 0;
    setRows(prevRows =>
      prevRows.map(row =>
        row.id === editingCell.rowId ? { ...row, [editingCell.field]: newValue } : row
      )
    );
    setEditingCell(null);
    setEditValue("");
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setEditValue("");
  };

  // --- Render Logic ---
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="ml-2 text-gray-600">データを読み込んでいます...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input type="file" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} accept=".csv" disabled={isUploading} />
      {saveMessage && (<div className="p-3 bg-green-100 border border-green-400 text-green-700 rounded">{saveMessage}</div>)}
      
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">変更された商品: {getChangedRows().length}件</div>
        <button onClick={saveAllChanges} disabled={savingAll || getChangedRows().length === 0} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
          {savingAll ? '保存中...' : `一括保存 (${getChangedRows().length}件)`}
        </button>
      </div>
      
      <ProductAddForm
        show={showProductForm}
        newProduct={newProduct}
        seriesList={seriesList}
        productLoading={productLoading}
        onNewProductChange={(update) => setNewProduct(prev => ({...prev, ...update}))}
        onAddProduct={handleAddProduct}
        onCancel={() => setShowProductForm(false)}
      />
      
      {/* [MODIFIED] テーブルをSalesDataTableコンポーネントに置き換え */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="p-3 border-b bg-gray-50 flex justify-between items-center">
          <h3 className="text-lg font-semibold">全商品一覧 ({rows.length}商品)</h3>
          <button onClick={() => setShowProductForm(!showProductForm)} className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">
            {showProductForm ? 'フォームを閉じる' : '商品追加'}
          </button>
        </div>
        <SalesDataTable
            rows={rows}
            editingCell={editingCell}
            editValue={editValue}
            savingRows={savingRows}
            isRowChanged={isRowChanged}
            onSaveRow={saveRow}
            onDeleteProduct={handleDeleteProduct}
            onCellClick={handleCellClick}
            onEditValueChange={setEditValue}
            onCellSave={handleCellSave}
            onCellCancel={handleCellCancel}
        />
        <div className="p-3 border-t">
            <div className="flex items-center justify-center gap-3">
                <span className="text-sm font-semibold text-gray-600">データ取り込み:</span>
                <button onClick={handleCsvButtonClick} className="px-3 py-1 text-xs font-semibold text-white bg-gray-700 rounded hover:bg-gray-800 disabled:bg-gray-400" disabled={isUploading}>{isUploading ? '処理中...' : 'CSV'}</button>
                <button className="px-3 py-1 text-xs font-semibold text-white bg-orange-500 rounded hover:bg-orange-600" disabled>Amazon</button>
            </div>
        </div>
      </div>
      
      <SeriesManager
        seriesList={seriesList}
        showSeriesForm={showSeriesForm}
        newSeriesName={newSeriesName}
        seriesLoading={seriesLoading}
        onShowFormToggle={() => setShowSeriesForm(!showSeriesForm)}
        onNewSeriesNameChange={setNewSeriesName}
        onAddSeries={handleAddSeries}
        onDeleteSeries={handleDeleteSeries}
      />
    </div>
  );
}
