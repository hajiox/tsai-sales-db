// app/api/kpi-monthly/diag/route.ts
import { NextResponse } from "next/server";
import { Pool } from "pg";

export const runtime = "nodejs";

export async function GET() {
  try {
    const url = process.env.DATABASE_URL;
    if (!url) {
      return NextResponse.json(
        { ok: false, where: "env", message: "ENV DATABASE_URL is missing" },
        { status: 500 }
      );
    }

    const pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
    });

    try {
      const ping = await pool.query("select now() as now");
      // ビューを1行だけ確認（存在・権限・スキーマ名の誤りを検出）
      const sample = await pool.query(
        `select channel_code, fiscal_month, actual_amount_yen
         from kpi.kpi_sales_monthly_computed_v2
         order by fiscal_month desc
         limit 1`
      );

      await pool.end().catch(() => {});

      return NextResponse.json({
        ok: true,
        now: ping.rows?.[0]?.now ?? null,
        sample: sample.rows?.[0] ?? null,
        rows: sample.rowCount ?? 0,
      });
    } catch (e: any) {
      return NextResponse.json(
        {
          ok: false,
          where: "query",
          name: e?.name,
          message: e?.message,
          stack: e?.stack?.split("\n").slice(0, 6),
        },
        { status: 500 }
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        where: "route",
        name: e?.name,
        message: e?.message,
        stack: e?.stack?.split("\n").slice(0, 6),
      },
      { status: 500 }
    );
  }
}
