// /components/web-sales-editable-table.tsx ver.5 (APIへファイル送信機能を追加)
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

  // --- ▼ ここから追加 ▼ ---
  const [isUploading, setIsUploading] = useState(false);
  // --- ▲ ここまで追加 ▲ ---

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

  const loadData = async () => { /* ... */ };
  const loadSeries = async () => { /* ... */ };
  
  // 「CSV」ボタンがクリックされたときの処理
  const handleCsvButtonClick = () => {
    fileInputRef.current?.click();
  };

  // --- ▼ ここから修正 ▼ ---
  // ファイルが選択されたときの処理
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    
    // FormDataオブジェクトを作成し、ファイルを追加
    const formData = new FormData();
    formData.append('file', file);

    try {
      // APIにファイルを送信
      const response = await fetch('/api/import/csv', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        alert(`成功: ${result.message}\nファイル名: ${result.fileName}`);
        // TODO: ここでテーブルのデータを再読み込みするなどの処理を追加
      } else {
        throw new Error(result.error || '不明なエラーが発生しました');
      }
    } catch (error) {
      console.error('アップロードエラー:', error);
      alert(`エラー: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsUploading(false);
      // 同じファイルを再度選択できるように、値をリセット
      if(fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };
  // --- ▲ ここまで修正 ▲ ---
  
  const showSaveMessage = (message: string) => { /* ... */ };
  const isRowChanged = (rowId: string) => { /* ... */ return false; };
  const getChangedRows = () => { /* ... */ return []; };
  const saveRow = async (rowId: string) => { /* ... */ };
  const saveAllChanges = async () => { /* ... */ };
  const handleAddSeries = async () => { /* ... */ };
  const handleAddProduct = async () => { /* ... */ };
  const handleDeleteProduct = async (productId: string, productName: string) => { /* ... */ };
  const handleDeleteSeries = async (seriesId: number, seriesName: string) => { /* ... */ };
  const handleCellClick = (rowId: string, field: string, currentValue: number | null) => { /* ... */ };
  const handleCellSave = async () => { /* ... */ };
  const handleCellCancel = () => { /* ... */ };
  const handleKeyDown = (e: React.KeyboardEvent) => { /* ... */ };
  const getSeriesRowColor = (seriesName: string | null) => { /* ... */ return ''; };
  const renderEditableCell = (row: SummaryRow, field: keyof SummaryRow, value: number | null) => { /* ... */ };

  if (loading) { /* ... */ }

  const changedRowsCount = getChangedRows().length;

  return (
    <div className="space-y-4">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        accept=".csv"
        disabled={isUploading} // アップロード中は無効化
      />

      {/* ... (既存のJSXは省略) ... */}
      
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            {/* ... (thead, tbodyは省略) ... */}
            <tfoot className="border-t-2">
              <tr>
                <td colSpan={13} className="p-3">
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-sm font-semibold text-gray-600">データ取り込み:</span>
                    {/* --- ▼ ここを修正 ▼ --- */}
                    <button 
                      onClick={handleCsvButtonClick}
                      className="px-3 py-1 text-xs font-semibold text-white bg-gray-700 rounded hover:bg-gray-800 disabled:bg-gray-400"
                      disabled={isUploading}
                    >
                      {isUploading ? '処理中...' : 'CSV'}
                    </button>
                    {/* --- ▲ ここまで修正 ▲ --- */}
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
      {/* ... (既存のJSXは省略) ... */}
    </div>
  );
}
