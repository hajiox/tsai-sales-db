// /app/api/wholesale/oem-sales/search/route.ts
// OEM売上実績の横断検索API
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: Request) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    // OEM売上を商品・顧客情報付きで取得
    let dbQuery = supabase
      .from('oem_sales')
      .select(`
        id, sale_date, quantity, unit_price, amount,
        product_id,
        customer_id
      `)
      .order('sale_date', { ascending: false })
      .limit(limit * 3); // 多めに取得してフィルタリング

    const { data: sales, error } = await dbQuery;
    if (error) throw error;

    // 商品マスタ取得
    const { data: products } = await supabase
      .from('wholesale_products')
      .select('id, product_name, product_code, price')
      .eq('product_type', 'OEM');

    // 顧客マスタ取得
    const { data: customers } = await supabase
      .from('oem_customers')
      .select('id, customer_name, customer_code');

    const productMap = new Map((products || []).map(p => [p.id, p]));
    const customerMap = new Map((customers || []).map(c => [c.id, c]));

    // JOINして結果を組み立て
    let results = (sales || []).map(sale => {
      const product = productMap.get(sale.product_id);
      const customer = customerMap.get(sale.customer_id);
      return {
        id: sale.id,
        sale_date: sale.sale_date,
        quantity: sale.quantity,
        unit_price: sale.unit_price,
        amount: sale.amount,
        product_name: product?.product_name || '不明',
        product_code: product?.product_code || '',
        customer_name: customer?.customer_name || '不明',
        customer_code: customer?.customer_code || '',
      };
    });

    // テキスト検索フィルタリング
    if (query.trim()) {
      const terms = query.trim().toLowerCase().split(/\s+/);
      results = results.filter(r => {
        const searchText = [
          r.product_name,
          r.product_code,
          r.customer_name,
          r.customer_code,
          r.sale_date,
          `¥${r.amount.toLocaleString()}`,
          String(r.amount),
          String(r.quantity),
        ].join(' ').toLowerCase();
        return terms.every(term => searchText.includes(term));
      });
    }

    // 件数制限
    results = results.slice(0, limit);

    // 集計情報
    const totalAmount = results.reduce((sum, r) => sum + r.amount, 0);
    const totalQuantity = results.reduce((sum, r) => sum + r.quantity, 0);

    return NextResponse.json({
      success: true,
      results,
      summary: {
        count: results.length,
        totalAmount,
        totalQuantity,
      }
    });
  } catch (error: any) {
    console.error('OEM検索エラー:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
