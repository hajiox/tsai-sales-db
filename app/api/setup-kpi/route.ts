
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Web Sales Aggregation Function
    // Need to handle potential huge joins efficiently.
    await client.query(`
      CREATE OR REPLACE FUNCTION get_web_sales_monthly(start_date text, end_date text)
      RETURNS TABLE (
        month text,
        amount numeric
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          to_char(s.report_month, 'YYYY-MM-01')::text as month,
          COALESCE(SUM(
            (COALESCE(s.amazon_count, 0) + 
             COALESCE(s.rakuten_count, 0) + 
             COALESCE(s.yahoo_count, 0) + 
             COALESCE(s.mercari_count, 0) + 
             COALESCE(s.base_count, 0) + 
             COALESCE(s.qoo10_count, 0) + 
             COALESCE(s.tiktok_count, 0)) * COALESCE(p.price, 0)
          ), 0)::numeric as amount
        FROM web_sales_summary s
        JOIN products p ON s.product_id = p.id
        WHERE s.report_month >= CAST(start_date AS DATE) AND s.report_month < CAST(end_date AS DATE)
        GROUP BY month;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 2. Wholesale Aggregation Function
    await client.query(`
      CREATE OR REPLACE FUNCTION get_wholesale_sales_monthly(start_date text, end_date text)
      RETURNS TABLE (
        month text,
        amount numeric
      ) AS $$
      BEGIN
        RETURN QUERY
        WITH wholesale AS (
          SELECT 
            to_char(sale_date, 'YYYY-MM-01') as m,
            SUM(quantity * unit_price) as a
          FROM wholesale_sales
          WHERE sale_date >= CAST(start_date AS DATE) AND sale_date < CAST(end_date AS DATE)
          GROUP BY m
        ),
        oem AS (
          SELECT 
            to_char(sale_date, 'YYYY-MM-01') as m,
            SUM(oem_sales.amount) as a 
          FROM oem_sales
          WHERE sale_date >= CAST(start_date AS DATE) AND sale_date < CAST(end_date AS DATE)
          GROUP BY m
        )
        SELECT 
          COALESCE(w.m, o.m)::text as month,
          (COALESCE(w.a, 0) + COALESCE(o.a, 0))::numeric as amount
        FROM wholesale w
        FULL OUTER JOIN oem o ON w.m = o.m;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 3. Store Aggregation Function
    await client.query(`
      CREATE OR REPLACE FUNCTION get_store_sales_monthly(start_date text, end_date text)
      RETURNS TABLE (
        month text,
        amount numeric
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          to_char(b.report_month, 'YYYY-MM-01')::text as month,
          (COALESCE(SUM(b.total_sales), 0) + 
          COALESCE((
            SELECT SUM(a.adjustment_amount)
            FROM brand_store_sales_adjustments a
            WHERE a.report_month = b.report_month
          ), 0))::numeric as amount
        FROM brand_store_sales b
        WHERE b.report_month >= CAST(start_date AS DATE) AND b.report_month < CAST(end_date AS DATE)
        GROUP BY b.report_month;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 4. Food Store Aggregation
    await client.query(`
      CREATE OR REPLACE FUNCTION get_shoku_sales_monthly(start_date text, end_date text)
      RETURNS TABLE (
        month text,
        amount numeric
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          to_char(report_month, 'YYYY-MM-01')::text as month,
          COALESCE(SUM(total_sales), 0)::numeric as amount
        FROM food_store_sales
        WHERE report_month >= CAST(start_date AS DATE) AND report_month < CAST(end_date AS DATE)
        GROUP BY report_month;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query('COMMIT');
    return NextResponse.json({ success: true, message: 'RPC functions created' });
  } catch (error: any) {
    await client.query('ROLLBACK');
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}
