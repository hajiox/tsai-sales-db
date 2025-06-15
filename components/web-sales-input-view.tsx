'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Supabase RPC関数の戻り値型を明確に定義
type SupabaseRpcResult = {
  id: string;
  product_id: string;
  product_name: string;
  series_name: string;
  product_number: number;
  price: number;
  amazon_count: number;
  rakuten_count: number;
  yahoo_count: number;
  mercari_count: number;
  base_count: number;
  qoo10_count: number;
};

// フロント側で使用する型
type Row = {
  id: string | null;
  product_id: string;
  product_name: string;
  series_name: string;
  product_number: number;
  price: number;
  amazon_count: number;
  rakuten_count: number;
  yahoo_count: number;
  mercari_count: number;
  base_count: number;
  qoo10_count: number;
};

const WebSalesInputView = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [ym, setYm] = useState('2025-04');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [productForm, setProductForm] = useState({
    name: '',
    series_code: '',
    product_number: '',
    price: ''
  });

  const load = async (month: string) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log(`Loading data for month: ${month}`);
      
      const { data, error } = await supabase
        .rpc('web_sales_full_month', { 
          target_month: month 
        })
        .returns<SupabaseRpcResult[]>();

      if (error) {
        console.error('Supabase RPC Error:', error);
        throw new Error(`Supabase RPC Error: ${error.message} (Code: ${error.code})`);
      }

      console.log(`Received ${data?.length || 0} rows from RPC function`);
      
      if (!data) {
        setRows([]);
        return;
      }

      const mapped: Row[] = data.map((item: SupabaseRpcResult, index: number) => {
        try {
          return {
            id: item.id || null,
            product_id: String(item.product_id || ''),
            product_name: String(item.product_name || ''),
            series_name: String(item.series_name || ''),
            product_number: Number(item.product_number) || 0,
            price: Number(item.price) || 0,
            amazon_count: Number(item.amazon_count) || 0,
            rakuten_count: Number(item.rakuten_count) || 0,
            yahoo_count: Number(item.yahoo_count) || 0,
            mercari_count: Number(item.mercari_count) || 0,
            base_count: Number(item.base_count) || 0,
            qoo10_count: Number(item.qoo10_count) || 0,
          };
        } catch (mappingError) {
          console.error(`Error mapping row ${index}:`, mappingError, item);
          throw new Error(`データの変換に失敗しました (行 ${index + 1})`);
        }
      });

      setRows(mapped);
      console.log(`Successfully mapped ${mapped.length} rows`);

    } catch (e: any) {
      const errorMessage = e.message || 'データの読み込みに失敗しました';
      setError(errorMessage);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const updateCount = (index: number, field: keyof Row, value: string) => {
    const numValue = parseInt(value) || 0;
    setRows(prev => prev.map((row, i) => 
      i === index ? { ...row, [field]: numValue } : row
    ));
  };

  const saveData = async () => {
    setSaving(true);
    setError(null);
    
    try {
      const reportDate = `${ym}-01`;
      
      for (const row of rows) {
        if (row.id) {
          // 既存データの更新
          const { error } = await supabase
            .from('web_sales_summary')
            .update({
              amazon_count: row.amazon_count,
              rakuten_count: row.rakuten_count,
              yahoo_count: row.yahoo_count,
              mercari_count: row.mercari_count,
              base_count: row.base_count,
              qoo10_count: row.qoo10_count,
            })
            .eq('id', row.id);
          
          if (error) throw error;
        } else {
          // 新規データの挿入
          const { error } = await supabase
            .from('web_sales_summary')
            .insert({
              product_id: row.product_id,
              report_date: reportDate,
              amazon_count: row.amazon_count,
              rakuten_count: row.rakuten_count,
              yahoo_count: row.yahoo_count,
              mercari_count: row.mercari_count,
              base_count: row.base_count,
              qoo10_count: row.qoo10_count,
            });
          
          if (error) throw error;
        }
      }
      
      // 保存後にデータを再読み込み
      await load(ym);
      alert('データを保存しました');
      
    } catch (e: any) {
      setError(`保存に失敗しました: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const openProductForm = (productId?: string) => {
    if (productId) {
      const product = rows.find(r => r.product_id === productId);
      if (product) {
        setProductForm({
          name: product.product_name,
          series_code: product.series_name,
          product_number: product.product_number.toString(),
          price: product.price.toString()
        });
        setEditingProduct(productId);
      }
    } else {
      setProductForm({
        name: '',
        series_code: '',
        product_number: '',
        price: ''
      });
      setEditingProduct(null);
    }
    setShowProductForm(true);
  };

  const closeProductForm = () => {
    setShowProductForm(false);
    setEditingProduct(null);
    setProductForm({
      name: '',
      series_code: '',
      product_number: '',
      price: ''
    });
  };

  const saveProduct = async () => {
    try {
      if (editingProduct) {
        // 商品情報の更新
        const { error } = await supabase
          .from('products')
          .update({
            name: productForm.name,
            series_code: parseInt(productForm.series_code),
            product_number: parseInt(productForm.product_number),
            price: parseInt(productForm.price)
          })
          .eq('id', editingProduct);
        
        if (error) throw error;
        alert('商品情報を更新しました');
      } else {
        // 新商品の追加
        const { data, error } = await supabase
          .rpc('add_product_with_global_id', {
            p_name: productForm.name,
            p_series_code: parseInt(productForm.series_code),
            p_product_number: parseInt(productForm.product_number),
            p_price: parseInt(productForm.price)
          });
        
        if (error) throw error;
        alert(`新商品を追加しました (管理番号: ${data})`);
      }
      
      closeProductForm();
      await load(ym);
      
    } catch (e: any) {
      setError(`商品の保存に失敗しました: ${e.message}`);
    }
  };

  useEffect(() => {
    load(ym);
  }, [ym]);

  // 合計値を計算
  const grandTotal = rows.reduce((sum, row) => {
    const totalCount = row.amazon_count + row.rakuten_count + row.yahoo_count + 
                      row.mercari_count + row.base_count + row.qoo10_count;
    return sum + (totalCount * row.price);
  }, 0);

  const grandTotalCount = rows.reduce((sum, row) => {
    return sum + row.amazon_count + row.rakuten_count + row.yahoo_count + 
           row.mercari_count + row.base_count + row.qoo10_count;
  }, 0);

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-2">
          <label className="font-medium">対象月:</label>
          <input
            type="month"
            value={ym}
            onChange={(e) => setYm(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
            disabled={loading}
          />
        </div>
        <button
          onClick={() => load(ym)}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm transition-colors"
        >
          {loading ? '読み込み中...' : '再読み込み'}
        </button>
        <button
          onClick={saveData}
          disabled={saving || loading}
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-3 py-1 rounded text-sm transition-colors"
        >
          {saving ? '保存中...' : '保存'}
        </button>
        <button
          onClick={() => openProductForm()}
          className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm transition-colors"
        >
          商品追加
        </button>
        <div className="text-xs text-gray-600">
          {rows.length > 0 && `${rows.length}件のデータを表示中`}
        </div>
      </div>

      {/* 商品追加・編集フォーム */}
      {showProductForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96">
            <h3 className="text-lg font-medium mb-4">
              {editingProduct ? '商品編集' : '商品追加'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">商品名</label>
                <input
                  type="text"
                  value={productForm.name}
                  onChange={(e) => setProductForm({...productForm, name: e.target.value})}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">シリーズ番号</label>
                <input
                  type="number"
                  value={productForm.series_code}
                  onChange={(e) => setProductForm({...productForm, series_code: e.target.value})}
                  className="w-full border rounded px-3 py-2 text-sm"
                  min="1"
                  max="18"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">商品番号</label>
                <input
                  type="number"
                  value={productForm.product_number}
                  onChange={(e) => setProductForm({...productForm, product_number: e.target.value})}
                  className="w-full border rounded px-3 py-2 text-sm"
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">単価</label>
                <input
                  type="number"
                  value={productForm.price}
                  onChange={(e) => setProductForm({...productForm, price: e.target.value})}
                  className="w-full border rounded px-3 py-2 text-sm"
                  min="0"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={saveProduct}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
              >
                {editingProduct ? '更新' : '追加'}
              </button>
              <button
                onClick={closeProductForm}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-sm">
          <strong>エラー:</strong> {error}
        </div>
      )}

      {/* ローディング表示 */}
      {loading && (
        <div className="text-center py-6">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600 text-sm">データを読み込んでいます...</p>
        </div>
      )}

      {/* サマリー表示 */}
      {!loading && rows.length > 0 && (
        <div className="bg-gray-100 p-3 rounded">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <span className="font-medium">商品数:</span> {rows.length}件
            </div>
            <div>
              <span className="font-medium">総販売数:</span> {grandTotalCount.toLocaleString()}個
            </div>
            <div>
              <span className="font-medium">総売上:</span> ¥{grandTotal.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* メインテーブル */}
      {!loading && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-1 py-1 text-left w-80">商品名</th>
                <th className="border px-1 py-1 text-center w-12">シリーズ</th>
                <th className="border px-1 py-1 text-center w-12">商品番号</th>
                <th className="border px-1 py-1 text-right w-16">単価</th>
                <th className="border px-1 py-1 text-center w-16">Amazon</th>
                <th className="border px-1 py-1 text-center w-16">楽天</th>
                <th className="border px-1 py-1 text-center w-16">Yahoo!</th>
                <th className="border px-1 py-1 text-center w-16">メルカリ</th>
                <th className="border px-1 py-1 text-center w-16">BASE</th>
                <th className="border px-1 py-1 text-center w-16">Qoo10</th>
                <th className="border px-1 py-1 text-center w-16">合計数</th>
                <th className="border px-1 py-1 text-right w-20">売上</th>
                <th className="border px-1 py-1 text-center w-12">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="border px-4 py-6 text-center text-gray-500 text-sm">
                    選択した月のデータがありません
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const total_count =
                    r.amazon_count +
                    r.rakuten_count +
                    r.yahoo_count +
                    r.mercari_count +
                    r.base_count +
                    r.qoo10_count;
                  const total_price = total_count * r.price;

                  return (
                    <tr key={r.id || r.product_id || i} className="hover:bg-gray-50">
                      <td className="border px-1 py-0.5 text-xs">{r.product_name}</td>
                      <td className="border px-1 py-0.5 text-center">{r.series_name}</td>
                      <td className="border px-1 py-0.5 text-center">{r.product_number}</td>
                      <td className="border px-1 py-0.5 text-right">¥{r.price.toLocaleString()}</td>
                      <td className="border px-0.5 py-0.5">
                        <input
                          type="number"
                          value={r.amazon_count}
                          onChange={(e) => updateCount(i, 'amazon_count', e.target.value)}
                          className="w-full text-right border-0 bg-transparent px-1 py-0.5 focus:bg-white focus:border focus:border-blue-500 rounded text-xs"
                          min="0"
                        />
                      </td>
                      <td className="border px-0.5 py-0.5">
                        <input
                          type="number"
                          value={r.rakuten_count}
                          onChange={(e) => updateCount(i, 'rakuten_count', e.target.value)}
                          className="w-full text-right border-0 bg-transparent px-1 py-0.5 focus:bg-white focus:border focus:border-blue-500 rounded text-xs"
                          min="0"
                        />
                      </td>
                      <td className="border px-0.5 py-0.5">
                        <input
                          type="number"
                          value={r.yahoo_count}
                          onChange={(e) => updateCount(i, 'yahoo_count', e.target.value)}
                          className="w-full text-right border-0 bg-transparent px-1 py-0.5 focus:bg-white focus:border focus:border-blue-500 rounded text-xs"
                          min="0"
                        />
                      </td>
                      <td className="border px-0.5 py-0.5">
                        <input
                          type="number"
                          value={r.mercari_count}
                          onChange={(e) => updateCount(i, 'mercari_count', e.target.value)}
                          className="w-full text-right border-0 bg-transparent px-1 py-0.5 focus:bg-white focus:border focus:border-blue-500 rounded text-xs"
                          min="0"
                        />
                      </td>
                      <td className="border px-0.5 py-0.5">
                        <input
                          type="number"
                          value={r.base_count}
                          onChange={(e) => updateCount(i, 'base_count', e.target.value)}
                          className="w-full text-right border-0 bg-transparent px-1 py-0.5 focus:bg-white focus:border focus:border-blue-500 rounded text-xs"
                          min="0"
                        />
                      </td>
                      <td className="border px-0.5 py-0.5">
                        <input
                          type="number"
                          value={r.qoo10_count}
                          onChange={(e) => updateCount(i, 'qoo10_count', e.target.value)}
                          className="w-full text-right border-0 bg-transparent px-1 py-0.5 focus:bg-white focus:border focus:border-blue-500 rounded text-xs"
                          min="0"
                        />
                      </td>
                      <td className="border px-1 py-0.5 text-center font-semibold">
                        {total_count}
                      </td>
                      <td className="border px-1 py-0.5 text-right font-semibold">
                        ¥{total_price.toLocaleString()}
                      </td>
                      <td className="border px-1 py-0.5 text-center">
                        <button
                          onClick={() => openProductForm(r.product_id)}
                          className="bg-yellow-500 hover:bg-yellow-600 text-white px-1 py-0.5 rounded text-xs"
                        >
                          編集
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default WebSalesInputView;
