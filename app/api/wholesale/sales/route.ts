// /app/api/wholesale/sales/route.ts ver.3
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    
    if (type === 'summary') {
      // 現在の月と前月を計算
      const now = new Date();
      const currentMonth = now.toISOString().slice(0, 7);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
      
      // 今月の売上合計
      const { data: currentSales, error: currentError } = await supabase
        .from('wholesale_sales')
        .select('amount')
        .gte('sale_date', `${currentMonth}-01`)
        .lte('sale_date', `${currentMonth}-31`);
      
      if (currentError) throw currentError;
      
      const currentTotal = currentSales?.reduce((sum, sale) => sum + sale.amount, 0) || 0;
      
      // 前月の売上合計
      const { data: lastSales, error: lastError } = await supabase
        .from('wholesale_sales')
        .select('amount')
        .gte('sale_date', `${lastMonth}-01`)
        .lte('sale_date', `${lastMonth}-31`);
      
      if (lastError) throw lastError;
      
      const lastTotal = lastSales?.reduce((sum, sale) => sum + sale.amount, 0) || 0;
      
      // 前月比計算
      const monthOverMonth = lastTotal > 0 
        ? ((currentTotal - lastTotal) / lastTotal) * 100 
        : 0;
      
      return NextResponse.json({
        currentMonthSales: currentTotal,
        lastMonthSales: lastTotal,
        monthOverMonth: Math.round(monthOverMonth * 10) / 10
      });
      
    } else if (type === 'ranking') {
      // 現在の月を取得
      const currentMonth = new Date().toISOString().slice(0, 7);
      const lastMonth = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 7);
      
      // 商品マスタを取得（display_order順）
      const { data: products, error: productsError } = await supabase
        .from('wholesale_products')
        .select('*')
        .order('display_order', { ascending: true });
      
      if (productsError) throw productsError;
      
      // 今月の売上データを取得
      const { data: currentSales, error: currentError } = await supabase
        .from('wholesale_sales')
        .select('product_id, quantity, amount')
        .gte('sale_date', `${currentMonth}-01`)
        .lte('sale_date', `${currentMonth}-31`);
      
      if (currentError) throw currentError;
      
      // 前月の売上データを取得
      const { data: lastSales, error: lastError } = await supabase
        .from('wholesale_sales')
        .select('product_id, quantity')
        .gte('sale_date', `${lastMonth}-01`)
        .lte('sale_date', `${lastMonth}-31`);
      
      if (lastError) throw lastError;
      
      // 商品ごとに集計
      const productSalesMap = new Map();
      const lastMonthMap = new Map();
      
      // 前月のデータを集計
      lastSales?.forEach(sale => {
        const current = lastMonthMap.get(sale.product_id) || 0;
        lastMonthMap.set(sale.product_id, current + sale.quantity);
      });
      
      // 今月のデータを集計
      currentSales?.forEach(sale => {
        const current = productSalesMap.get(sale.product_id) || { quantity: 0, amount: 0 };
        productSalesMap.set(sale.product_id, {
          quantity: current.quantity + sale.quantity,
          amount: current.amount + sale.amount
        });
      });
      
      // 商品情報と売上データを結合
      const productSales = products?.map(product => {
        const salesData = productSalesMap.get(product.id) || { quantity: 0, amount: 0 };
        const lastMonthQuantity = lastMonthMap.get(product.id) || 0;
        const growth = lastMonthQuantity > 0 
          ? ((salesData.quantity - lastMonthQuantity) / lastMonthQuantity) * 100
          : salesData.quantity > 0 ? 100 : 0;
        
        return {
          ...product,
          totalQuantity: salesData.quantity,
          totalAmount: salesData.amount,
          lastMonthQuantity,
          growth: Math.round(growth * 10) / 10
        };
      }) || [];
      
      // ランキングデータの作成
      const salesRanking = [...productSales]
        .filter(p => p.totalQuantity > 0)
        .sort((a, b) => b.totalQuantity - a.totalQuantity);
      
      const topProducts = salesRanking.slice(0, 10);
      const bottomProducts = salesRanking.slice(-5).reverse();
      
      const growthRanking = [...productSales]
        .filter(p => p.growth > 0)
        .sort((a, b) => b.growth - a.growth)
        .slice(0, 5);
      
      return NextResponse.json({
        topProducts,
        bottomProducts,
        growthProducts: growthRanking
      });
    }
    
    // デフォルトは全売上データを返す
    const { data: sales, error } = await supabase
      .from('wholesale_sales')
      .select('*')
      .order('sale_date', { ascending: false });
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ sales });
  } catch (error) {
    return NextResponse.json(
      { error: '売上データの取得に失敗しました' },
      { status: 500 }
    );
  }
}
