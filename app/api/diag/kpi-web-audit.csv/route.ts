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
  return { startISO: start.toISOString().slice(0,10), endISO: end.toISOString().slice(0,10), months };
}
function ym(s:string){return s.slice(0,7);} 
function csv(s:string){return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}

export async function GET() {
  const { startISO, endISO, months } = fyNow();
  const sql = `
    with base as (
      select date_trunc('month', fiscal_month)::date as m,
             channel_code as raw_channel,
             upper(btrim(channel_code)) as norm_channel,
             sum(actual_amount_yen) as amt
      from kpi.kpi_sales_monthly_computed_v2
      where fiscal_month >= $1 and fiscal_month < $2
      group by 1,2,3
    )
    select * from base order by m asc, norm_channel asc
  `;
  const { rows } = await pool.query(sql, [startISO, endISO]);

  const set = new Set<string>();
  rows.forEach(r => set.add(r.norm_channel||"(null)"));
  const chs = Array.from(set).sort();

  const header = ["month", ...chs, "TOTAL"].join(",");
  const map = new Map<string, Record<string, number>>();
  months.map(ym).forEach(m => map.set(m, {}));
  rows.forEach((r:any)=>{
    const m = ym(r.m.toISOString().slice(0,10));
    const ch = r.norm_channel || "(null)";
    const v = Number(r.amt)||0;
    const row = map.get(m)!;
    row[ch] = (row[ch] ?? 0) + v;
    row["TOTAL"] = (row["TOTAL"] ?? 0) + v;
  });

  const lines = [header];
  months.map(ym).forEach(m=>{
    const row = map.get(m)!;
    lines.push([m, ...chs.map(c=>String(row[c]??0)), String(row["TOTAL"]??0)].join(","));
  });

  const csvText = lines.join("\n");
  return new NextResponse(csvText, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kpi_web_audit.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
