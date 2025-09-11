// /app/api/wholesale/sales/import/route.ts ver.2
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: Request) {
  try {
    const { data } = await request.json();
    
    if (!data || !Array.isArray(data)) {
      return NextResponse.json(
        { success: false, error: 'データが不正です' },
        { status: 400 }
      );
    }

    let processed = 0;
    const errors: string[] = [];

    // 商品名と商品IDのマッピングを取得
    const { data: products, error: productsError } = await supabase
      .from('wholesale_products')
      .select('id, product_name, price');

    if (productsError) {
      return NextResponse.json(
        { success: false, error: '商品マスタの取得に失敗しました' },
        { status: 500 }
      );
    }

    const productMap = new Map(
      products?.map(p => [p.product_name, { id: p.id, price: p.price }]) || []
    );

    // データを処理
    for (const item of data) {
      const { productName, price, saleDate, quantity } = item;
      
      // quantityが0の場合はスキップ
      if (quantity === 0) {
        continue;
      }
      
      let productInfo = productMap.get(productName);
      
      // 商品が存在しない場合は新規登録
      if (!productInfo) {
        // 商品コードを生成（簡易的に商品名の最初の文字を使用）
        const productCode = `PRD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const { data: newProduct, error: insertError } = await supabase
          .from('wholesale_products')
          .insert({
            product_name: productName,
            product_code: productCode,
            price: price || 0,
            is_active: true
          })
          .select()
          .single();

        if (insertError) {
          errors.push(`商品「${productName}」の登録に失敗しました`);
          continue;
        }

        productInfo = { id: newProduct.id, price: newProduct.price };
        productMap.set(productName, productInfo);
      }

      // マイナス値も正しく処理するように修正
      const actualQuantity = Number(quantity) || 0;
      const unitPrice = productInfo.price;
      const amount = actualQuantity * unitPrice;

      // 売上データを登録または更新
      const { error: upsertError } = await supabase
        .from('wholesale_sales')
        .upsert({
          product_id: productInfo.id,
          customer_id: null,
          sale_date: saleDate,
          quantity: actualQuantity,
          unit_price: unitPrice,
          amount: amount
        }, {
          onConflict: 'product_id,customer_id,sale_date'
        });

      if (upsertError) {
        // customer_idがNULLの場合の一意制約の問題を回避
        // 既存データを削除してから挿入
        const { error: deleteError } = await supabase
          .from('wholesale_sales')
          .delete()
          .eq('product_id', productInfo.id)
          .eq('sale_date', saleDate)
          .is('customer_id', null);

        if (!deleteError) {
          const { error: insertError } = await supabase
            .from('wholesale_sales')
            .insert({
              product_id: productInfo.id,
              customer_id: null,
              sale_date: saleDate,
              quantity: actualQuantity,
              unit_price: unitPrice,
              amount: amount
            });

          if (insertError) {
            errors.push(`${productName} ${saleDate}のデータ登録に失敗しました: ${insertError.message}`);
            continue;
          }
        } else {
          errors.push(`${productName} ${saleDate}のデータ更新に失敗しました: ${deleteError.message}`);
          continue;
        }
      }

      processed++;
    }

    return NextResponse.json({
      success: true,
      processed,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { success: false, error: 'インポート処理中にエラーが発生しました' },
      { status: 500 }
    );
  }
}
