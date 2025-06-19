// /components/SalesDataTable.tsx ver.1
"use client";

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

type EditingCell = {
  rowId: string;
  field: string;
} | null;

interface SalesDataTableProps {
  rows: SummaryRow[];
  editingCell: EditingCell;
  editValue: string;
  savingRows: Set<string>;
  isRowChanged: (rowId: string) => boolean;
  onSaveRow: (rowId: string) => void;
  onDeleteProduct: (productId: string, productName: string) => void;
  onCellClick: (rowId: string, field: string, currentValue: number | null) => void;
  onEditValueChange: (value: string) => void;
  onCellSave: () => void;
  onCellCancel: () => void;
}

export default function SalesDataTable({
  rows,
  editingCell,
  editValue,
  savingRows,
  isRowChanged,
  onSaveRow,
  onDeleteProduct,
  onCellClick,
  onEditValueChange,
  onCellSave,
  onCellCancel,
}: SalesDataTableProps) {
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onCellSave();
    else if (e.key === 'Escape') onCellCancel();
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
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={editValue}
          onChange={(e) => onEditValueChange(e.target.value)}
          onBlur={onCellSave}
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
        onClick={() => onCellClick(row.id, field, value)}
      >
        {value || '-'}
      </div>
    );
  };

  return (
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
          {rows.map((row) => {
            const totalCount = (row.amazon_count || 0) + (row.rakuten_count || 0) + (row.yahoo_count || 0) + (row.mercari_count || 0) + (row.base_count || 0) + (row.qoo10_count || 0);
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
                  <button onClick={() => onSaveRow(row.id)} disabled={isSaving || !isChanged} className="px-2 py-0.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
                    {isSaving ? '保存中' : '保存'}
                  </button>
                </td>
                <td className="px-2 py-1 text-center border">
                  <button onClick={() => onDeleteProduct(row.product_id, row.product_name)} className="px-1 py-0.5 bg-red-500 text-white rounded text-xs hover:bg-red-600" title="商品を削除">
                    削除
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
