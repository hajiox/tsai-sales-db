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

function fyNow(){
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
  return { startISO:start.toISOString().slice(0,10), endISO:end.toISOString().slice(0,10), months, label:`FY${fyStartYear+1-2000}`};
}
const ym = (s:string)=>s.slice(0,7);
const toNum = (v:any)=> typeof v==="string" ? Number(v) : (v ?? 0);
const CANON = ["WEB","WHOLESALE","STORE","SHOKU"];
function klass(norm:string){ const n=(norm||"").toUpperCase().trim(); return CANON.includes(n)?n:"OTHER"; }

export async function GET(){
  try{
    const { startISO, endISO, months, label } = fyNow();

    const sql = (table:string)=>`
      select date_trunc('month', fiscal_month)::date as m,
             upper(btrim(channel_code)) as norm_channel,
             sum(actual_amount_yen) as amt
      from ${table}
      where fiscal_month >= $1 and fiscal_month < $2
      group by 1,2
      order by 1,2
    `;

    const [fin, comp] = await Promise.all([
      pool.query(sql("kpi.kpi_sales_monthly_final_v1"), [startISO, endISO]),
      pool.query(sql("kpi.kpi_sales_monthly_computed_v2"), [startISO, endISO]),
    ]);

    // pivot 作成（final / computed）
    const makePivot = (rows:any[])=>{
      const p: Record<string, Record<string, number>> = {};
      for(const r of rows){
        const m = ym(r.m.toISOString().slice(0,10));
        const ch = klass(r.norm_channel);
        const amt = toNum(r.amt);
        (p[m] ||= {})[ch] = (p[m]?.[ch] ?? 0) + amt;
      }
      return p;
    };
    const pf = makePivot(fin.rows as any[]);
    const pc = makePivot(comp.rows as any[]);

    // delta = final - computed
    const delta: Record<string, Record<string, number>> = {};
    const monthsYM = months.map(ym);
    const allCh = ["WEB","WHOLESALE","STORE","SHOKU","OTHER"];

    for(const m of monthsYM){
      delta[m] = {};
      for(const ch of allCh){
        const v = (pf[m]?.[ch] ?? 0) - (pc[m]?.[ch] ?? 0);
        if (v !== 0) delta[m][ch] = v;
      }
      const totV = (Object.values(pf[m]||{}).reduce((s,n)=>s+n,0)) - (Object.values(pc[m]||{}).reduce((s,n)=>s+n,0));
      if (totV !== 0) delta[m]["TOTAL"] = totV;
    }

    return NextResponse.json({ ok:true, fy:{label}, months: monthsYM, final: pf, computed: pc, delta });
  }catch(e:any){
    return NextResponse.json({ ok:false, error:e?.message || String(e) }, { status:500 });
  }
}
