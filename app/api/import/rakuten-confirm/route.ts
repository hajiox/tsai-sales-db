// /app/api/import/rakuten-confirm/route.ts ver.3 - 現在のweb_salesテーブル対応版

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ConfirmRequest {
  saleDate: string;
  matchedProducts: Array<{
    rakutenTitle: string;
    productId: string;
    quantity: number;
  }>;
  newMappings: Array<{
    rakutenTitle: string;
    productId: string;
    quantity: number;
  }>;
}

interface ConfirmResult {
  success: boolean;
  insertedSales?: number;
  learnedMappings?: number;
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ConfirmResult>> {
  try {
    const body: ConfirmRequest = await request.json();
    const { saleDate, matchedProducts, newMappings } = body;

    try {
      // 1. 新しいマッピングを学習
      let learnedCount = 0;
      if (newMappings.length > 0) {
        const mappingsToInsert = newMappings.map(mapping => ({
          rakuten_title: mapping.rakutenTitle,
          product_id: mapping.productId
        }));

        const { error: mappingError } = await supabase
          .from('rakuten_product_mapping')
          .upsert(mappingsToInsert, { 
            onConflict: 'rakuten_title',
            ignoreDuplicates: false 
          });

        if (mappingError) {
          throw new Error(`マッピング学習エラー: ${mappingError.message}`);
        }
        learnedCount = newMappings.length;
      }

      // 2. 売上データを現在のテーブル構造に合わせて挿入
      const allSalesData = [...matchedProducts, ...newMappings];
      
      // 商品ごとに数量を集計
      const productQuantities = new Map<string, number>();
      allSalesData.forEach(item => {
        const currentQty = productQuantities.get(item.productId) || 0;
        productQuantities.set(item.productId, currentQty + item.quantity);
      });

      // 各商品の売上データを挿入
      const salesToInsert = Array.from(productQuantities.entries()).map(([productId, quantity]) => {
        // 商品情報を取得してproduct_nameとseries_nameを設定
        const productInfo = allSalesData.find(item => item.productId === productId);
        
        return {
          product_id: productId,
          product_name: `楽天商品: ${productInfo?.rakutenTitle || '不明'}`,
          rakuten: quantity,
          rakuten_count: quantity,
          report_date: saleDate,
          report_month: saleDate.substring(0, 7) + '-01' // YYYY-MM-01形式
        };
      });

      const { data: insertedSales, error: salesError } = await supabase
        .from('web_sales')
        .insert(salesToInsert)
        .select('id');

      if (salesError) {
        throw new Error(`売上データ挿入エラー: ${salesError.message}`);
      }

      return NextResponse.json({
        success: true,
        insertedSales: insertedSales?.length || 0,
        learnedMappings: learnedCount
      });

    } catch (error) {
      throw error;
    }

  } catch (error) {
    console.error('楽天CSV確定エラー:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '不明なエラー'
    });
  }
}
