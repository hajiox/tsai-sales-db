// /components/web-sales-editable-table.tsx
// ver.26　 (ビルドエラー修正版)
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
type ImportResult = { id: number; original: string; matched: string | null; salesData: { [key: string]: number; }; };
type ProductMaster = { id: string; name: string; };

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
  const [productMaster, setProductMaster] = useState<ProductMaster[]>([]);
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
