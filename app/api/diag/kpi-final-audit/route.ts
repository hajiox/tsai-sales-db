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

// 会計年度=8月開始
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
  return { startISO: start.toISOString().slice(0,10), endISO: end.toISOString().slice(0,10), months, label: `FY${fyStartYear + 1 - 2000}` };
}
const ym = (s:string)=>s.slice(0,7);
const toNum = (v:any)=> typeof v==="string" ? Number(v) : (v ?? 0);

export async function GET() {
  try {
    const { startISO, endISO, months, label } = fyNow();

    const CANON = ["WEB","WHOLESALE","STORE","SHOKU"];

    // final_v1 をそのまま集計（表記ゆれ検知のため raw と UPPER(TRIM) 両方持つ）
    const sql = `
      with base as (
        select
          date_trunc('month', fiscal_month)::date as m,
          channel_code as raw_channel,
          upper(btrim(channel_code)) as norm_channel,
          sum(actual_amount_yen) as amt
        from kpi.kpi_sales_monthly_final_v1
        where fiscal_month >= $1 and fiscal_month < $2
        group by 1,2,3
      )
      select * from base order by m asc, norm_channel asc
    `;
    const { rows } = await pool.query(sql, [startISO, endISO]);

    const pivot: Record<string, Record<string, number>> = {};
    const perMonthTotal: Record<string, number> = {};
    const unknownByMonth: Record<string, Array<{raw:string; norm:string; amt:number}>> = {};
    const channelStats: Record<string, {sum:number; first?:string; last?:string; raw:Set<string>}> = {};

    for (const r of rows as any[]) {
      const m = ym(r.m.toISOString().slice(0,10));
      const norm = r.norm_channel || "(null)";
      const raw = String(r.raw_channel ?? "");
      const amt = toNum(r.amt);

      (pivot[m] ||= {})[norm] = (pivot[m]?.[norm] ?? 0) + amt;
      perMonthTotal[m] = (perMonthTotal[m] ?? 0) + amt;

      (channelStats[norm] ||= {sum:0, raw:new Set<string>()}).sum += amt;
      channelStats[norm].first = channelStats[norm].first ?? m;
      channelStats[norm].last = m;
      if (raw) channelStats[norm].raw.add(raw);

      if (!CANON.includes(norm)) {
        (unknownByMonth[m] ||= []).push({ raw, norm, amt });
      }
    }

    const webZeroMonths: string[] = [];
    months.map(ym).forEach(m=>{
      const web = pivot[m]?.["WEB"] ?? 0;
      const tot = perMonthTotal[m] ?? 0;
      if (web === 0 && tot > 0) webZeroMonths.push(m);
    });

    return NextResponse.json({
      ok:true,
      fy:{ label, startISO, endISO },
      months: months.map(ym),
      pivot,
      perMonthTotal,
      webZeroMonths,
      canon: CANON,
      channelStats: Object.entries(channelStats).map(([norm,stat])=>({
        norm, sum: stat.sum, first: stat.first, last: stat.last, rawVariants: Array.from(stat.raw)
      })),
      unknownByMonth
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status:500 });
  }
}
