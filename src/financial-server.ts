// src/financial-server.ts
// REST API for "final" closing functions/views (PostgreSQL)
// --------------------------------------------------------
// env: DATABASE_URL=postgres://user:pass@host:5432/dbname
// run:  npm i express pg cors
//       npx ts-node src/financial-server.ts

import express from "express";
import cors from "cors";
import { Pool } from "pg";

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // keep-alive for serverless/edge too
  idleTimeoutMillis: 30_000,
  max: 10,
});

async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res.rows as T[];
  } finally {
    client.release();
  }
}

// ---- helpers --------------------------------------------------------------
const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
function parseMonth(d?: string | string[] | undefined): string | null {
  if (!d) return null;
  const v = Array.isArray(d) ? d[0] : d;
  if (v && isoDateRe.test(v)) return v;
  return null;
}
function httpTry(handler: (req: express.Request, res: express.Response) => Promise<void>) {
  return (req: express.Request, res: express.Response) =>
    handler(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: "internal_error", message: String(err?.message ?? err) });
    });
}

// ---- health ---------------------------------------------------------------
app.get("/api/health", httpTry(async (_req, res) => {
  const [{ now }] = await q<{ now: string }>("SELECT now()");
  res.json({ ok: true, now });
}));

// ---- overview (B/S + P/L totals) -----------------------------------------
app.get("/api/finance/overview", httpTry(async (req, res) => {
  const month = parseMonth(req.query.date);
  if (month) {
    const [row] = await q("SELECT * FROM public.financial_overview_final_v1($1::date)", [month]);
    res.json({ month, ...row });
  } else {
    const [row] = await q("SELECT * FROM public.v_financial_overview_final_latest");
    res.json(row);
  }
}));

// ---- B/S snapshot (detail) -----------------------------------------------
app.get("/api/finance/bs/snapshot", httpTry(async (req, res) => {
  const month = parseMonth(req.query.date);
  if (month) {
    const rows = await q("SELECT * FROM public.bs_snapshot_clean_final_v1($1::date)", [month]);
    res.json({ month, rows });
  } else {
    const rows = await q("SELECT * FROM public.v_bs_snapshot_clean_final_latest");
    res.json({ rows });
  }
}));

// ---- P/L snapshot (YTD or MONTH) -----------------------------------------
app.get("/api/finance/pl/snapshot", httpTry(async (req, res) => {
  const month = parseMonth(req.query.date);
  const scope = String(req.query.scope ?? "ytd").toLowerCase(); // 'ytd' | 'month'
  if (!month) {
    const rows = await q("SELECT * FROM public.v_pl_snapshot_clean_final_latest");
    res.json({ scope: "ytd", rows });
    return;
  }
  if (scope === "month") {
    const rows = await q("SELECT * FROM public.pl_snapshot_month_final_v1($1::date)", [month]);
    res.json({ month, scope: "month", rows });
  } else {
    const rows = await q("SELECT * FROM public.pl_snapshot_clean_final_v1($1::date)", [month]);
    res.json({ month, scope: "ytd", rows });
  }
}));

// ---- P/L totals (YTD) -----------------------------------------------------
app.get("/api/finance/pl/totals", httpTry(async (req, res) => {
  const month = parseMonth(req.query.date);
  if (month) {
    const [row] = await q("SELECT * FROM public.pl_totals_signed_final_v1($1::date)", [month]);
    res.json({ month, ...row });
  } else {
    const [row] = await q("SELECT * FROM public.v_financial_overview_final_latest");
    const { revenues_total, expenses_total, net_income_signed } = row as any;
    res.json({ ...row, revenues_total, expenses_total, net_income_signed });
  }
}));

// ---- Series for graphs (cached MV) ---------------------------------------
app.get("/api/finance/series", httpTry(async (req, res) => {
  const from = parseMonth(req.query.from);
  const to = parseMonth(req.query.to);
  let sql = "SELECT * FROM public.mv_financial_overview_final_series";
  const params: any[] = [];
  const where: string[] = [];
  if (from) { params.push(from); where.push(`month_start >= $${params.length}`); }
  if (to)   { params.push(to);   where.push(`month_start <= $${params.length}`); }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY month_start";
  const rows = await q(sql, params);
  res.json({ from: from ?? null, to: to ?? null, rows });
}));

// ---- Monthly P/L totals (series & latest) --------------------------------
app.get("/api/finance/pl/month-totals", httpTry(async (req, res) => {
  const rows = await q("SELECT * FROM public.v_pl_month_totals_final_series ORDER BY month_start");
  res.json({ rows });
}));
app.get("/api/finance/pl/month-totals/latest", httpTry(async (_req, res) => {
  const [row] = await q("SELECT * FROM public.v_pl_month_totals_final_latest");
  res.json(row);
}));

// ---- Trial balance health -------------------------------------------------
app.get("/api/finance/trial/latest", httpTry(async (_req, res) => {
  const [row] = await q("SELECT * FROM public.v_trial_balance_final_latest");
  res.json(row);
}));
app.get("/api/finance/trial/all", httpTry(async (_req, res) => {
  const rows = await q("SELECT * FROM public.v_trial_balance_final_all");
  res.json({ rows });
}));

// ---- Equity fallback flags ------------------------------------------------
app.get("/api/finance/equity-fallback-flags", httpTry(async (_req, res) => {
  const rows = await q("SELECT * FROM public.v_equity_fallback_flags");
  res.json({ rows });
}));

// ---- Refresh MVs ----------------------------------------------------------
app.post("/api/finance/refresh", httpTry(async (_req, res) => {
  await q("SELECT public.refresh_financial_mviews_final_v1()");
  res.json({ ok: true });
}));

// ---- Net income YTD (single value) ---------------------------------------
app.get("/api/finance/net-income", httpTry(async (req, res) => {
  const month = parseMonth(req.query.date);
  if (!month) return res.status(400).json({ error: "bad_request", message: "query 'date' (YYYY-MM-DD) is required" });
  const [row] = await q<{ ni: string }>("SELECT public.calc_net_income_ytd_final_v1($1::date) AS ni", [month]);
  res.json({ month, net_income_signed: row?.ni ?? null });
}));

// ---- start ---------------------------------------------------------------
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`financial-server listening on http://localhost:${PORT}`);
});
