import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const CHANNELS = [
  { code: "SHOKU", label: "食のブランド館（道の駅）" },
  { code: "STORE", label: "会津ブランド館（店舗）" },
  { code: "WEB", label: "会津ブランド館（ネット販売）" },
  { code: "WHOLESALE", label: "卸売上・OEM" },
] as const;

function fyNow() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-12
  const fyStartYear = m >= 8 ? y : y - 1;
  const start = new Date(Date.UTC(fyStartYear, 7, 1)); // 8月
  const end = new Date(Date.UTC(fyStartYear + 1, 7, 1)); // 翌年8月
  const prevStart = new Date(Date.UTC(fyStartYear - 1, 7, 1));
  const prevEnd = new Date(Date.UTC(fyStartYear, 7, 1));
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    months.push(d.toISOString().slice(0, 10)); // YYYY-MM-DD(月初)
  }
  return {
    fyLabel: `FY${fyStartYear + 1 - 2000}`,
    fyStartISO: start.toISOString().slice(0, 10),
    fyEndISO: end.toISOString().slice(0, 10),
    prevStartISO: prevStart.toISOString().slice(0, 10),
    prevEndISO: prevEnd.toISOString().slice(0, 10),
    months,
  };
}

function ym(s: string) { return s.slice(0,7); }
function toNum(v: any) { return typeof v === "string" ? Number(v) : (v ?? 0); }

export async function GET() {
  try {
    const { fyLabel, fyStartISO, fyEndISO, prevStartISO, prevEndISO, months } = fyNow();

    // 当期実績
    const sqlCurr = `
      select channel_code, date_trunc('month', fiscal_month)::date as m, sum(actual_amount_yen) as amt
      from kpi.kpi_sales_monthly_computed_v2
      where fiscal_month >= $1 and fiscal_month < $2
      group by 1,2
    `;
    const curr = await pool.query(sqlCurr, [fyStartISO, fyEndISO]);

    // 前年度実績
    const sqlPrev = `
      select channel_code, date_trunc('month', fiscal_month)::date as m, sum(actual_amount_yen) as amt
      from kpi.kpi_sales_monthly_computed_v2
      where fiscal_month >= $1 and fiscal_month < $2
      group by 1,2
    `;
    const prev = await pool.query(sqlPrev, [prevStartISO, prevEndISO]);

    // 今年度目標（手入力）
    const targets = await pool.query(
      `select channel_code, month_date as m, target_amount_yen as amt
       from kpi.annual_targets_v1
       where fiscal_year_start = $1`,
       [fyStartISO]
    );

    // 営業目標（手入力）
    const goals = await pool.query(
      `select metric_code, month_date as m, value
       from kpi.sales_goals_manual_v1
       where fiscal_year_start = $1`,
       [fyStartISO]
    );

    // 連想に整形
    const currMap = new Map<string, number>();
    curr.rows.forEach(r => currMap.set(`${r.channel_code}|${r.m.toISOString().slice(0,10)}`, toNum(r.amt)));

    const prevMap = new Map<string, number>();
    prev.rows.forEach(r => prevMap.set(`${r.channel_code}|${r.m.toISOString().slice(0,10)}`, toNum(r.amt)));

    const tgtMap = new Map<string, number>();
    targets.rows.forEach(r => tgtMap.set(`${r.channel_code}|${r.m.toISOString().slice(0,10)}`, toNum(r.amt)));

    const goalMap = new Map<string, number>();
    goals.rows.forEach(r => goalMap.set(`${r.metric_code}|${r.m.toISOString().slice(0,10)}`, toNum(r.value)));

    // レスポンス組み立て
    const channelBlocks = CHANNELS.map(ch => {
      const rows = months.map(m => {
        const k = `${ch.code}|${m}`;
        const lastYearM = new Date(m); lastYearM.setUTCFullYear(lastYearM.getUTCFullYear() - 1);
        const prevK = `${ch.code}|${lastYearM.toISOString().slice(0,10)}`;
        const actual = currMap.get(k) ?? 0;
        const ly = prevMap.get(prevK) ?? 0;
        const target = tgtMap.get(k) ?? 0;
        const rate = target === 0 ? null : (actual / target) * 100;
        const yoy = ly === 0 ? null : (actual / ly) * 100;
        return { m, ym: ym(m), target, actual, last_year: ly, rate, yoy };
      });
      return { channel: ch, rows };
    });

    // 営業目標ブロック（6指標）
    const METRICS = [
      { code:"new_clients_target", label:"新規取引先・OEM開拓目標件数（目標）" },
      { code:"new_clients_actual", label:"新規取引先・OEM開拓（実績）" },
      { code:"proposals_target", label:"追加商品提案採用（目標）" },
      { code:"proposals_actual", label:"追加商品提案採用（実績）" },
      { code:"oem_target", label:"OEM製造（目標）" },
      { code:"oem_actual", label:"OEM製造（実績）" },
    ] as const;

    const salesGoals = METRICS.map(mt => ({
      metric: mt, rows: months.map(m => ({ m, ym: ym(m), val: goalMap.get(`${mt.code}|${m}`) ?? 0 }))
    }));

    return NextResponse.json({
      ok: true,
      fy: { label: fyLabel, start: fyStartISO, end: fyEndISO },
      months: months.map(m => ({ m, ym: ym(m) })),
      channels: CHANNELS,
      channelBlocks,
      salesGoals,
    });
  } catch (e: any) {
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status: 500 });
  }
}
