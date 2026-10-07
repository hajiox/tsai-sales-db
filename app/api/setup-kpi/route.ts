import { requireRecipeAdminRequest } from "@/lib/recipe-request-auth";

import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET() {
  return NextResponse.json({ error: "Use an authenticated same-origin POST request" }, {
    status: 405, headers: { Allow: "POST" },
  });
}

export async function POST(request: Request) {
  const authError = await requireRecipeAdminRequest(request);
  if (authError) return authError;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 0. Ensure Table Exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS kpi_manual_entries_v1 (
        id BIGSERIAL PRIMARY KEY,
        metric text NOT NULL,
        channel_code text NOT NULL,
        month date NOT NULL,
        amount numeric DEFAULT 0,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        UNIQUE(metric, channel_code, month)
      );
    `);
    await client.query(`
      CREATE OR REPLACE FUNCTION public.get_web_sales_monthly(start_date text, end_date text)
      RETURNS TABLE (
        month text,
        amount numeric
      ) AS $$
      BEGIN
        IF coalesce(auth.jwt()->>'role', '') <> 'service_role'
           AND coalesce(lower(auth.jwt()->>'email'), '') <> 'aizubrandhall@gmail.com' THEN
          RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
        END IF;
        RETURN QUERY
        SELECT 
          to_char(s.report_month, 'YYYY-MM-01')::text as month,
          CASE WHEN COUNT(*) FILTER (WHERE (
            public.web_sales_reported_amount(s.amazon_count,s.amazon_amount) +
            public.web_sales_reported_amount(s.rakuten_count,s.rakuten_amount) +
            public.web_sales_reported_amount(s.yahoo_count,s.yahoo_amount) +
            public.web_sales_reported_amount(s.mercari_count,s.mercari_amount) +
            public.web_sales_reported_amount(s.base_count,s.base_amount) +
            public.web_sales_reported_amount(s.qoo10_count,s.qoo10_amount) +
            public.web_sales_reported_amount(s.tiktok_count,s.tiktok_amount)
          ) IS NULL) > 0 THEN NULL::numeric ELSE COALESCE(SUM(
            public.web_sales_reported_amount(s.amazon_count,s.amazon_amount) +
            public.web_sales_reported_amount(s.rakuten_count,s.rakuten_amount) +
            public.web_sales_reported_amount(s.yahoo_count,s.yahoo_amount) +
            public.web_sales_reported_amount(s.mercari_count,s.mercari_amount) +
            public.web_sales_reported_amount(s.base_count,s.base_amount) +
            public.web_sales_reported_amount(s.qoo10_count,s.qoo10_amount) +
            public.web_sales_reported_amount(s.tiktok_count,s.tiktok_amount)
          ),0)::numeric END as amount
        FROM public.web_sales_summary s
        JOIN public.products p ON s.product_id = p.id
        WHERE s.report_month >= CAST(start_date AS DATE) AND s.report_month < CAST(end_date AS DATE)
        GROUP BY month;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
      REVOKE EXECUTE ON FUNCTION public.get_web_sales_monthly(text,text) FROM PUBLIC, anon;
      GRANT EXECUTE ON FUNCTION public.get_web_sales_monthly(text,text) TO authenticated, service_role;
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
      $$ LANGUAGE plpgsql SECURITY DEFINER;
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
      $$ LANGUAGE plpgsql SECURITY DEFINER;
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
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `);

    // 5. Manual Entries Fetching (Targets & Acquisitions)
    await client.query(`
      CREATE OR REPLACE FUNCTION get_kpi_manual_entries(start_date text, end_date text)
      RETURNS TABLE (
        metric text,
        channel_code text,
        month text,
        amount numeric
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          k.metric,
          k.channel_code,
          to_char(k.month, 'YYYY-MM-01')::text as month,
          COALESCE(k.amount, 0)::numeric as amount
        FROM kpi_manual_entries_v1 k
        WHERE k.month >= CAST(start_date AS DATE) 
          AND k.month < CAST(end_date AS DATE);
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
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
