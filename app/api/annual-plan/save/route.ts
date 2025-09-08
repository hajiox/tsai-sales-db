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

/*
POST 期待ペイロード:
{
  fiscal_year_start: "YYYY-MM-DD",
  targets: [ { channel_code:"WEB", month_date:"YYYY-MM-01", target_amount_yen:12345 }, ... ],
  goals:   [ { metric_code:"new_clients_target", month_date:"YYYY-MM-01", value: 3 }, ... ]
}
*/
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { fiscal_year_start, targets = [], goals = [] } = body ?? {};
    if (!fiscal_year_start) throw new Error("fiscal_year_start is required");

    const client = await pool.connect();
    try {
      await client.query("begin");

      if (targets.length) {
        const sql = `
          insert into kpi.annual_targets_v1 (fiscal_year_start, channel_code, month_date, target_amount_yen)
          values ${targets.map((_,i)=>`($1, $${i*3+2}, $${i*3+3}, $${i*3+4})`).join(",")}
          on conflict (fiscal_year_start, channel_code, month_date)
          do update set target_amount_yen = excluded.target_amount_yen
        `;
        const params: any[] = [fiscal_year_start];
        for (const t of targets) params.push(t.channel_code, t.month_date, t.target_amount_yen ?? 0);
        await client.query(sql, params);
      }

      if (goals.length) {
        const sql = `
          insert into kpi.sales_goals_manual_v1 (fiscal_year_start, month_date, metric_code, value)
          values ${goals.map((_,i)=>`($1, $${i*3+2}, $${i*3+3}, $${i*3+4})`).join(",")}
          on conflict (fiscal_year_start, month_date, metric_code)
          do update set value = excluded.value
        `;
        const params: any[] = [fiscal_year_start];
        for (const g of goals) params.push(g.month_date, g.metric_code, g.value ?? 0);
        await client.query(sql, params);
      }

      await client.query("commit");
      return NextResponse.json({ ok:true });
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  } catch (e: any) {
    return NextResponse.json({ ok:false, error: e?.message || String(e) }, { status: 500 });
  }
}
