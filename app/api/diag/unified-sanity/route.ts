import { NextResponse } from "next/server";
import { Pool } from "pg";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized:false }});

export async function GET(){
  try{
    const r = await pool.query(`
      with r as (
        select date_trunc('month', current_date - interval '12 months') as from_m,
               date_trunc('month', current_date) as to_m
      )
      select channel_code, month::date, sum(amount)::numeric as amt
      from kpi.kpi_sales_monthly_unified_v1, r
      where month between r.from_m and r.to_m
      group by 1,2
      order by 2,1;
    `);
    return NextResponse.json({ ok:true, rows:r.rows });
  }catch(e:any){
    return NextResponse.json({ ok:false, error:e?.message || String(e)}, { status:500 });
  }
}
