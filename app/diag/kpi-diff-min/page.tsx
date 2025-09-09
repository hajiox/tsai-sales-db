import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const JPY = (n:number)=>new Intl.NumberFormat("ja-JP",{style:"currency",currency:"JPY",maximumFractionDigits:0}).format(n||0);
const CHS = ["WEB","WHOLESALE","STORE","SHOKU","OTHER"] as const;
const CANON = new Set(CHS);

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }});

const ym = (s:string)=>s.slice(0,7);
const toNum = (v:any)=> typeof v==="string" ? Number(v) : (v ?? 0);
const klass = (norm:string)=> {
  const n = (norm||"").toUpperCase().trim();
  return CANON.has(n as any) ? (n as typeof CHS[number]) : "OTHER";
};

function fyNow(){
  const now=new Date(); const y=now.getUTCFullYear(); const m=now.getUTCMonth()+1;
  const fyStartYear = m>=8 ? y : y-1;
  const start = new Date(Date.UTC(fyStartYear,7,1));
  const end   = new Date(Date.UTC(fyStartYear+1,7,1));
  const months:string[]=[]; for(let i=0;i<12;i++){ const d=new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth()+i,1)); months.push(d.toISOString().slice(0,10)); }
  return { fy:`FY${fyStartYear+1-2000}`, startISO:start.toISOString().slice(0,10), endISO:end.toISOString().slice(0,10), monthsYM: months.map(ym) };
}

async function pivot(table:string, a:string, b:string){
  const sql = `
    select date_trunc('month', fiscal_month)::date as m,
           upper(btrim(channel_code)) as norm_channel,
           sum(actual_amount_yen) as amt
    from ${table}
    where fiscal_month >= $1 and fiscal_month < $2
    group by 1,2
  `;
  const { rows } = await pool.query(sql,[a,b]);
  const p:Record<string,Record<string,number>> = {};
  for(const r of rows as any[]){
    const k = ym(r.m.toISOString().slice(0,10));
    const ch = klass(r.norm_channel);
    const v = toNum(r.amt);
    (p[k] ||= {}); p[k][ch] = (p[k][ch] ?? 0) + v;
  }
  return p;
}

export default async function Page(){
  try{
    const { fy, startISO, endISO, monthsYM } = fyNow();
    const [pf, pc] = await Promise.all([
      pivot("kpi.kpi_sales_monthly_final_v1", startISO, endISO),
      pivot("kpi.kpi_sales_monthly_computed_v2", startISO, endISO),
    ]);

    // delta
    const delta:Record<string,Record<string,number>> = {};
    for(const m of monthsYM){
      const row:Record<string,number> = {};
      for(const ch of CHS){
        const v = (pf[m]?.[ch] ?? 0) - (pc[m]?.[ch] ?? 0);
        if(v!==0) row[ch]=v;
      }
      const tf = Object.values(pf[m]||{}).reduce((s,n)=>s+n,0);
      const tc = Object.values(pc[m]||{}).reduce((s,n)=>s+n,0);
      if(tf!==tc) row["TOTAL"]=tf-tc;
      delta[m]=row;
    }

    return (
      <main className="p-6 space-y-6">
        <h1 className="text-2xl font-semibold">final vs computed 差分（{fy}）</h1>
        <div className="overflow-x-auto rounded-2xl border">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-3 py-2 text-left w-[120px]">month</th>
                {CHS.map(c=><th key={c} className="px-3 py-2 text-right">{c}</th>)}
                <th className="px-3 py-2 text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {monthsYM.map(m=>{
                const row = delta[m] || {};
                return (
                  <tr key={m} className="border-t">
                    <td className="px-3 py-2 font-medium">{m}</td>
                    {CHS.map(c=>{
                      const v = row[c as any] ?? 0;
                      return <td key={`${m}-${c}`} className={`px-3 py-2 text-right ${v!==0?"font-semibold text-red-600":""}`}>{v!==0? JPY(v): "—"}</td>;
                    })}
                    <td className={`px-3 py-2 text-right ${row["TOTAL"]? "font-semibold text-red-600":""}`}>{row["TOTAL"]? JPY(row["TOTAL"]): "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    );
  }catch(e:any){
    return (
      <main className="p-6">
        <h1 className="text-2xl font-semibold">final vs computed 差分</h1>
        <p className="text-sm text-red-600">エラー：{e?.message || String(e)}</p>
      </main>
    );
  }
}

