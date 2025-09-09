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

type Check = { name: string; ok: boolean; info?: any; error?: string };

async function run(): Promise<{
  ok: boolean;
  checks: Check[];
}> {
  const checks: Check[] = [];

  // 0) 環境変数
  try {
    const url = process.env.DATABASE_URL || "";
    checks.push({
      name: "env.DATABASE_URL",
      ok: !!url,
      info: url ? `***${url.slice(-12)}` : "EMPTY",
    });
  } catch (e: any) {
    checks.push({ name: "env.DATABASE_URL", ok: false, error: e?.message || String(e) });
  }

  // 1) 接続
  try {
    const c = await pool.connect();
    c.release();
    checks.push({ name: "pg.connect", ok: true });
  } catch (e: any) {
    checks.push({ name: "pg.connect", ok: false, error: e?.message || String(e) });
    return { ok: false, checks }; // ここで止める
  }

  // 2) 基本情報
  try {
    const r = await pool.query(`select current_database() db, current_user usr, version() ver, now() now_utc`);
    checks.push({
      name: "pg.info",
      ok: true,
      info: { db: r.rows[0].db, usr: r.rows[0].usr, ver: String(r.rows[0].ver).split("\n")[0], now_utc: r.rows[0].now_utc },
    });
  } catch (e: any) {
    checks.push({ name: "pg.info", ok: false, error: e?.message || String(e) });
  }

  // 3) FYレンジ（8月開始）
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const fyStartYear = m >= 8 ? y : y - 1;
  const startISO = new Date(Date.UTC(fyStartYear, 7, 1)).toISOString().slice(0, 10);
  const endISO = new Date(Date.UTC(fyStartYear + 1, 7, 1)).toISOString().slice(0, 10);
  checks.push({ name: "fy.range", ok: true, info: { startISO, endISO, label: `FY${fyStartYear + 1 - 2000}` } });

  // 4) テーブル存在チェック
  const existsSql = `
    select table_schema, table_name
    from information_schema.tables
    where table_schema = 'kpi' and table_name in ('kpi_sales_monthly_final_v1','kpi_sales_monthly_computed_v2')
    order by table_name
  `;
  try {
    const r = await pool.query(existsSql);
    const names = r.rows.map((x: any) => `${x.table_schema}.${x.table_name}`);
    checks.push({ name: "tables.exists", ok: names.length === 2, info: names });
    if (names.length < 2) return { ok: false, checks };
  } catch (e: any) {
    checks.push({ name: "tables.exists", ok: false, error: e?.message || String(e) });
    return { ok: false, checks };
  }

  // 5) 最小集計（件数・期間・チャネル名）
  const mini = async (table: string) => {
    const q = `
      select
        min(fiscal_month)::date as min_month,
        max(fiscal_month)::date as max_month,
        count(*) as rows
      from ${table}
      where fiscal_month >= $1 and fiscal_month < $2
    `;
    const d = `
      select upper(btrim(channel_code)) as ch, sum(actual_amount_yen)::numeric as amt
      from ${table}
      where fiscal_month >= $1 and fiscal_month < $2
      group by 1
      order by 1
    `;
    const [a, b] = await Promise.all([pool.query(q, [startISO, endISO]), pool.query(d, [startISO, endISO])]);
    return { range: a.rows[0], channels: b.rows };
  };

  try {
    const fin = await mini("kpi.kpi_sales_monthly_final_v1");
    checks.push({ name: "final_v1.summary", ok: true, info: fin });
  } catch (e: any) {
    checks.push({ name: "final_v1.summary", ok: false, error: e?.message || String(e) });
    return { ok: false, checks };
  }

  try {
    const comp = await mini("kpi.kpi_sales_monthly_computed_v2");
    checks.push({ name: "computed_v2.summary", ok: true, info: comp });
  } catch (e: any) {
    checks.push({ name: "computed_v2.summary", ok: false, error: e?.message || String(e) });
    return { ok: false, checks };
  }

  // 6) final vs computed の FY 合計差（ざっくり）
  try {
    const delta = await pool.query(
      `
      with f as (
        select upper(btrim(channel_code)) ch, sum(actual_amount_yen)::numeric amt
        from kpi.kpi_sales_monthly_final_v1
        where fiscal_month >= $1 and fiscal_month < $2 group by 1
      ),
      c as (
        select upper(btrim(channel_code)) ch, sum(actual_amount_yen)::numeric amt
        from kpi.kpi_sales_monthly_computed_v2
        where fiscal_month >= $1 and fiscal_month < $2 group by 1
      )
      select coalesce(f.ch,c.ch) ch, coalesce(f.amt,0) - coalesce(c.amt,0) as delta
      from f full join c on f.ch = c.ch
      order by 1
      `,
      [startISO, endISO]
    );
    checks.push({ name: "fy.delta_by_channel", ok: true, info: delta.rows });
  } catch (e: any) {
    checks.push({ name: "fy.delta_by_channel", ok: false, error: e?.message || String(e) });
  }

  return { ok: true, checks };
}

export async function GET() {
  try {
    const result = await run();
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, fatal: e?.message || String(e) }, { status: 500 });
  }
}

