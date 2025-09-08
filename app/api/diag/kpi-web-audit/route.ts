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
  const label = `FY${fyStartYear + 1 - 2000}`;
  return { startISO: start.toISOString().slice(0,10), endISO: end.toISOString().slice(0,10), months, label };
}

function ym(s: string){ return s.slice(0,7); }
function toNum(v:any){ return typeof v==="string" ? Number(v) : (v ?? 0); }

export async function GET() {
  try {
    const { startISO, endISO, months, label } = fyNow();

    // 正規チャネル定義
    const CANON = ["WEB","WHOLESALE","STORE","SHOKU"];

    // 月×チャネル（raw / 正規化視点の両方）を集計
    const sql = `
      with base as (
        select
          date_trunc('month', fiscal_month)::date as m,
          channel_code as raw_channel,
          upper(btrim(channel_code)) as norm_channel,
          sum(actual_amount_yen) as amt
        from kpi.kpi_sales_monthly_computed_v2
        where fiscal_month >= $1 and fiscal_month < $2
        group by 1,2,3
      )
      select * from base
      order by m asc, norm_channel asc
    `;
    const { rows } = await pool.query(sql, [startISO, endISO]);

    // pivot: { ym: { channel: amt, TOTAL } }
    const pivot: Record<string, Record<string, number>> = {};
    const perMonthTotal: Record<string, number> = {};
    const unknownByMonth: Record<string, Array<{raw:string; norm:string; amt:number}>> = {};
    const channelStats: Record<string, {sum:number; first?:string; last?:string; rawVariants:Set<string>}> = {};

    for (const r of rows as any[]) {
      const key = ym(r.m.toISOString().slice(0,10));
      const ch = r.norm_channel || "(null)";
      const amt = toNum(r.amt);

      if (!pivot[key]) pivot[key] = {};
      pivot[key][ch] = (pivot[key][ch] ?? 0) + amt;
      perMonthTotal[key] = (perMonthTotal[key] ?? 0) + amt;

      if (!channelStats[ch]) channelStats[ch] = { sum:0, rawVariants:new Set<string>() };
      channelStats[ch].sum += amt;
      channelStats[ch].first = channelStats[ch].first ?? key;
      channelStats[ch].last = key;
      if (r.raw_channel != null) channelStats[ch].rawVariants.add(String(r.raw_channel));

      if (!CANON.includes(ch)) {
        (unknownByMonth[key] ||= []).push({ raw: String(r.raw_channel), norm: ch, amt });
      }
    }

    // WEB=0で total>0 の月
    const webZeroMonths: string[] = [];
    for (const m of months.map(ym)) {
      const webAmt = pivot[m]?.["WEB"] ?? 0;
      const tot = perMonthTotal[m] ?? 0;
      if (webAmt === 0 && tot > 0) webZeroMonths.push(m);
    }

    // 返却
    return NextResponse.json({
      ok: true,
      fy: { label, startISO, endISO },
      months: months.map(ym),
      pivot,
      perMonthTotal,
      webZeroMonths,
      canon: CANON,
      channelStats: Object.entries(channelStats).map(([k,v])=>({
        norm: k,
        sum: v.sum,
        first: v.first,
        last: v.last,
        rawVariants: Array.from(v.rawVariants)
      })),
      // 月別の未知チャネル（WEBが0の月を優先して見る）
      unknownByMonth,
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status:500 });
  }
}
