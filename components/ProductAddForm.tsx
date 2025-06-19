// /components/ProductAddForm.tsx ver.1
"use client";

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

interface ProductAddFormProps {
  show: boolean;
  newProduct: NewProductState;
  seriesList: SeriesMaster[];
  productLoading: boolean;
  onNewProductChange: (update: Partial<NewProductState>) => void;
  onAddProduct: () => void;
  onCancel: () => void;
}

export default function ProductAddForm({
  show,
  newProduct,
  seriesList,
  productLoading,
  onNewProductChange,
  onAddProduct,
  onCancel,
}: ProductAddFormProps) {
  if (!show) {
    return null;
  }

  return (
    <div className="bg-green-50 p-4 rounded-lg border">
      <h4 className="text-base font-semibold mb-3">🛍️ 新商品追加</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">商品名</label>
          <input
            type="text"
            value={newProduct.product_name}
            onChange={(e) => onNewProductChange({ product_name: e.target.value })}
            className="w-full px-2 py-1 border rounded text-sm"
            placeholder="商品名を入力"
            disabled={productLoading}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">シリーズ</label>
          <select
            value={newProduct.series_id}
            onChange={(e) => onNewProductChange({ series_id: e.target.value })}
            className="w-full px-2 py-1 border rounded text-sm"
            disabled={productLoading}
          >
            <option value="">シリーズを選択</option>
            {seriesList.map((series) => (
              <option key={series.series_id} value={series.series_id}>
                {series.series_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">商品番号</label>
          <input
            type="number"
            value={newProduct.product_number}
            onChange={(e) => onNewProductChange({ product_number: e.target.value })}
            className="w-full px-2 py-1 border rounded text-sm"
            placeholder="商品番号"
            disabled={productLoading}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">単価</label>
          <input
            type="number"
            value={newProduct.price}
            onChange={(e) => onNewProductChange({ price: e.target.value })}
            className="w-full px-2 py-1 border rounded text-sm"
            placeholder="単価"
            disabled={productLoading}
          />
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={onAddProduct}
          disabled={productLoading}
          className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:bg-gray-400"
        >
          {productLoading ? '追加中...' : '商品追加'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
