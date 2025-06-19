// /components/web-sales-editable-table.tsx ver.8 (テーブル描画ロジック修正)
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
    } finally {
      setLoading(false);
    }
  };

  const loadSeries = async () => {
    try {
      const response = await fetch('/api/series-master');
      const result = await response.json();
      if (response.ok) setSeriesList(result.data || []);
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
      if(fileInputRef.current) fileInputRef.current.value = "";
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
    return salesFields.some(field => currentRow[field as keyof SummaryRow] !== originalRow[field as keyof SummaryRow]);
  };
  const getChangedRows = () => rows.filter(row => isRowChanged(row.id));
  const saveRow = async (rowId: string) => { /* (省略) */ };
  const saveAllChanges = async () => { /* (省略) */ };
  const handleAddSeries = async () => { /* (省略) */ };
  const handleAddProduct = async () => { /* (省略) */ };
  const handleDeleteProduct = async (productId: string, productName: string) => { /* (省略) */ };
  const handleDeleteSeries = async (seriesId: number, seriesName: string) => { /* (省略) */ };
  const handleCellClick = (rowId: string, field: string, currentValue: number | null) => {
    setEditingCell({ rowId, field });
    setEditValue((currentValue || 0).toString());
  };
  const handleCellSave = async () => {
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
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCellSave();
    else if (e.key === 'Escape') handleCellCancel();
  };
  const getSeriesRowColor = (seriesName: string | null) => {
    if (!seriesName) return 'bg-white';
    const match = seriesName.match(/^(\d+)/);
    if (!match) return 'bg-white';
    const seriesNum = parseInt(match[1]);
    return seriesNum % 2 === 0 ? 'bg-gray-50' : 'bg-white';
  };
  const renderEditableCell = (row: SummaryRow, field: keyof SummaryRow, value: number | null) => {
    const isEditing = editingCell?.rowId === row.id && editingCell?.field === field;
    if (isEditing) {
      return (
        <input
          type="text" inputMode="numeric" pattern="[0-9]*" value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleCellSave} onKeyDown={handleKeyDown}
          onFocus={(e) => e.target.select()}
          className="w-full px-1 py-0.5 text-xs border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-300 text-center"
          autoFocus
        />
      );
    }
    return (
      <div className="w-full px-1 py-0.5 cursor-pointer hover:bg-blue-100 rounded text-xs text-center" onClick={() => handleCellClick(row.id, field, value)}>
        {value || '-'}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-gray-600">データを読み込んでいます...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input type="file" ref={fileInputRef} onChange={handleFileSelect} style={{ display: 'none' }} accept=".csv" disabled={isUploading}/>
      {saveMessage && (<div className="p-3 bg-green-100 border border-green-400 text-green-700 rounded">{saveMessage}</div>)}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">変更された商品: {getChangedRows().length}件</div>
        <button onClick={saveAllChanges} disabled={savingAll || getChangedRows().length === 0} className="px-4 py-2 bg-blue-600 text
