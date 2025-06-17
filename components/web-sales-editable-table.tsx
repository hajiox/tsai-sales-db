"use client";

import { useEffect, useState } from "react";

type ProductRow = {
  id: string;
  product_id: string;
  amazon_count: number;
  rakuten_count: number;
  yahoo_count: number;
  mercari_count: number;
  base_count: number;
  qoo10_count: number;
  product_code: number;
  product_number: number;
};

type EditingCell = {
  rowId: string;
  field: string;
} | null;

export default function WebSalesEditableTable({ month }: { month: string }) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState<string>("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('/api/web-sales-data');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && Array.isArray(data.data)) {
          const sortedData = data.data.sort((a: ProductRow, b: ProductRow) => {
            if (a.product_code !== b.product_code) {
              return a.product_code - b.product_code;
            }
            return a.product_number - b.product_number;
          });
          setProducts(sortedData);
        } else {
          setProducts([]);
        }
      } catch (e: any) {
        console.error('データ取得エラー:', e);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [month]);

  // セルをクリックして編集開始
  const handleCellClick = (rowId: string, field: string, currentValue: number) => {
    setEditingCell({ rowId, field });
    setEditValue(currentValue.toString());
  };

  // 編集完了
  const handleCellSave = () => {
    if (!editingCell) return;

    const newValue = parseInt(editValue) || 0;
    
    setProducts(prevProducts => 
      prevProducts.map(product => 
        product.id === editingCell.rowId
          ? { ...product, [editingCell.field]: newValue }
          : product
      )
    );

    setEditingCell(null);
    setEditValue("");

    // TODO: ここでAPIに保存リクエストを送信
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
  const totals = products.reduce((acc, product) => {
    acc.amazon += product.amazon_count || 0;
    acc.rakuten += product.rakuten_count || 0;
    acc.yahoo += product.yahoo_count || 0;
    acc.mercari += product.mercari_count || 0;
    acc.base += product.base_count || 0;
    acc.qoo10 += product.qoo10_count || 0;
    
    const totalCount = (product.amazon_count || 0) + (product.rakuten_count || 0) + 
                      (product.yahoo_count || 0) + (product.mercari_count || 0) + 
                      (product.base_count || 0) + (product.qoo10_count || 0);
    acc.totalCount += totalCount;
    
    return acc;
  }, {
    amazon: 0, rakuten: 0, yahoo: 0, mercari: 0, 
    base: 0, qoo10: 0, totalCount: 0
  });

  // 編集可能セルのレンダリング
  const renderEditableCell = (product: ProductRow, field: keyof ProductRow, value: number) => {
    const isEditing = editingCell?.rowId === product.id && editingCell?.field === field;
    
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
        onClick={() => handleCellClick(product.id, field, value)}
      >
        {value || '-'}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-red-600 bg-red-100 rounded-md">
        Error: {error}
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
          <h3 className="text-xl font-semibold">全商品一覧 ({products.length}商品)</h3>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-100 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-center font-medium text-gray-700 border sticky left-0 bg-gray-100 z-10">No.</th>
                <th className="px-3 py-2 text-center font-medium text-gray-700 border sticky left-8 bg-gray-100 z-10">シリーズ</th>
                <th className="px-3 py-2 text-center font-medium text-gray-700 border sticky left-16 bg-gray-100 z-10">商品</th>
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
              {products.map((product, index) => {
                const totalCount = (product.amazon_count || 0) + (product.rakuten_count || 0) + 
                                 (product.yahoo_count || 0) + (product.mercari_count || 0) + 
                                 (product.base_count || 0) + (product.qoo10_count || 0);
                
                return (
                  <tr key={product.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 text-center border sticky left-0 bg-white">{index + 1}</td>
                    <td className="px-3 py-2 text-center border sticky left-8 bg-white">{product.product_code}</td>
                    <td className="px-3 py-2 text-center border sticky left-16 bg-white">{product.product_number}</td>
                    <td className="px-3 py-2 text-center border">
                      {renderEditableCell(product, 'amazon_count', product.amazon_count)}
                    </td>
                    <td className="px-3 py-2 text-center border">
                      {renderEditableCell(product, 'rakuten_count', product.rakuten_count)}
                    </td>
                    <td className="px-3 py-2 text-center border">
                      {renderEditableCell(product, 'yahoo_count', product.yahoo_count)}
                    </td>
                    <td className="px-3 py-2 text-center border">
                      {renderEditableCell(product, 'mercari_count', product.mercari_count)}
                    </td>
                    <td className="px-3 py-2 text-center border">
                      {renderEditableCell(product, 'base_count', product.base_count)}
                    </td>
                    <td className="px-3 py-2 text-center border">
                      {renderEditableCell(product, 'qoo10_count', product.qoo10_count)}
                    </td>
                    <td className="px-3 py-2 text-center font-bold border bg-blue-50">
                      {totalCount.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
              
              {/* 合計行 */}
              <tr className="bg-green-100 font-bold border-t-2">
                <td className="px-3 py-3 text-center border sticky left-0 bg-green-100" colSpan={3}>合計</td>
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
