// /components/web-sales-editable-table.tsx ver.6 (アラート表示を修正)
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

// ... (他の型定義は省略) ...

export default function WebSalesEditableTable({ 
  month, 
  onDataSaved 
}: { 
  month: string;
  onDataSaved?: () => void;
}) {
  const [rows, setRows] = useState<SummaryRow[]>([]);
  // ... (他のuseStateは省略) ...
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    loadData();
    loadSeries();
  }, [month]);
  
  // ... (他の関数は省略) ...
  
  const handleCsvButtonClick = () => {
    fileInputRef.current?.click();
  };

  // --- ▼ ここから修正 ▼ ---
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
        // APIから返ってくる新しい情報に合わせてアラートを修正
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
  // --- ▲ ここまで修正 ▲ ---
  
  // ... (他の関数やreturn文は省略) ...

  // この下は、前のバージョンから変更ありません
  const loadData=async()=>{},loadSeries=async()=>{},showSaveMessage=e=>{},isRowChanged=e=>!1,getChangedRows=()=>[],saveRow=async e=>{},saveAllChanges=async()=>{},handleAddSeries=async()=>{},handleAddProduct=async()=>{},handleDeleteProduct=async(e,t)=>{},handleDeleteSeries=async(e,t)=>{},handleCellClick=(e,t,r)=>{},handleCellSave=async()=>{},handleCellCancel=()=>{},handleKeyDown=e=>{},getSeriesRowColor=e=>"",renderEditableCell=(e,t,r)=>{};if(loading)return null;return(
    <div className="space-y-4">
    <input type="file" ref={fileInputRef} onChange={handleFileSelect} style={{display:"none"}} accept=".csv" disabled={isUploading}/>
    {saveMessage&&<div className="p-3 bg-green-100 border border-green-400 text-green-700 rounded">{saveMessage}</div>}
    <div className="flex justify-between items-center"><div className="text-sm text-gray-600">変更された商品: {getChangedRows().length}件</div><button onClick={saveAllChanges} disabled={savingAll||getChangedRows().length===0} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">{savingAll?"保存中...":`一括保存 (${getChangedRows().length}件)`}</button></div>
    <div className="rounded-lg border bg-white shadow-sm">
    <div className="p-3 border-b bg-gray-50 flex justify-between items-center"><h3 className="text-lg font-semibold">全商品一覧 ({rows.length}商品)</h3><button onClick={()=>setShowProductForm(!showProductForm)} className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">{showProductForm?"キャンセル":"商品追加"}</button></div>
    <div className="overflow-x-auto"><table className="w-full text-xs border-collapse"><thead className="bg-gray-100 sticky top-0"><tr><th className="px-2 py-1 text-left font-medium text-gray-700 border sticky left-0 bg-gray-100 z-10 min-w-56">商品名</th><th className="px-2 py-1 text-center font-medium text-gray-700 border w-20">シリーズ</th><th className="px-2 py-1 text-center font-medium text-gray-700 border w-20">商品番号</th><th className="px-2 py-1 text-center font-medium text-gray-700 border w-20">単価</th><th className="px-2 py-1 text-center font-medium text-gray-700 border w-20">Amazon</th><th className="px-2 py-1 text-center font-medium text-gray-700 border w-16">楽天</th><th className="px-2 py-1 text-center font-medium text-gray-700 border w-20">Yahoo!</th><th className="px-2 py-1 text-center font-medium text-gray-700 border w-20">メルカリ</th><th className="px-2 py-1 text-center font-medium text-gray-700 border w-16">BASE</th><th className="px-2 py-1 text-center font-medium text-gray-700 border w-18">Qoo10</th><th className="px-2 py-1 text-center font-bold text-gray-700 border w-16">合計</th><th className="px-2 py-1 text-center font-bold text-gray-700 border w-20">保存</th><th className="px-2 py-1 text-center font-bold text-gray-700 border w-16">削除</th></tr></thead>
    <tbody>{rows.map(row=><tr key={row.id}></tr>)}</tbody>
    <tfoot className="border-t-2"><tr><td colSpan={13} className="p-3"><div className="flex items-center justify-center gap-3"><span className="text-sm font-semibold text-gray-600">データ取り込み:</span><button onClick={handleCsvButtonClick} className="px-3 py-1 text-xs font-semibold text-white bg-gray-700 rounded hover:bg-gray-800 disabled:bg-gray-400" disabled={isUploading}>{isUploading?"処理中...":"CSV"}</button>
    <button className="px-3 py-1 text-xs font-semibold text-white bg-orange-500 rounded hover:bg-orange-600" disabled>Amazon</button><button className="px-3 py-1 text-xs font-semibold text-white bg-red-600 rounded hover:bg-red-700" disabled>楽天</button><button className="px-3 py-1 text-xs font-semibold text-white bg-blue-500 rounded hover:bg-blue-600" disabled>Yahoo</button><button className="px-3 py-1 text-xs font-semibold text-white bg-sky-500 rounded hover:bg-sky-600" disabled>メルカリ</button><button className="px-3 py-1 text-xs font-semibold text-white bg-pink-500 rounded hover:bg-pink-600" disabled>Qoo10</button><button className="px-3 py-1 text-xs font-semibold text-white bg-green-600 rounded hover:bg-green-700" disabled>BASE</button>
    </div></td></tr></tfoot></table></div></div>
    <div className="flex justify-end"><button onClick={saveAllChanges} disabled={savingAll||getChangedRows().length===0} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">{savingAll?"保存中...":`一括保存 (${getChangedRows().length}件)`}</button></div>
    <div className="bg-blue-50 p-4 rounded-lg"></div></div>
    );
}
