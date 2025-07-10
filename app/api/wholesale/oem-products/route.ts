// /app/api/wholesale/oem-products/route.ts ver.1 OEM商品CRUD対応
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('oem_products')
      .select('*')
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching OEM products:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { product_code, product_name, price } = body

    // 最大のdisplay_orderを取得
    const { data: maxOrderData } = await supabase
      .from('oem_products')
      .select('display_order')
      .order('display_order', { ascending: false })
      .limit(1)

    const nextOrder = maxOrderData && maxOrderData[0]?.display_order 
      ? maxOrderData[0].display_order + 1 
      : 1

    const { data, error } = await supabase
      .from('oem_products')
      .insert({
        product_code,
        product_name,
        price,
        display_order: nextOrder
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating OEM product:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
