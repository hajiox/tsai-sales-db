// /app/api/import/rakuten-confirm/route.ts ver.1

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

    // 楽天チャンネルIDを取得
    const { data: rakutenChannel } = await supabase
      .from('sales_channels')
      .select('id')
      .eq('api_code', 'rakuten')
      .single();

    if (!rakutenChannel) {
      return NextResponse.json({
        success: false,
        error: '楽天チャンネルが見つかりません。sales_channelsテーブルにapi_code="rakuten"を追加してください。'
      });
    }

    const channelId = rakutenChannel.id;

    // トランザクション開始
    const { data: transaction, error: transactionError } = await supabase.rpc('begin_transaction');
    
    if (transactionError) {
      console.error('トランザクション開始エラー:', transactionError);
    }

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

      // 2. 売上データを挿入（既存データと新規マッピングの両方）
      const allSalesData = [...matchedProducts, ...newMappings];
      const salesToInsert = allSalesData.map(item => ({
        sale_date: saleDate,
        channel_id: channelId,
        product_id: item.productId,
        quantity: item.quantity,
        amount: 0, // 楽天CSVには金額が含まれていないため0で挿入
        note: `楽天: ${item.rakutenTitle}`
      }));

      const { data: insertedSales, error: salesError } = await supabase
        .from('web_sales')
        .insert(salesToInsert)
        .select('id');

      if (salesError) {
        throw new Error(`売上データ挿入エラー: ${salesError.message}`);
      }

      // トランザクション確定
      await supabase.rpc('commit_transaction');

      return NextResponse.json({
        success: true,
        insertedSales: insertedSales?.length || 0,
        learnedMappings: learnedCount
      });

    } catch (error) {
      // トランザクション失敗時はロールバック
      await supabase.rpc('rollback_transaction');
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
