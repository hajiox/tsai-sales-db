import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function fyNow() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const fyStartYear = m >= 8 ? y : y - 1;
  const start = new Date(Date.UTC(fyStartYear, 7, 1));
  const end = new Date(Date.UTC(fyStartYear + 1, 7, 1));
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    months.push(d.toISOString().slice(0, 10));
  }
  return { startISO: start.toISOString().slice(0,10), endISO: end.toISOString().slice(0,10), months, label:`FY${fyStartYear+1-2000}` };
}
function ym(s:string){return s.slice(0,7);} 
function toNum(v:any){return typeof v==="string"?Number(v):(v??0);} 

function reclass(norm: string): "WEB"|"WHOLESALE"|"STORE"|"SHOKU"|"OTHER" {
  const n = (norm || "").toUpperCase();
  if (n === "WEB" || n === "WHOLESALE" || n === "STORE" || n === "SHOKU") return n as any;
  // WEB 推測
  if (/(^|[^A-Z])(WEB|EC|NET|ONLINE|ＷＥＢ|ＥＣ)([^A-Z]|$)/.test(n)) return "WEB";
  return "OTHER";
}

export async function GET() {
  try {
    const { startISO, endISO, months, label } = fyNow();
    const sql = `
      select date_trunc('month', fiscal_month)::date as m,
             upper(btrim(channel_code)) as norm_channel,
             sum(actual_amount_yen) as amt
      from kpi.kpi_sales_monthly_computed_v2
      where fiscal_month >= $1 and fiscal_month < $2
      group by 1,2
      order by 1,2
    `;
    const { rows } = await pool.query(sql, [startISO, endISO]);

    const pivot: Record<string, Record<string, number>> = {};
    const perMonthTotal: Record<string, number> = {};
    for (const r of rows as any[]) {
      const m = ym(r.m.toISOString().slice(0,10));
      const klass = reclass(r.norm_channel || "");
      const amt = toNum(r.amt);
      const row = (pivot[m] ||= {});
      row[klass] = (row[klass] ?? 0) + amt;
      perMonthTotal[m] = (perMonthTotal[m] ?? 0) + amt;
    }

    return NextResponse.json({
      ok:true,
      fy:{ label, startISO, endISO },
      months: months.map(ym),
      pivot,
      perMonthTotal
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status:500 });
  }
}
