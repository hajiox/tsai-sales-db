// ================================================
// File: /app/api/kpi-annual/print/route.ts   ver.1
// Purpose: KPI 年間一覧（FY=8月開始）の印刷用HTMLを返す
// Usage : GET /api/kpi-annual/print?fy=2025  ← FY2025 (2025-08〜2026-07)
// Data  : kpi.kpi_sales_monthly_unified_v1 を唯一の参照元
// Runtime: nodejs / dynamic / no-store
// ================================================

import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parseFY(searchParams: URLSearchParams): number {
  const v = searchParams.get('fy');
  const n = v ? Number(v) : NaN;
  if (!Number.isFinite(n)) {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1; // 1-12
    // 8月以降は当年FY、7月までは前年FY
    return m >= 8 ? y : y - 1;
  }
  return n;
}

function fmtYen(n: number | null | undefined): string {
  const v = typeof n === 'number' ? n : 0;
  return v.toLocaleString('ja-JP');
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fy = parseFY(url.searchParams); // 例: 2025 → FY2025

  const client = await pool.connect();
  try {
    // 月別ピボット（行=月, 列=チャネル, 合計）
    const pivotSql = `
      WITH fy AS (
        SELECT make_date($1::int, 8, 1)::date AS fy_start,
               make_date(($1::int)+1, 8, 1)::date AS fy_end_excl
      ),
      months AS (
        SELECT generate_series(f.fy_start, f.fy_end_excl - interval '1 month', interval '1 month')::date AS m
        FROM fy f
      ),
      u AS (
        SELECT
          CASE
            WHEN UPPER(BTRIM(channel_code)) IN ('STORE','SHOP','RETAIL','STORE_FRONT') THEN 'STORE'
            WHEN UPPER(BTRIM(channel_code)) IN ('WHOLESALE','OEM') THEN 'WHOLESALE'
            ELSE UPPER(BTRIM(channel_code))
          END AS ch,
          (month)::date AS month,
          COALESCE(amount,0)::numeric AS amount
        FROM kpi.kpi_sales_monthly_unified_v1, fy
        WHERE month >= (SELECT fy_start FROM fy)
          AND month <  (SELECT fy_end_excl FROM fy)
      )
      SELECT
        m.m::date AS month,
        COALESCE(SUM(u.amount) FILTER (WHERE u.ch='WEB'),0)       AS web,
        COALESCE(SUM(u.amount) FILTER (WHERE u.ch='STORE'),0)     AS store,
        COALESCE(SUM(u.amount) FILTER (WHERE u.ch='SHOKU'),0)     AS shoku,
        COALESCE(SUM(u.amount) FILTER (WHERE u.ch='WHOLESALE'),0) AS wholesale,
        COALESCE(SUM(u.amount),0)                                 AS total_all
      FROM months m
      LEFT JOIN u ON u.month = m.m::date
      GROUP BY 1
      ORDER BY 1;
    `;

    // 年間合計（行=チャネル）
    const totalsSql = `
      WITH fy AS (
        SELECT make_date($1::int, 8, 1)::date AS fy_start,
               make_date(($1::int)+1, 8, 1)::date AS fy_end_excl
      ),
      u AS (
        SELECT
          CASE
            WHEN UPPER(BTRIM(channel_code)) IN ('STORE','SHOP','RETAIL','STORE_FRONT') THEN 'STORE'
            WHEN UPPER(BTRIM(channel_code)) IN ('WHOLESALE','OEM') THEN 'WHOLESALE'
            ELSE UPPER(BTRIM(channel_code))
          END AS ch,
          (month)::date AS month,
          COALESCE(amount,0)::numeric AS amount
        FROM kpi.kpi_sales_monthly_unified_v1, fy
        WHERE month >= (SELECT fy_start FROM fy)
          AND month <  (SELECT fy_end_excl FROM fy)
      )
      SELECT ch AS channel_code, SUM(amount)::numeric AS ytd_amount
      FROM u
      GROUP BY 1
      ORDER BY 1;
    `;

    const [pivotRes, totalsRes] = await Promise.all([
      client.query(pivotSql, [fy]),
      client.query(totalsSql, [fy]),
    ]);

    type PivotRow = {
      month: string;
      web: string | number;
      store: string | number;
      shoku: string | number;
      wholesale: string | number;
      total_all: string | number;
    };

    const rows: PivotRow[] = pivotRes.rows;
    const totalsMap = new Map<string, number>();
    for (const r of totalsRes.rows as { channel_code: string; ytd_amount: string | number }[]) {
      totalsMap.set(r.channel_code, Number(r.ytd_amount));
    }
    const totalAllYtd = rows.reduce((s, r) => s + Number(r.total_all), 0);

    // HTML（印刷CSS付き）
    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>KPI 年間一覧 印刷 | FY${fy}</title>
<style>
  :root { --w: 1080px; --fg:#111; --muted:#666; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans JP",
         "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN", Meiryo, sans-serif;
         color: var(--fg); margin: 24px; }
  .wrap { max-width: var(--w); margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  .meta { color: var(--muted); font-size: 12px; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: right; font-variant-numeric: tabular-nums; }
  th { background: #f7f7f7; }
  td.month, th.month { text-align: left; white-space: nowrap; }
  tfoot td { font-weight: 600; background: #fafafa; }
  .btnbar { display: flex; gap: 8px; margin: 16px 0; }
  .btn { border: 1px solid #ccc; padding: 6px 10px; border-radius: 6px; background: #fff; cursor: pointer; }
  @media print { .btnbar { display: none; } body { margin: 0; } }
</style>
</head>
<body>
  <div class="wrap">
    <h1>KPI 年間一覧（FY${fy}）</h1>
    <div class="meta">期間: ${fy}-08 〜 ${fy+1}-07 ／ 参照: kpi.kpi_sales_monthly_unified_v1</div>
    <div class="btnbar">
      <button class="btn" onclick="window.print()">印刷する</button>
    </div>
    <table>
      <thead>
        <tr>
          <th class="month">月</th>
          <th>WEB</th>
          <th>STORE</th>
          <th>SHOKU</th>
          <th>WHOLESALE</th>
          <th>合計</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => {
          const d = new Date(r.month);
          const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
          return `<tr>
            <td class="month">${ym}</td>
            <td>${fmtYen(Number(r.web))}</td>
            <td>${fmtYen(Number(r.store))}</td>
            <td>${fmtYen(Number(r.shoku))}</td>
            <td>${fmtYen(Number(r.wholesale))}</td>
            <td>${fmtYen(Number(r.total_all))}</td>
          </tr>`;
        }).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td class="month">年間合計</td>
          <td>${fmtYen(totalsMap.get('WEB') ?? 0)}</td>
          <td>${fmtYen(totalsMap.get('STORE') ?? 0)}</td>
          <td>${fmtYen(totalsMap.get('SHOKU') ?? 0)}</td>
          <td>${fmtYen(totalsMap.get('WHOLESALE') ?? 0)}</td>
          <td>${fmtYen(totalAllYtd)}</td>
        </tr>
      </tfoot>
    </table>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'QUERY_FAILED', message: e?.message ?? String(e) },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
