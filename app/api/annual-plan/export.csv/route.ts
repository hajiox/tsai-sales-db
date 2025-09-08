import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// --- DB ---
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
  return { startISO: start.toISOString().slice(0,10), endISO: end.toISOString().slice(0,10), fyLabel:`FY${fyStartYear + 1 - 2000}`, months };
}
function csvEscape(s: string){return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
function toNum(v:any){return typeof v==="string"?Number(v):(v??0);}

export async function GET() {
  try {
    const { startISO, endISO, fyLabel, months } = fyNow();

    const poolClient = await pool.connect();
    try {
      // 実績（当期）
      const curr = await poolClient.query(`
        select channel_code, date_trunc('month', fiscal_month)::date as m, sum(actual_amount_yen) as amt
        from kpi.kpi_sales_monthly_computed_v2
        where fiscal_month >= $1 and fiscal_month < $2
        group by 1,2
      `,[startISO, endISO]);

      // 前年
      const prev = await poolClient.query(`
        select channel_code, date_trunc('month', fiscal_month)::date as m, sum(actual_amount_yen) as amt
        from kpi.kpi_sales_monthly_computed_v2
        where fiscal_month >= ($1::date - interval '1 year') and fiscal_month < $1
        group by 1,2
      `,[startISO]);

      // 今年度目標（手入力）
      const targets = await poolClient.query(`
        select channel_code, month_date as m, target_amount_yen as amt
        from kpi.annual_targets_v1 where fiscal_year_start = $1
      `,[startISO]);

      const cm = new Map<string, number>(); curr.rows.forEach(r=>cm.set(`${r.channel_code}|${r.m.toISOString().slice(0,10)}`, toNum(r.amt)));
      const pm = new Map<string, number>(); prev.rows.forEach(r=>pm.set(`${r.channel_code}|${r.m.toISOString().slice(0,10)}`, toNum(r.amt)));
      const tm = new Map<string, number>(); targets.rows.forEach(r=>tm.set(`${r.channel_code}|${r.m.toISOString().slice(0,10)}`, toNum(r.amt)));

      const CHANNELS = ["SHOKU","STORE","WEB","WHOLESALE"];
      const LABELS: Record<string,string> = {
        SHOKU:"食のブランド館（道の駅）",
        STORE:"会津ブランド館（店舗）",
        WEB:"会津ブランド館（ネット販売）",
        WHOLESALE:"卸売上・OEM"
      };

      const header = ["category","row","total",...months.map(m=>m.slice(0,7))].join(",");
      const lines = [header];

      for (const code of CHANNELS) {
        const rowPrev:number[]=[]; const rowTgt:number[]=[]; const rowAct:number[]=[];
        let sumPrev=0, sumTgt=0, sumAct=0;
        for (const m of months) {
          const lastYear = new Date(m); lastYear.setUTCFullYear(lastYear.getUTCFullYear()-1);
          const prevK = `${code}|${lastYear.toISOString().slice(0,10)}`;
          const tgtK = `${code}|${m}`;
          const actK = `${code}|${m}`;
          const pv = pm.get(prevK)??0; const tv = tm.get(tgtK)??0; const av = cm.get(actK)??0;
          sumPrev+=pv; sumTgt+=tv; sumAct+=av;
          rowPrev.push(pv); rowTgt.push(tv); rowAct.push(av);
        }
        lines.push([csvEscape(LABELS[code]), "前年度実績", String(sumPrev), ...rowPrev.map(String)].join(","));
        lines.push([csvEscape(LABELS[code]), "今年度目標", String(sumTgt), ...rowTgt.map(String)].join(","));
        lines.push([csvEscape(LABELS[code]), "実績", String(sumAct), ...rowAct.map(String)].join(","));
      }

      const csv = lines.join("\n");
      const filename = `annual_plan_${fyLabel}.csv`;
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      poolClient.release();
    }
  } catch (e: any) {
    // テーブル未作成などもここでキャッチ（ビルド時に失敗させない）
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status: 500 });
  }
}
