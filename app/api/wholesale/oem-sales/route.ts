// /app/api/wholesale/oem-sales/route.ts ver.3 RLSバイパス対応
export const dynamic = 'force-dynamic';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (() => { throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set"); })();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? (() => { throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set"); })();
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function normalizeSaleAmount<T extends { quantity?: any; unit_price?: any; amount?: any }>(sale: T): T {
  const quantity = Number(sale.quantity || 0);
  const unitPrice = Number(sale.unit_price || 0);
  const calculatedAmount = quantity * unitPrice;

  return {
    ...sale,
    quantity,
    unit_price: unitPrice,
    amount: Number.isFinite(calculatedAmount) && (quantity !== 0 || unitPrice !== 0)
      ? calculatedAmount
      : Number(sale.amount || 0)
  };
}

async function getCurrentProductPrice(productId: string, fallbackPrice: any) {
  const { data: wholesaleProduct } = await supabase
    .from("wholesale_products")
    .select("price")
    .eq("id", productId)
    .maybeSingle();

  if (wholesaleProduct?.price !== null && wholesaleProduct?.price !== undefined) {
    return Number(wholesaleProduct.price || 0);
  }

  const { data: oemProduct } = await supabase
    .from("oem_products")
    .select("price")
    .eq("id", productId)
    .maybeSingle();

  if (oemProduct?.price !== null && oemProduct?.price !== undefined) {
    return Number(oemProduct.price || 0);
  }

  return Number(fallbackPrice || 0);
}

async function ensureOemProductMirror(productId: string) {
  const { data: wholesaleProduct, error: wholesaleError } = await supabase
    .from("wholesale_products")
    .select("id, product_code, product_name, price, is_active")
    .eq("id", productId)
    .eq("product_type", "OEM")
    .maybeSingle();

  if (wholesaleError) throw wholesaleError;
  if (!wholesaleProduct) return;

  const payload = {
    id: wholesaleProduct.id,
    product_code: wholesaleProduct.product_code || `OEM-${wholesaleProduct.id.slice(0, 8)}`,
    product_name: wholesaleProduct.product_name,
    price: Number(wholesaleProduct.price || 0),
    is_active: wholesaleProduct.is_active !== false,
  };

  const { data: existing, error: existingError } = await supabase
    .from("oem_products")
    .select("id")
    .eq("id", productId)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    const { error } = await supabase
      .from("oem_products")
      .update(payload)
      .eq("id", productId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("oem_products")
    .insert([payload]);
  if (!error) return;

  const { error: fallbackError } = await supabase
    .from("oem_products")
    .insert([{ ...payload, product_code: `${payload.product_code}-${Date.now().toString(36).slice(-4)}` }]);
  if (fallbackError) throw fallbackError;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");

    if (!month) {
      return NextResponse.json({
        error: "月の指定が必要です"
      }, { status: 400 });
    }

    const startDate = `${month}-01`;
    const endDate = new Date(new Date(startDate).getFullYear(), new Date(startDate).getMonth() + 1, 0)
      .toISOString()
      .split('T')[0];

    const { data: sales, error } = await supabase
      .from("oem_sales")
      .select(`*`)
      .gte("sale_date", startDate)
      .lte("sale_date", endDate)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("OEM売上データ取得エラー:", error);
      return NextResponse.json({
        error: "データ取得に失敗しました"
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      sales: (sales || []).map(normalizeSaleAmount)
    });
  } catch (error) {
    console.error("サーバーエラー:", error);
    return NextResponse.json({
      error: "サーバーエラーが発生しました"
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // フロントエンドはcamelCase、旧APIはsnake_caseで送信 — 両方対応
    const product_id = body.product_id || body.productId;
    const customer_id = body.customer_id || body.customerId;
    const sale_date = body.sale_date || body.saleDate;
    const quantity = body.quantity;
    const requestedUnitPrice = body.unit_price || body.unitPrice;

    if (!product_id || !customer_id || !sale_date || !quantity) {
      return NextResponse.json({
        error: "必須項目が不足しています"
      }, { status: 400 });
    }

    const currentUnitPrice = await getCurrentProductPrice(product_id, requestedUnitPrice);
    const unit_price = currentUnitPrice;
    const amount = Number(quantity || 0) * Number(unit_price || 0);

    if (!unit_price) {
      return NextResponse.json({ error: "OEM商品マスターの単価が取得できませんでした" }, { status: 400 });
    }

    await ensureOemProductMirror(product_id);

    const { data, error } = await supabase.rpc('upsert_oem_sale', {
      p_product_id: product_id,
      p_customer_id: customer_id,
      p_sale_date: sale_date,
      p_quantity: quantity,
      p_unit_price: unit_price
    });

    if (error) {
      console.error("OEM売上データ保存エラー(RPC):", error);
      return NextResponse.json({ error: error.message || "データ保存に失敗しました" }, { status: 500 });
    }

    const savedSale = Array.isArray(data) ? data[0] : data;
    if (savedSale?.id && Number.isFinite(amount)) {
      const { data: fixedSale, error: fixError } = await supabase
        .from("oem_sales")
        .update({ amount })
        .eq("id", savedSale.id)
        .select()
        .single();

      if (fixError) {
        console.warn("OEM売上amount補正スキップ:", fixError.message);
      }

      return NextResponse.json({ success: true, sale: fixedSale ? normalizeSaleAmount(fixedSale) : normalizeSaleAmount(savedSale) });
    }

    if (Number.isFinite(amount)) {
      await supabase
        .from("oem_sales")
        .update({ amount })
        .eq("product_id", product_id)
        .eq("customer_id", customer_id)
        .eq("sale_date", sale_date);
    }

    return NextResponse.json({ success: true, sale: savedSale ? normalizeSaleAmount(savedSale) : data });
  } catch (error) {
    console.error("サーバーエラー:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "IDが指定されていません" }, { status: 400 });
    }

    const { error } = await supabase
      .from("oem_sales")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("OEM売上データ削除エラー:", error);
      return NextResponse.json({ error: "データ削除に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("サーバーエラー:", error);
    return NextResponse.json({ error: "サーバーエラーが発生しました" }, { status: 500 });
  }
}
