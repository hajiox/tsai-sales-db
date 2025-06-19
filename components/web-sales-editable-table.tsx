// /components/web-sales-editable-table.tsx ver.20
"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import SeriesManager from './SeriesManager';
import ProductAddForm from './ProductAddForm';
import SalesDataTable from './SalesDataTable';
import CsvImportConfirmModal from "./CsvImportConfirmModal";

// --- 型定義 ---
type SummaryRow = { id: string; product_id: string; product_name: string; series_name: string | null; product_number: number; price: number | null; amazon_count: number | null; rakuten_count: number | null; yahoo_count: number | null; mercari_count: number | null; base_count: number | null; qoo10_count: number | null; };
type SeriesMaster = { series_id: number; series_name: string; };
type NewProductState = { product_name: string; series_id: string; product_number: string; price: string; };
type EditingCell = { rowId: string; field: string; } | null;
type ImportResult = { id: number; original: string; matched: string | null; };
type ProductMaster = { id: string; name: string; }; // [ADD] 商品マスタの型

// --- Component ---
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
  const [productMaster, setProductMaster] = useState<ProductMaster[]>([]); // [ADD] 商品マスタリスト用のState
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
  const [newProduct, setNewProduct] = useState<NewProductState>({ product_name: "", series_id: "", product_number: "", price: "" });
  const [productLoading, setProductLoading] = useState(false);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[]>([]);

  // --- Data Loading ---
  useEffect(() => {
    loadData();
    loadSeries();
    loadProductMaster(); // [ADD] 商品マスタを読み込む
  }, [month]);

  const loadData = async () => { setLoading(true); try { const { data, error } = await supabase.rpc("web_sales_full_month", { target_month: month }); if (error) throw error; const salesData = (data as SummaryRow[]) ?? []; setRows(salesData); setOriginalRows(JSON.parse(JSON.stringify(salesData))); } catch (error) { console.error('データ読み込みエラー:', error); } finally { setLoading(false); } };
  const loadSeries = async () => { try { const response = await fetch('/api/series-master'); const result = await response.json(); if (response.ok) { setSeriesList(result.data || []); } } catch (error) { console.error('シリーズ読み込みエラー:', error); } };
  
  // [ADD] 商品マスタをDBから取得する関数
  const loadProductMaster = async () => {
    try {
      const { data, error } = await supabase.from('products').select('id, name');
      if (error) throw error;
      setProductMaster(data || []);
    } catch (error) {
      console.error('商品マスタの読み込みエラー:', error);
    }
  };

  // --- CSV Import ---
  const handleCsvButtonClick = () => { fileInputRef.current?.click(); };
  
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await fetch('/api/import/csv', { method: 'POST', body: formData });
      const result = await response.json();
      if (response.ok) {
        setImportResults(result.results);
        setShowConfirmModal(true);
      } else { throw new Error(result.error || '不明なエラーが発生しました'); }
    } catch (error) {
      alert(`エラー: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsUploading(false);
      if(fileInputRef.current) { fileInputRef.current.value = ""; }
    }
  };

  // [ADD] モーダルでの変更をハンドリングする関数
  const handleImportResultChange = (id: number, newMatchedValue: string) => {
    setImportResults(currentResults =>
      currentResults.map(result =>
        result.id === id ? { ...result, matched: newMatchedValue } : result
      )
    );
  };
  
  // (ここにDB登録処理の関数を将来的に追加)

  // (省略) 他の関数は変更なし...

  // --- Render Logic ---
  if (loading) { return <div className="flex justify-center items-center h-64"><div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div><p className="ml-2 text-gray-600">データを読み込んでいます...</p></div>; }

  return (
    <div className="space-y-4">
      <CsvImportConfirmModal
        isOpen={showConfirmModal}
        results={importResults}
        productMaster={productMaster}
        onResultChange={handleImportResultChange}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={(updatedResults) => {
          console.log("最終確認された結果:", updatedResults);
          // (将来的にこのデータを使ってDBに登録する)
          setShowConfirmModal(false);
        }}
      />
      
      {/* (省略) 他のJSXは変更なし... */}
      
    </div>
  );
}

// NOTE: 可読性のため、変更のない関数やJSXの多くを省略しています。
// 実際のファイルにペーストする際は、このファイルの変更点のみを既存のコードに適用してください。
