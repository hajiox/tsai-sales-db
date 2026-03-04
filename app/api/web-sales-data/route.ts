// /app/api/web-sales-data/route.ts
// ver.10 (単価スナップショット対応)
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getProductUnitPrice } from '@/lib/unitPriceHelper'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')

    console.log('🔍 WEB-SALES-DATA API ver.9 - 受信パラメータ:', { month, url: request.url })

    if (!month) {
      return NextResponse.json({ error: 'monthパラメータが必要です' }, { status: 400 })
    }

    console.log('📞 DB関数呼び出し開始:', { function: 'web_sales_full_month', target_month: month })

    const { data, error } = await supabase.rpc("web_sales_full_month", { target_month: month })

    console.log('📊 DB関数結果:', {
      success: !error,
      error: error?.message,
      dataLength: data?.length,
      sampleData: data?.slice(0, 2) // 最初の2件だけ表示
    })

    if (error) {
      console.error('🚨 DB関数エラー詳細:', error)
      throw error
    }

    console.log('✅ レスポンス準備完了:', { dataCount: data?.length || 0 })

    return NextResponse.json({ data: data || [] })
  } catch (error) {
    console.error('🚨 API全体エラー:', error)
    return NextResponse.json({
      error: 'データの取得に失敗しました',
      details: error instanceof Error ? error.message : '不明なエラー',
      month: searchParams.get('month')
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { product_id, report_month, site, count } = body

    console.log('📝 PUT要求:', { product_id, report_month, site, count })

    if (!product_id || !report_month || !site || count === undefined) {
      return NextResponse.json({
        success: false,
        error: '必須パラメータが不足しています'
      }, { status: 400 })
    }

    // サイト名のバリデーション
    const validSites = ['amazon', 'rakuten', 'yahoo', 'mercari', 'base', 'qoo10']
    if (!validSites.includes(site)) {
      return NextResponse.json({
        success: false,
        error: '無効なサイト名です'
      }, { status: 400 })
    }

    // 数値のバリデーション
    const numericCount = parseInt(count, 10)
    if (isNaN(numericCount) || numericCount < 0) {
      return NextResponse.json({
        success: false,
        error: '販売数は0以上の整数である必要があります'
      }, { status: 400 })
    }

    const columnName = `${site}_count`
    const targetDate = `${report_month}-01`

    // まず既存のレコードを確認
    const { data: existingData, error: selectError } = await supabase
      .from('web_sales_summary')
      .select('*')
      .eq('product_id', product_id)
      .eq('report_month', targetDate)
      .single()

    if (selectError && selectError.code !== 'PGRST116') { // PGRST116はレコードが見つからないエラー
      console.error('🚨 SELECT エラー:', selectError)
      throw selectError
    }

    let result
    if (existingData) {
      // 既存レコードがある場合は更新
      const { data, error } = await supabase
        .from('web_sales_summary')
        .update({ [columnName]: numericCount })
        .eq('product_id', product_id)
        .eq('report_month', targetDate)
        .select()

      if (error) {
        console.error('🚨 UPDATE エラー:', error)
        throw error
      }
      result = data
    } else {
      // 既存レコードがない場合は新規作成（unit_priceを保存）
      const unitPrice = await getProductUnitPrice(supabase, product_id)
      const newRecord = {
        product_id,
        report_month: targetDate,
        amazon_count: 0,
        rakuten_count: 0,
        yahoo_count: 0,
        mercari_count: 0,
        base_count: 0,
        qoo10_count: 0,
        unit_price: unitPrice.unit_price,
        unit_profit_rate: unitPrice.unit_profit_rate,
        [columnName]: numericCount
      }

      const { data, error } = await supabase
        .from('web_sales_summary')
        .insert(newRecord)
        .select()

      if (error) {
        console.error('🚨 INSERT エラー:', error)
        throw error
      }
      result = data
    }

    console.log('✅ 更新完了:', result)

    return NextResponse.json({
      success: true,
      message: '販売数を更新しました',
      data: result?.[0]
    })
  } catch (error) {
    console.error('🚨 PUT API エラー:', error)
    return NextResponse.json({
      success: false,
      error: 'データの更新に失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー')
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')
    const channel = searchParams.get('channel') // 新規追加

    if (!month) {
      return NextResponse.json({
        success: false,
        error: 'monthパラメータが必要です'
      }, { status: 400 })
    }

    console.log('🗑️ DELETE要求:', { month, channel })

    // YYYY-MM形式のmonthパラメータをYYYY-MM-01の日付型に変換
    const targetDate = `${month}-01`

    console.log('🗑️ 削除対象日付:', { targetDate })

    // channelパラメータがある場合：ECチャネル別削除
    if (channel) {
      return await handleChannelDelete(targetDate, channel, month)
    }

    // channelパラメータがない場合：従来の月別一括削除
    return await handleMonthDelete(targetDate, month)
  } catch (error) {
    console.error('🚨 DELETE API エラー:', error)
    return NextResponse.json({
      success: false,
      error: 'データの削除に失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー')
    }, { status: 500 })
  }
}

// ECチャネル別削除処理
async function handleChannelDelete(targetDate: string, channel: string, month: string) {
  const channelNames = {
    amazon: 'Amazon',
    rakuten: '楽天',
    yahoo: 'Yahoo',
    mercari: 'メルカリ',
    base: 'BASE',
    qoo10: 'Qoo10'
  };

  const columnName = `${channel}_count`;
  const channelDisplayName = channelNames[channel as keyof typeof channelNames] || channel;

  console.log('🗑️ ECチャネル別削除:', { channel, columnName, channelDisplayName });

  // 削除前の対象データを取得（件数と総数量をカウント）
  const { data: beforeData, error: selectError } = await supabase
    .from('web_sales_summary')
    .select(`id, ${columnName}`)
    .eq('report_month', targetDate)
    .not(columnName, 'is', null)
    .gt(columnName, 0);

  if (selectError) {
    console.error('🚨 SELECT エラー:', selectError);
    return NextResponse.json({
      success: false,
      error: 'データの確認に失敗しました: ' + selectError.message
    }, { status: 500 });
  }

  const affectedCount = beforeData?.length || 0;
  const totalQuantity = beforeData?.reduce((sum, item) => sum + (item[columnName] || 0), 0) || 0;

  console.log('🔍 削除前データ:', { affectedCount, totalQuantity });

  if (affectedCount === 0) {
    return NextResponse.json({
      success: true,
      message: `${month}の${channelDisplayName}データは存在しません`,
      deletedCount: 0,
      totalQuantity: 0
    });
  }

  // 該当チャネルのカウントを0に更新（NULLではなく0に設定）
  const { error: updateError } = await supabase
    .from('web_sales_summary')
    .update({ [columnName]: 0 })
    .eq('report_month', targetDate)
    .not(columnName, 'is', null)
    .gt(columnName, 0);

  if (updateError) {
    console.error('🚨 UPDATE エラー:', updateError);
    return NextResponse.json({
      success: false,
      error: `${channelDisplayName}データの削除に失敗しました: ` + updateError.message
    }, { status: 500 });
  }

  console.log('✅ ECチャネル別削除完了:', { channel, deletedCount: affectedCount, totalQuantity });

  return NextResponse.json({
    success: true,
    message: `${month}の${channelDisplayName}データを削除しました`,
    deletedCount: affectedCount,
    totalQuantity: totalQuantity
  });
}

// 月別一括削除処理（従来の処理）
async function handleMonthDelete(targetDate: string, month: string) {
  // まず削除対象のレコード数を取得
  const { data: beforeData, error: countError } = await supabase
    .from('web_sales_summary')
    .select('id', { count: 'exact' })
    .eq('report_month', targetDate)

  if (countError) {
    console.error('🚨 COUNT エラー:', countError)
    return NextResponse.json({
      success: false,
      error: 'データ件数の確認に失敗しました: ' + countError.message
    }, { status: 500 })
  }

  const beforeCount = beforeData?.length || 0
  console.log('🔍 削除前レコード数:', { beforeCount })

  // 指定した月のデータを一括削除
  const { error } = await supabase
    .from('web_sales_summary')
    .delete()
    .eq('report_month', targetDate)

  if (error) {
    console.error('🚨 DELETE エラー:', error)
    return NextResponse.json({
      success: false,
      error: 'データの削除に失敗しました: ' + error.message
    }, { status: 500 })
  }

  console.log('✅ 月別一括削除完了:', { deletedCount: beforeCount })

  return NextResponse.json({
    success: true,
    message: `${month}の販売データを削除しました`,
    deletedCount: beforeCount
  })
}
