// /components/web-sales-editable-table.tsx ver.7 (ビルドエラー修正版)
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
  
  const showSaveMessage = (message: string) => { /* (省略) */ };
  const isRowChanged = (rowId: string) => { /* (省略) */ return false; };
  const getChangedRows = () => { /* (省略) */ return []; };
  const saveRow = async (rowId: string) => { /* (省略) */ };
  const saveAllChanges = async () => { /* (省略) */ };
  const handleAddSeries = async () => { /* (省略) */ };
  const handleAddProduct = async () => { /* (省略) */ };
  const handleDeleteProduct = async (productId: string, productName: string) => { /* (省略) */ };
  const handleDeleteSeries = async (seriesId: number, seriesName: string) => { /* (省略) */ };
  const handleCellClick = (rowId: string, field: string, currentValue: number | null) => { /* (省略) */ };
  const handleCellSave = async () => { /* (省略) */ };
  const handleCellCancel = () => { /* (省略) */ };
  const handleKeyDown = (e: React.KeyboardEvent) => { /* (省略) */ };
  const getSeriesRowColor = (seriesName: string | null) => { /* (省略) */ return ''; };
  const renderEditableCell = (row: SummaryRow, field: keyof SummaryRow, value: number | null) => { /* (省略) */ };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <p className="text-gray-600">データを読み込んでいます...</p>
      </div>
    );
  }

  const changedRowsCount = getChangedRows().length;

  return (
    <div className="space-y-4">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        accept=".csv"
        disabled={isUploading}
      />
      {saveMessage && (
        <div className="p-3 bg-green-100 border border-green-400 text-green-700 rounded">
          {saveMessage}
        </div>
      )}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">変更された商品: {changedRowsCount}件</div>
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
          <button onClick={() => setShowProductForm(!showProductForm)} className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">
            {showProductForm ? 'キャンセル' : '商品追加'}
          </button>
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
                <th className="px-2 py-1 text-center font-bold text-gray-700 border w-20">保存</th>
                <th className="px-2 py-1 text-center font-bold text-gray-700 border w-16">削除</th>
              </tr>
            </thead>
            <tbody>
              {/* ... (tbodyの内容は省略) ... */}
            </tbody>
            <tfoot className="border-t-2">
              <tr>
                <td colSpan={13} className="p-3">
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-sm font-semibold text-gray-600">データ取り込み:</span>
                    <button onClick={handleCsvButtonClick} className="px-3 py-1 text-xs font-semibold text-white bg-gray-700 rounded hover:bg-gray-800 disabled:bg-gray-400" disabled={isUploading}>
                      {isUploading ? '処理中...' : 'CSV'}
                    </button>
                    {/* ... (他のボタンは省略) ... */}
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div className="flex justify-end">
        {/* ... (一括保存ボタンは省略) ... */}
      </div>
      <div className="bg-blue-50 p-4 rounded-lg">
        {/* ... (シリーズ管理は省略) ... */}
      </div>
    </div>
  );
}
