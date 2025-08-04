// /app/api/food_product_master/route.ts ver.1
import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const searchParams = request.nextUrl.searchParams
    const janCode = searchParams.get('jan_code')
    const categoryId = searchParams.get('category_id')

    let query = supabase.from('food_product_master').select('*')
    
    if (janCode) {
      query = query.eq('jan_code', janCode)
    }
    if (categoryId) {
      query = query.eq('category_id', categoryId)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const body = await request.json()

    const { data, error } = await supabase
      .from('food_product_master')
      .upsert(body, { onConflict: 'jan_code' })
      .select()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
